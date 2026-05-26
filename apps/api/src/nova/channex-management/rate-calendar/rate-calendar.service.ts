/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 6.
 *
 * RateCalendarService — el CORE del Command Center.
 *
 * Tres responsabilidades:
 *
 *   1. **getMatrix(propertyId, dateFrom, dateTo)** — armar el grid
 *      `días × rate plans` con:
 *        · rate per [ratePlan, date] (Channex `listRestrictions` + fallback
 *          a `defaultRate` del mapping local)
 *        · restrictions per cell (minStay/maxStay/CTA/CTD/stopSell)
 *        · rateCap por rate plan (visible al supervisor para entender bounds)
 *        · parityIssues per día (cross rate-plan dentro del mismo room type
 *          si max-min spread > `PropertySettings.rateParityThresholdPct`).
 *
 *   2. **bulkUpdate(propertyId, entries[], actor)** — bulk PATCH:
 *        a. Valida cada entry: ratePlanId pertenece al property + cap floor/ceiling
 *        b. Emite UN solo `CHANNEX_RESTRICTION_UPDATED` event con todas las
 *           entries → ChannexOutboundBuilder encola → Worker pushea respetando
 *           rate limit 20 ARI/min (D-CHX-OUT-1, D-CHX-OUT-5).
 *        c. Escribe AuditLog `CHANNEX_RATE_CALENDAR_BULK_UPDATE` con resumen.
 *
 *   3. **applyDayOfWeekTemplate(...)** — helper server-side. Recibe
 *      `weekdayRates: { mo, tu, we, th, fr, sa, su }` + rango de fechas + ratePlanId
 *      → expande a entries[] uno por día. Devuelve la lista (el caller decide si
 *      pasarla a bulkUpdate o solo previsualizar — patrón Mews "Rate calendar
 *      template preview").
 *
 * Por qué un solo event para bulk (no N events): cada event escribe 1 row
 * outbox → 1 HTTP push. Bulk semánticamente debe ser 1 push con array de
 * entries (Channex AP-4 — singular calls están prohibidos en cert).
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import {
  ChannexGateway,
  ChannexRestrictionEntry,
  ChannexWeekday,
} from '../../../integrations/channex/channex.gateway'
import {
  CHANNEX_RESTRICTION_UPDATED,
  ChannexRestrictionUpdatedEvent,
} from '../../../integrations/channex/outbound/channex-outbound-events'
import { AuditLogService } from '../../audit/audit-log.service'

// ── Public types ────────────────────────────────────────────────────────────

export interface RateCalendarCell {
  date: string // YYYY-MM-DD
  ratePlanId: string // Channex rate plan id
  rate: number | null // null = no override; fallback al defaultRate del plan
  rateSource: 'CHANNEX' | 'DEFAULT' | 'UNSET'
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
  // True si la cell viola los caps (rate < min OR rate > max). UI muestra
  // border red cuando true.
  capViolation?: boolean
}

export interface RateCalendarRatePlanRow {
  ratePlanId: string
  channexRatePlanId: string
  channexRoomTypeId: string
  title: string
  currency: string
  defaultRate: number
  defaultOccupancy: number
  // Caps (null si el supervisor de la org NO tiene restricciones).
  rateCapMin: number | null
  rateCapMax: number | null
  rateCapReason: string | null
  cells: RateCalendarCell[]
}

export interface RateCalendarParityIssue {
  date: string
  channexRoomTypeId: string
  spreadPct: number // (max − min) / min × 100
  minRate: number
  maxRate: number
  ratePlanIds: string[] // los rate plans del room type ese día
}

export interface RateCalendarMatrix {
  propertyId: string
  dateFrom: string
  dateTo: string
  currency: string // primary currency del primer rate plan (asumimos uniforme per property)
  parityThresholdPct: number
  fromChannex: boolean // false si Channex no respondió → matriz armada solo con locales
  ratePlans: RateCalendarRatePlanRow[]
  parityIssues: RateCalendarParityIssue[]
}

// Single entry in a bulk update PATCH.
export interface RateCalendarBulkEntry {
  ratePlanId: string // channexRatePlanId
  date: string // YYYY-MM-DD
  rate?: number // nuevo rate (decimal, USD/MXN/etc según currency del plan)
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
}

export interface DayOfWeekTemplate {
  ratePlanId: string
  dateFrom: string // YYYY-MM-DD inclusive
  dateTo: string // YYYY-MM-DD inclusive
  weekdayRates: Partial<Record<ChannexWeekday, number>>
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RateCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly gateway: ChannexGateway,
    private readonly events: EventEmitter2,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── 1. Matrix aggregator ─────────────────────────────────────────────────

  async getMatrix(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<RateCalendarMatrix> {
    this.assertValidDateRange(dateFrom, dateTo)
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    // 1. Load rate plan mappings + caps + property settings en paralelo
    const [mappings, settings] = await Promise.all([
      this.prisma.channexRatePlanMapping.findMany({
        where: { propertyId, organizationId: orgId, isActive: true },
        include: { rateCap: true },
        orderBy: [{ channexRoomTypeId: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.propertySettings.findUnique({
        where: { propertyId },
        select: { channexPropertyId: true, rateParityThresholdPct: true },
      }),
    ])

    if (mappings.length === 0) {
      // Property aún sin rate plans seteados → matriz vacía coherente.
      return {
        propertyId,
        dateFrom,
        dateTo,
        currency: 'USD',
        parityThresholdPct: settings?.rateParityThresholdPct ?? 5,
        fromChannex: false,
        ratePlans: [],
        parityIssues: [],
      }
    }

    const channexPropertyId = settings?.channexPropertyId
    const parityThreshold = settings?.rateParityThresholdPct ?? 5

    // 2. Pull rates+restrictions per rate plan desde Channex (paralelo).
    //    Best-effort §31: si Channex falla, armamos con defaults locales.
    let fromChannex = true
    const restrictionsByPlan = new Map<string, Map<string, RateCalendarCell>>()

    if (channexPropertyId) {
      const pulls = await Promise.all(
        mappings.map((m) =>
          this.gateway.listRestrictions({
            propertyId: channexPropertyId,
            ratePlanId: m.channexRatePlanId,
            dateFrom,
            dateTo,
          }),
        ),
      )
      pulls.forEach((pull, i) => {
        if (!pull.fromChannex) fromChannex = false
        const planId = mappings[i].channexRatePlanId
        const dateMap = new Map<string, RateCalendarCell>()
        for (const row of pull.rows) {
          const rateNum = row.rate != null ? Number(row.rate) : null
          dateMap.set(row.date, {
            date: row.date,
            ratePlanId: planId,
            rate: rateNum,
            rateSource: rateNum != null ? 'CHANNEX' : 'UNSET',
            minStayArrival: row.min_stay_arrival,
            minStayThrough: row.min_stay_through,
            maxStay: row.max_stay,
            closedToArrival: row.closed_to_arrival,
            closedToDeparture: row.closed_to_departure,
            stopSell: row.stop_sell,
          })
        }
        restrictionsByPlan.set(planId, dateMap)
      })
    } else {
      fromChannex = false
    }

    // 3. Build rows: una por rate plan, expandir todas las fechas del rango.
    const allDates = generateDateRange(dateFrom, dateTo)
    const ratePlanRows: RateCalendarRatePlanRow[] = mappings.map((m) => {
      const planCells = restrictionsByPlan.get(m.channexRatePlanId) ?? new Map()
      const defaultRate = Number(m.defaultRate)
      const capMin = m.rateCap?.rateCapMin != null ? Number(m.rateCap.rateCapMin) : null
      const capMax = m.rateCap?.rateCapMax != null ? Number(m.rateCap.rateCapMax) : null

      const cells: RateCalendarCell[] = allDates.map((date) => {
        const fromChannexCell = planCells.get(date)
        if (fromChannexCell) {
          const cellRate = fromChannexCell.rate
          return {
            ...fromChannexCell,
            capViolation: cellRate != null && violatesCap(cellRate, capMin, capMax),
          }
        }
        // Fallback: no entry from Channex → use defaultRate as advisory baseline.
        return {
          date,
          ratePlanId: m.channexRatePlanId,
          rate: defaultRate,
          rateSource: 'DEFAULT',
          capViolation: violatesCap(defaultRate, capMin, capMax),
        }
      })

      return {
        ratePlanId: m.id,
        channexRatePlanId: m.channexRatePlanId,
        channexRoomTypeId: m.channexRoomTypeId,
        title: m.title,
        currency: m.currency,
        defaultRate,
        defaultOccupancy: m.defaultOccupancy,
        rateCapMin: capMin,
        rateCapMax: capMax,
        rateCapReason: m.rateCap?.reason ?? null,
        cells,
      }
    })

    // 4. Parity issues — por (roomType, date), spread % entre rate plans
    const parityIssues = this.computeParityIssues(ratePlanRows, allDates, parityThreshold)

    return {
      propertyId,
      dateFrom,
      dateTo,
      currency: mappings[0].currency,
      parityThresholdPct: parityThreshold,
      fromChannex,
      ratePlans: ratePlanRows,
      parityIssues,
    }
  }

  // ─── 2. Bulk update ────────────────────────────────────────────────────────

  async bulkUpdate(
    propertyId: string,
    entries: RateCalendarBulkEntry[],
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER',
    onBehalfOfUserId?: string,
    reason?: string,
  ): Promise<{ accepted: number; rejected: { entry: RateCalendarBulkEntry; reason: string }[] }> {
    if (entries.length === 0) {
      throw new BadRequestException('bulkUpdate requiere al menos 1 entry')
    }
    if (entries.length > 5000) {
      // Channex restriction endpoint admite ~10k entries per call según docs,
      // pero la latencia + memoria del worker se degrada >5k. Cap defensivo.
      throw new BadRequestException(
        `bulkUpdate cap 5000 entries por request — recibido ${entries.length}. Particionar en múltiples requests.`,
      )
    }

    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    // 1. Carga TODOS los rate plans + caps del property en una sola query (eficiente).
    const referencedPlanIds = Array.from(new Set(entries.map((e) => e.ratePlanId)))
    const mappings = await this.prisma.channexRatePlanMapping.findMany({
      where: {
        propertyId,
        organizationId: orgId,
        channexRatePlanId: { in: referencedPlanIds },
        isActive: true,
      },
      include: { rateCap: true },
    })
    const mappingByPlanId = new Map(mappings.map((m) => [m.channexRatePlanId, m]))

    // 2. Validar cada entry. Si alguna falla, todo el bulk se rechaza (transactional
    //    semantics — patrón Cloudbeds "Rate calendar bulk edit fails atomic").
    const rejected: { entry: RateCalendarBulkEntry; reason: string }[] = []
    const accepted: RateCalendarBulkEntry[] = []

    for (const entry of entries) {
      const mapping = mappingByPlanId.get(entry.ratePlanId)
      if (!mapping) {
        rejected.push({
          entry,
          reason: `Rate plan ${entry.ratePlanId} no pertenece a property ${propertyId} o no está activo`,
        })
        continue
      }
      // Validar caps si rate viene en el entry
      if (entry.rate !== undefined) {
        const min = mapping.rateCap?.rateCapMin != null ? Number(mapping.rateCap.rateCapMin) : null
        const max = mapping.rateCap?.rateCapMax != null ? Number(mapping.rateCap.rateCapMax) : null
        if (violatesCap(entry.rate, min, max)) {
          rejected.push({
            entry,
            reason: capViolationMessage(entry.rate, min, max, mapping.rateCap?.reason),
          })
          continue
        }
      }
      // Validar fechas
      if (!isYmd(entry.date)) {
        rejected.push({ entry, reason: `date inválido (esperado YYYY-MM-DD): "${entry.date}"` })
        continue
      }
      // Al menos UN restriction field debe venir (Channex pushRestrictions
      // throws si todos vienen vacíos, AP cert violation).
      if (!hasAtLeastOneField(entry)) {
        rejected.push({
          entry,
          reason: 'Entry sin restriction field — al menos rate/minStay*/maxStay/closedTo*/stopSell debe venir',
        })
        continue
      }
      accepted.push(entry)
    }

    if (rejected.length > 0) {
      // Atomic semantics: si hay rechazos, abort total — escribimos audit FAILURE
      // y devolvemos lista de rejected con razones.
      await this.auditLog.write({
        organizationId: orgId,
        actorRealId: actorId,
        actorRealRole: actorRole,
        onBehalfOfId: onBehalfOfUserId,
        onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
        action: 'CHANNEX_RATE_CALENDAR_BULK_UPDATE',
        target: propertyId,
        payload: {
          propertyId,
          submittedCount: entries.length,
          rejectedCount: rejected.length,
          firstRejectionReason: rejected[0].reason,
        },
        status: 'FAILURE',
        errorMessage: `Bulk rechazado: ${rejected.length} de ${entries.length} entries inválidas`,
        reason,
      })
      return { accepted: 0, rejected }
    }

    // 3. Emit single event → outbox → worker → Channex pushRestrictions.
    const channexEntries: ChannexRestrictionEntry[] = accepted.map((e) => ({
      propertyId: channexPropertyId,
      ratePlanId: e.ratePlanId,
      date: e.date,
      ...(e.rate !== undefined ? { rate: e.rate } : {}),
      ...(e.minStayArrival !== undefined ? { minStayArrival: e.minStayArrival } : {}),
      ...(e.minStayThrough !== undefined ? { minStayThrough: e.minStayThrough } : {}),
      ...(e.maxStay !== undefined ? { maxStay: e.maxStay } : {}),
      ...(e.closedToArrival !== undefined ? { closedToArrival: e.closedToArrival } : {}),
      ...(e.closedToDeparture !== undefined ? { closedToDeparture: e.closedToDeparture } : {}),
      ...(e.stopSell !== undefined ? { stopSell: e.stopSell } : {}),
    }))

    const event: ChannexRestrictionUpdatedEvent = {
      propertyId: channexPropertyId,
      entries: channexEntries,
    }
    this.events.emit(CHANNEX_RESTRICTION_UPDATED, event)

    // 4. Audit log SUCCESS — payload trae resumen (no entries completos para
    //    no inflar la tabla; las entries van en outbox.payload).
    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_RATE_CALENDAR_BULK_UPDATE',
      target: propertyId,
      payload: {
        propertyId,
        channexPropertyId,
        acceptedCount: accepted.length,
        affectedRatePlans: Array.from(new Set(accepted.map((e) => e.ratePlanId))),
        dateRange: {
          from: accepted.reduce((m, e) => (e.date < m ? e.date : m), accepted[0].date),
          to: accepted.reduce((m, e) => (e.date > m ? e.date : m), accepted[0].date),
        },
        fieldsChanged: this.summarizeFieldsChanged(accepted),
      },
      status: 'SUCCESS',
      reason,
    })

    return { accepted: accepted.length, rejected: [] }
  }

  // ─── 3. Day-of-week template helper ────────────────────────────────────────

  /**
   * Expande un template de día-de-semana en N entries (una por día del rango).
   * No persiste nada — devuelve el array para que el caller previsualice o
   * lo pase a `bulkUpdate`. Patrón Mews "Apply template".
   *
   * Si un día de la semana NO está en `weekdayRates`, ese día se omite del
   * resultado (operador decide qué días aplicar).
   */
  expandTemplate(template: DayOfWeekTemplate): RateCalendarBulkEntry[] {
    this.assertValidDateRange(template.dateFrom, template.dateTo)
    const dates = generateDateRange(template.dateFrom, template.dateTo)
    const out: RateCalendarBulkEntry[] = []
    for (const date of dates) {
      const weekday = isoWeekdayFromYmd(date)
      const rate = template.weekdayRates[weekday]
      if (rate === undefined) continue
      out.push({ ratePlanId: template.ratePlanId, date, rate })
    }
    return out
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async assertPropertyInOrg(propertyId: string, orgId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    })
    if (!property) {
      throw new NotFoundException(
        `Property ${propertyId} no existe o no pertenece al acting org`,
      )
    }
  }

  private async resolveChannexPropertyId(propertyId: string): Promise<string> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { channexPropertyId: true },
    })
    if (!settings?.channexPropertyId) {
      throw new ForbiddenException(
        `Property ${propertyId} no tiene channexPropertyId. Configurar primero via wizard.`,
      )
    }
    return settings.channexPropertyId
  }

  private assertValidDateRange(from: string, to: string): void {
    if (!isYmd(from) || !isYmd(to)) {
      throw new BadRequestException(
        `Fechas inválidas, formato esperado YYYY-MM-DD. Recibido from="${from}" to="${to}"`,
      )
    }
    if (from > to) {
      throw new BadRequestException(`Rango inválido — from (${from}) debe ser ≤ to (${to})`)
    }
    // Cap defensivo: 365 días — más que eso degrada UI + queries.
    const days = generateDateRange(from, to).length
    if (days > 365) {
      throw new BadRequestException(
        `Rango ${days} días excede el cap 365 — particionar la consulta`,
      )
    }
  }

  private computeParityIssues(
    rows: RateCalendarRatePlanRow[],
    dates: string[],
    thresholdPct: number,
  ): RateCalendarParityIssue[] {
    const issues: RateCalendarParityIssue[] = []
    // Group rate plans by channexRoomTypeId (parity es intra-room-type)
    const byRoomType = new Map<string, RateCalendarRatePlanRow[]>()
    for (const r of rows) {
      const arr = byRoomType.get(r.channexRoomTypeId) ?? []
      arr.push(r)
      byRoomType.set(r.channexRoomTypeId, arr)
    }
    for (const [roomTypeId, rtRows] of byRoomType) {
      if (rtRows.length < 2) continue // parity solo aplica si ≥2 rate plans
      for (const date of dates) {
        const ratesThisDay: Array<{ planId: string; rate: number }> = []
        for (const r of rtRows) {
          const cell = r.cells.find((c) => c.date === date)
          if (cell?.rate != null) ratesThisDay.push({ planId: r.channexRatePlanId, rate: cell.rate })
        }
        if (ratesThisDay.length < 2) continue
        const min = Math.min(...ratesThisDay.map((x) => x.rate))
        const max = Math.max(...ratesThisDay.map((x) => x.rate))
        if (min <= 0) continue // evitar /0
        const spread = ((max - min) / min) * 100
        if (spread > thresholdPct) {
          issues.push({
            date,
            channexRoomTypeId: roomTypeId,
            spreadPct: Number(spread.toFixed(2)),
            minRate: min,
            maxRate: max,
            ratePlanIds: ratesThisDay.map((x) => x.planId),
          })
        }
      }
    }
    return issues
  }

  private summarizeFieldsChanged(entries: RateCalendarBulkEntry[]): Record<string, number> {
    const summary: Record<string, number> = {}
    for (const e of entries) {
      if (e.rate !== undefined) summary.rate = (summary.rate ?? 0) + 1
      if (e.minStayArrival !== undefined) summary.minStayArrival = (summary.minStayArrival ?? 0) + 1
      if (e.minStayThrough !== undefined) summary.minStayThrough = (summary.minStayThrough ?? 0) + 1
      if (e.maxStay !== undefined) summary.maxStay = (summary.maxStay ?? 0) + 1
      if (e.closedToArrival !== undefined) summary.closedToArrival = (summary.closedToArrival ?? 0) + 1
      if (e.closedToDeparture !== undefined)
        summary.closedToDeparture = (summary.closedToDeparture ?? 0) + 1
      if (e.stopSell !== undefined) summary.stopSell = (summary.stopSell ?? 0) + 1
    }
    return summary
  }
}

// ── Pure helpers (exportadas para tests) ────────────────────────────────────

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function generateDateRange(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

// Map ISO date YYYY-MM-DD → Channex weekday code ('mo'..'su').
// Uses UTC parsing to avoid TZ drift (date strings are calendar dates).
export function isoWeekdayFromYmd(ymd: string): ChannexWeekday {
  const d = new Date(`${ymd}T00:00:00Z`)
  const dayIdx = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const map: ChannexWeekday[] = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa']
  return map[dayIdx]
}

export function violatesCap(rate: number, min: number | null, max: number | null): boolean {
  if (min != null && rate < min) return true
  if (max != null && rate > max) return true
  return false
}

export function capViolationMessage(
  rate: number,
  min: number | null,
  max: number | null,
  reason: string | null | undefined,
): string {
  const bounds: string[] = []
  if (min != null) bounds.push(`min=${min}`)
  if (max != null) bounds.push(`max=${max}`)
  const reasonStr = reason ? ` Cap definido por consultor: "${reason}".` : ''
  return `Rate ${rate} fuera de los caps definidos (${bounds.join(', ')}).${reasonStr} Contactar consultor para ajustar caps si el cambio es legítimo.`
}

function hasAtLeastOneField(e: RateCalendarBulkEntry): boolean {
  return (
    e.rate !== undefined ||
    e.minStayArrival !== undefined ||
    e.minStayThrough !== undefined ||
    e.maxStay !== undefined ||
    e.closedToArrival !== undefined ||
    e.closedToDeparture !== undefined ||
    e.stopSell !== undefined
  )
}

// Silence unused Prisma import (kept for ergonomic type extension in future).
type _PrismaUnused = Prisma.JsonValue
