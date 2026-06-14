/**
 * MigrationService — orquesta el Sprint 1 de MIGRATION-CORE (Zenix Onboard):
 * crear job + subir archivo + parsear a staging + mapear a DTO canónico.
 *
 * Sprint 1 NO valida empalmes ni normaliza profundo (eso es Sprint 2). Deja las
 * filas en staging con su `mapped` listo y el job en `VALIDATING`.
 *
 * Patrón: el parseo CSV + el mapeo son funciones PURAS (csv-parser +
 * reservation-mapper); el adapter solo aporta el columnMapping (Strategy).
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { MigrationJobStatus, MigrationRowStatus, MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping, MigrationReservationDto } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SourcePmsAdapterRegistry } from './adapters/source-pms-adapter.registry'
import { parseCsv } from './adapters/csv-parser'
import { mapRows } from './adapters/reservation-mapper'
import { normalizeReservation, type NormalizeIssue } from './validation/normalize-reservation'
import { matchRoom, type ZenixRoomLite } from './validation/room-matcher'
import { findDuplicateGuests } from './validation/guest-dedup'
import { detectCollisions, type OccupancyClaim } from './collision/collision-detector'

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SourcePmsAdapterRegistry,
  ) {}

  /** Lista los PMS de origen soportados (para el dropdown del wizard). */
  listSources() {
    return this.registry.list()
  }

  /** Properties de la acting org (para elegir destino de la migración en la UI). */
  async listProperties(organizationId: string) {
    const props = await this.prisma.property.findMany({
      where: { organizationId },
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    })
    return props
  }

  /** Habitaciones de una property (para el selector de reasignación en el preview). */
  async listRooms(propertyId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { propertyId },
      select: { id: true, number: true, category: true },
      orderBy: { number: 'asc' },
    })
    return rooms
  }

  /**
   * Crea el job, decodifica el archivo, parsea a staging y —si el adapter trae
   * pre-mapeo (Cloudbeds) o el caller envía mapping (genérico)— mapea de una vez.
   * Idempotente por (propertyId, fileHash): re-subir el mismo archivo devuelve
   * el job existente en vez de duplicar.
   */
  async createJob(
    organizationId: string,
    propertyId: string,
    uploadedById: string,
    input: {
      sourceSystem: string
      fileName: string
      fileBase64: string
      mapping?: MigrationColumnMapping
    },
  ) {
    const adapter = this.registry.get(input.sourceSystem) // throws si no soportado

    // Decodifica base64 (tolera prefijo data-URI).
    const b64 = input.fileBase64.includes(',') ? input.fileBase64.split(',').pop()! : input.fileBase64
    let text: string
    try {
      text = Buffer.from(b64, 'base64').toString('utf-8')
    } catch {
      throw new BadRequestException('fileBase64 inválido (no es base64).')
    }
    if (!text.trim()) throw new BadRequestException('El archivo está vacío.')

    const fileHash = createHash('sha256').update(text).digest('hex')

    // Idempotencia: mismo archivo + property → devuelve el job existente.
    const existing = await this.prisma.migrationJob.findFirst({
      where: { propertyId, fileHash },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      this.logger.log(`[Migration] re-subida idempotente job=${existing.id} (fileHash match)`)
      return this.getJob(existing.id)
    }

    const parsed = parseCsv(text)
    if (parsed.headers.length === 0) throw new BadRequestException('El CSV no tiene encabezados legibles.')

    const job = await this.prisma.migrationJob.create({
      data: {
        organizationId,
        propertyId,
        sourceSystem: adapter.id,
        status: MigrationJobStatus.PARSING,
        fileName: input.fileName,
        fileHash,
        uploadedById,
        counts: { parsed: parsed.rows.length, ok: 0, warn: 0, error: 0, loaded: 0 },
      },
    })

    // Persiste cada fila cruda en staging (rawJson). El mapeo se aplica abajo.
    if (parsed.rows.length > 0) {
      await this.prisma.migrationStagingReservation.createMany({
        data: parsed.rows.map((row, i) => ({
          jobId: job.id,
          rowIndex: i,
          rawJson: row,
        })),
      })
    }

    // Mapeo: pre-mapeo del adapter (Cloudbeds) o el provisto por el caller (genérico).
    const mapping = adapter.defaultMapping() ?? input.mapping ?? null
    if (mapping) {
      await this.applyMappingInternal(job.id, mapping, parsed.rows)
      await this.validate(job.id) // Sprint 2: normaliza + detecta empalmes → PREVIEW_READY
    }

    this.logger.log(
      `[Migration] job=${job.id} source=${adapter.id} rows=${parsed.rows.length} mapped=${mapping ? 'yes' : 'pending-wizard'}`,
    )
    return this.getJob(job.id)
  }

  /** Aplica un mapeo (post-wizard del origen genérico) a las filas ya en staging. */
  async applyMapping(jobId: string, mapping: MigrationColumnMapping) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)
    const rows = await this.prisma.migrationStagingReservation.findMany({
      where: { jobId },
      orderBy: { rowIndex: 'asc' },
    })
    await this.applyMappingInternal(jobId, mapping, rows.map((r) => r.rawJson as Record<string, string>))
    await this.validate(jobId) // Sprint 2: normaliza + detecta empalmes → PREVIEW_READY
    return this.getJob(jobId)
  }

  private async applyMappingInternal(
    jobId: string,
    mapping: MigrationColumnMapping,
    rawRows: Record<string, string>[],
  ) {
    const { reservations } = mapRows(rawRows, mapping)
    // Update por fila (rowIndex ↔ posición). Volumen boutique → OK secuencial;
    // Sprint 2/4 puede batch-optimizar si hace falta.
    await this.prisma.$transaction(
      reservations.map((res, i) =>
        this.prisma.migrationStagingReservation.updateMany({
          where: { jobId, rowIndex: i },
          data: { mapped: res as unknown as object },
        }),
      ),
    )
    await this.prisma.migrationJob.update({
      where: { id: jobId },
      data: {
        status: MigrationJobStatus.VALIDATING, // Sprint 2 corre validación + empalmes
        columnMapping: mapping as unknown as object,
        counts: { parsed: rawRows.length, mapped: reservations.length, ok: 0, warn: 0, error: 0, loaded: 0 },
      },
    })
  }

  /**
   * Sprint 2 — normaliza + empareja habitación + DETECTA EMPALMES (★ D-MIG3) +
   * dedup de huéspedes. Persiste conflictos + estado por fila y deja el job en
   * PREVIEW_READY. Idempotente: re-validar borra los conflictos previos del job.
   */
  async validate(jobId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)

    // Inventario + moneda base de la property.
    const property = await this.prisma.property.findUnique({
      where: { id: job.propertyId },
      select: { legalEntity: { select: { baseCurrency: true } } },
    })
    const defaultCurrency = property?.legalEntity?.baseCurrency ?? 'MXN'
    const roomsRaw = await this.prisma.room.findMany({
      where: { propertyId: job.propertyId },
      select: { id: true, number: true, category: true, roomType: { select: { name: true, code: true } } },
    })
    const rooms: ZenixRoomLite[] = roomsRaw.map((r) => ({
      id: r.id,
      number: r.number,
      category: r.category as 'PRIVATE' | 'SHARED',
      roomTypeName: r.roomType?.name ?? null,
      roomTypeCode: r.roomType?.code ?? null,
    }))

    const stagingRows = await this.prisma.migrationStagingReservation.findMany({
      where: { jobId },
      orderBy: { rowIndex: 'asc' },
    })

    const conflicts: Array<{ type: string; severity: string; rowRefs: string[]; message: string }> = []
    const claims: OccupancyClaim[] = []
    const reservationsForDedup: MigrationReservationDto[] = []
    const rowUpdates: Array<{ rowIndex: number; status: string; issues: NormalizeIssue[] }> = []
    let ok = 0, warn = 0, error = 0

    const acceptRefs = new Set<string>() // filas con empalme aceptado por el consultor → conflicto no bloqueante
    let skipped = 0

    for (const row of stagingRows) {
      const ref = String(row.rowIndex)
      const resolution = row.resolution // PENDING | SKIP | ACCEPT | REASSIGN
      const mapped = row.mapped as MigrationReservationDto | null
      if (!mapped) { error++; rowUpdates.push({ rowIndex: row.rowIndex, status: MigrationRowStatus.ERROR, issues: [{ type: 'MISSING_DATES', message: 'Fila sin mapear.' }] }); continue }

      // SKIP: el consultor decidió no migrar esta fila → fuera de claims, dedup y
      // conflictos (no se cargará). Se cuenta aparte.
      if (resolution === 'SKIP') {
        skipped++
        rowUpdates.push({ rowIndex: row.rowIndex, status: MigrationRowStatus.OK, issues: [] })
        continue
      }
      if (resolution === 'ACCEPT') acceptRefs.add(ref)

      const norm = normalizeReservation(mapped, { defaultCurrency })
      reservationsForDedup.push(mapped)

      // Conflictos por issues de normalización.
      for (const issue of norm.issues) {
        conflicts.push({
          type: issue.type === 'NEGATIVE_AMOUNT' ? 'NEGATIVE_AMOUNT' : 'BAD_DATE',
          severity: issue.type === 'NEGATIVE_AMOUNT' ? 'WARN' : 'ERROR',
          rowRefs: [ref],
          message: issue.message,
        })
      }

      // Emparejar habitación + construir clave de recurso. REASSIGN sobreescribe
      // la habitación con la elegida por el consultor (targetRoomId).
      const match = matchRoom(mapped.roomLabel, mapped.roomTypeLabel, rooms)
      const reassignedRoom = resolution === 'REASSIGN' && row.targetRoomId
        ? rooms.find((r) => r.id === row.targetRoomId)
        : undefined
      if (!match.matched && !reassignedRoom && mapped.roomLabel) {
        conflicts.push({
          type: 'NO_ROOM_MATCH', severity: 'WARN', rowRefs: [ref],
          message: `La habitación "${mapped.roomLabel}" no existe en Zenix — reasigna en el preview.`,
        })
      }

      // Clave de recurso: privada emparejada → por roomId (compara con existentes);
      // dorm o sin emparejar → por etiqueta del origen (distingue camas).
      if (norm.occupies) {
        const effRoomId = reassignedRoom?.id ?? (match.matched ? match.roomId : null)
        const effShared = reassignedRoom ? reassignedRoom.category === 'SHARED' : match.shared
        const resourceKey = effRoomId && !effShared
          ? `room:${effRoomId}`
          : match.resourceKey ? `label:${match.resourceKey}` : ''
        if (resourceKey) {
          claims.push({ ref, resourceKey, shared: effShared, checkIn: mapped.checkIn, checkOut: mapped.checkOut })
        }
      }

      const status = norm.status
      if (status === MigrationRowStatus.OK) ok++
      else if (status === MigrationRowStatus.WARN) warn++
      else error++
      rowUpdates.push({ rowIndex: row.rowIndex, status, issues: norm.issues })
    }

    // Reservas Zenix existentes (activas) para la pasada staging-vs-existente.
    const existingStays = await this.prisma.guestStay.findMany({
      where: { propertyId: job.propertyId, deletedAt: null, cancelledAt: null, noShowAt: null },
      select: { id: true, roomId: true, checkinAt: true, scheduledCheckout: true },
    })
    const existingClaims: OccupancyClaim[] = existingStays.map((s) => ({
      ref: `existing:${s.id}`,
      resourceKey: `room:${s.roomId}`,
      shared: false,
      checkIn: s.checkinAt.toISOString().slice(0, 10),
      checkOut: s.scheduledCheckout.toISOString().slice(0, 10),
    }))

    // ★ DETECCIÓN DE EMPALMES. Si alguna fila del par fue ACCEPT por el
    // consultor (empalme histórico aceptado con razón), el conflicto baja a WARN
    // (no bloquea el load).
    const collisions = detectCollisions(claims, existingClaims)
    for (const c of collisions) {
      const accepted = c.refs.some((r) => acceptRefs.has(r))
      conflicts.push({ type: c.type, severity: accepted ? 'WARN' : 'ERROR', rowRefs: c.refs, message: c.message })
    }

    // Dedup de huéspedes (WARN).
    const dupGroups = findDuplicateGuests(reservationsForDedup, (_r, i) => String(stagingRows[i]?.rowIndex ?? i))
    for (const g of dupGroups) {
      conflicts.push({ type: 'DUP_GUEST', severity: 'WARN', rowRefs: g.refs, message: `Huésped duplicado "${g.displayName}" en ${g.refs.length} reservas.` })
    }

    // Persistencia idempotente: borra conflictos previos + reescribe estado de filas.
    await this.prisma.$transaction([
      this.prisma.migrationConflict.deleteMany({ where: { jobId } }),
      ...(conflicts.length > 0
        ? [this.prisma.migrationConflict.createMany({
            data: conflicts.map((c) => ({ jobId, type: c.type, severity: c.severity, rowRefs: c.rowRefs, message: c.message })),
          })]
        : []),
      ...rowUpdates.map((u) =>
        this.prisma.migrationStagingReservation.updateMany({
          where: { jobId, rowIndex: u.rowIndex },
          data: { validationStatus: u.status, issues: u.issues as unknown as object },
        }),
      ),
      this.prisma.migrationJob.update({
        where: { id: jobId },
        data: {
          status: MigrationJobStatus.PREVIEW_READY,
          counts: {
            parsed: stagingRows.length, ok, warn, error, skipped,
            conflicts: conflicts.length,
            overlaps: collisions.length,
            // blocking = conflictos ERROR sin resolver → el gate de Sprint 4 los exige en 0.
            blocking: conflicts.filter((c) => c.severity === 'ERROR').length,
            loaded: 0,
          },
        },
      }),
    ])

    this.logger.log(
      `[Migration] validate job=${jobId} rows=${stagingRows.length} ok=${ok} warn=${warn} error=${error} empalmes=${collisions.length} conflictos=${conflicts.length}`,
    )
    return this.getConflicts(jobId)
  }

  /** Conflictos del job agrupados por tipo (para el preview/dry-run). */
  async getConflicts(jobId: string) {
    const all = await this.prisma.migrationConflict.findMany({ where: { jobId }, orderBy: { type: 'asc' } })
    const byType: Record<string, number> = {}
    for (const c of all) byType[c.type] = (byType[c.type] ?? 0) + 1
    return {
      jobId,
      total: all.length,
      byType,
      conflicts: all.map((c) => ({
        id: c.id, type: c.type, severity: c.severity, rowRefs: c.rowRefs, message: c.message,
      })),
    }
  }

  /**
   * Sprint 3 — resuelve un conflicto a nivel fila (skip / aceptar empalme con
   * razón / reasignar habitación) SIN tocar producción. Re-valida el job para
   * recomputar conflictos y counts (idempotente). Verifica IDOR vía la org.
   */
  async resolveRow(
    jobId: string,
    rowIndex: number,
    organizationId: string,
    dto: { action: 'SKIP' | 'ACCEPT' | 'REASSIGN'; targetRoomId?: string; reason?: string },
  ) {
    const row = await this.prisma.migrationStagingReservation.findFirst({
      where: { jobId, rowIndex },
      select: { id: true, jobId: true, job: { select: { organizationId: true, propertyId: true, status: true } } },
    })
    if (!row) throw new NotFoundException(`Fila ${rowIndex} del job ${jobId} no encontrada`)
    if (row.job.organizationId !== organizationId) throw new NotFoundException(`Fila no encontrada`)
    if (row.job.status === MigrationJobStatus.COMPLETED || row.job.status === MigrationJobStatus.LOADING) {
      throw new BadRequestException('No se puede modificar un job ya cargado o en carga.')
    }

    if (dto.action === 'REASSIGN') {
      if (!dto.targetRoomId) throw new BadRequestException('REASSIGN requiere targetRoomId.')
      const target = await this.prisma.room.findFirst({
        where: { id: dto.targetRoomId, propertyId: row.job.propertyId },
        select: { id: true },
      })
      if (!target) throw new BadRequestException('La habitación destino no pertenece a esta propiedad.')
    }
    if (dto.action === 'ACCEPT' && (!dto.reason || dto.reason.trim().length < 5)) {
      throw new BadRequestException('Aceptar un empalme requiere una razón (≥5 caracteres) para el audit.')
    }

    await this.prisma.migrationStagingReservation.update({
      where: { id: row.id },
      data: {
        resolution: dto.action,
        targetRoomId: dto.action === 'REASSIGN' ? dto.targetRoomId : null,
        resolutionReason: dto.reason?.trim() || null,
      },
    })
    await this.validate(jobId) // recomputa conflictos + counts con la resolución aplicada
    return this.getJob(jobId)
  }

  /** Descarta un job completo (solo pre-load). Cascade borra staging + conflictos. */
  async deleteJob(jobId: string, organizationId: string) {
    const job = await this.prisma.migrationJob.findUnique({
      where: { id: jobId },
      select: { id: true, organizationId: true, status: true },
    })
    if (!job) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)
    if (job.organizationId !== organizationId) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)
    if (job.status === MigrationJobStatus.COMPLETED || job.status === MigrationJobStatus.LOADING) {
      throw new BadRequestException('No se puede descartar un job ya cargado a producción.')
    }
    await this.prisma.migrationJob.delete({ where: { id: jobId } })
    return { deleted: true, jobId }
  }

  /** Detalle del job + counts + headers detectados + muestra de filas mapeadas. */
  async getJob(jobId: string) {
    const job = await this.prisma.migrationJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)
    const total = await this.prisma.migrationStagingReservation.count({ where: { jobId } })
    const sampleRows = await this.prisma.migrationStagingReservation.findMany({
      where: { jobId },
      orderBy: { rowIndex: 'asc' },
      take: 5,
    })
    const detectedHeaders =
      sampleRows.length > 0 ? Object.keys(sampleRows[0].rawJson as Record<string, unknown>) : []
    return {
      id: job.id,
      organizationId: job.organizationId,
      propertyId: job.propertyId,
      sourceSystem: job.sourceSystem,
      status: job.status,
      fileName: job.fileName,
      counts: job.counts,
      columnMapping: job.columnMapping,
      detectedHeaders,
      totalRows: total,
      sample: sampleRows.map((r) => ({ rowIndex: r.rowIndex, raw: r.rawJson, mapped: r.mapped })),
      createdAt: job.createdAt,
    }
  }

  /** Lista jobs de una property (para la pantalla de migraciones de Nova). */
  async listJobs(propertyId: string) {
    const jobs = await this.prisma.migrationJob.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return jobs.map((j) => ({
      id: j.id,
      sourceSystem: j.sourceSystem,
      status: j.status,
      fileName: j.fileName,
      counts: j.counts,
      createdAt: j.createdAt,
    }))
  }

  /** Verifica que un job pertenece a la acting org (IDOR guard). */
  async assertJobInOrg(jobId: string, organizationId: string) {
    const job = await this.prisma.migrationJob.findUnique({
      where: { id: jobId },
      select: { organizationId: true },
    })
    if (!job) throw new NotFoundException(`MigrationJob ${jobId} no encontrado`)
    if (job.organizationId !== organizationId) {
      throw new NotFoundException(`MigrationJob ${jobId} no encontrado`) // no filtrar existencia cross-tenant
    }
  }

  /** Sources soportados (helper para validación). */
  get supportedSources(): string[] {
    return Object.values(MigrationSource)
  }
}
