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
import { MigrationJobStatus, MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { SourcePmsAdapterRegistry } from './adapters/source-pms-adapter.registry'
import { parseCsv } from './adapters/csv-parser'
import { mapRows } from './adapters/reservation-mapper'

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
