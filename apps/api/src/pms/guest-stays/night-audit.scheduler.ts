/**
 * NightAuditScheduler — Procesamiento automático de no-shows por propiedad.
 *
 * Diseño multi-timezone (CRÍTICO):
 * ─────────────────────────────────────────────────────────────────────────────
 * El cron corre cada 30 minutos en UTC. Para cada propiedad:
 *   1. Se obtiene la timezone de PropertySettings.
 *   2. Se calcula la hora local actual en esa timezone via Intl.DateTimeFormat.
 *   3. Si hora local >= noShowCutoffHour (default 2 AM) Y la fecha local actual
 *      no coincide con noShowProcessedDate → se procesan los no-shows.
 *   4. Se actualiza noShowProcessedDate para evitar doble ejecución.
 *
 * Por qué Intl.DateTimeFormat y no moment-timezone ni date-fns-tz:
 *   - Intl es nativo en Node.js ≥12 con soporte completo de IANA timezones.
 *   - Sin dependencias extra. Validado contra IANA tz database incluida en ICU.
 *
 * Por qué cada 30 minutos y no una vez al día:
 *   - Una propiedad en UTC-5 tiene cutoff a las 02:00 local = 07:00 UTC.
 *   - Una propiedad en UTC+9 tiene cutoff a las 02:00 local = 17:00 UTC del día anterior.
 *   - Un único cron diario en UTC necesitaría ejecutarse a todas las horas posibles.
 *   - Cada 30 min garantiza que cualquier propiedad del mundo es procesada
 *     dentro de los 30 minutos siguientes a su ventana de cutoff.
 *
 * Idempotencia:
 *   - noShowProcessedDate actúa como semáforo: si ya se procesó hoy en la
 *     timezone local de esa propiedad, el loop salta sin hacer nada.
 *   - markAsNoShowSystem() es también idempotente: si el stay ya tiene noShowAt,
 *     sale inmediatamente.
 *
 * Trazabilidad (auditoría):
 *   - Cada no-show generado automáticamente tiene noShowReason =
 *     'Marcado automáticamente por night audit' y noShowById = null.
 *   - El StayJourneyEvent.actorId = null indica origen de sistema.
 */
import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { GuestStaysService } from './guest-stays.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import {
  CHANNEX_AVAILABILITY_CHANGED,
  ChannexAvailabilityChangedEvent,
} from '../../integrations/channex/outbound/channex-outbound-events'

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toLocalHour(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(date)
  // Intl.DateTimeFormat con hour12:false puede devolver "24" en medianoche — normalizar a 0
  return Number(formatted) % 24
}

@Injectable()
export class NightAuditScheduler {
  private readonly logger = new Logger(NightAuditScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestStaysService: GuestStaysService,
    private readonly channex: ChannexGateway,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Corre cada 30 minutos. Para cada propiedad evalúa si corresponde procesar
   * no-shows según su timezone local y su noShowCutoffHour configurado.
   */
  @Cron('0,30 * * * *')
  async processNoShows() {
    const now = new Date()

    // Cargar settings de todas las propiedades activas
    const allSettings = await this.prisma.propertySettings.findMany({
      select: {
        propertyId:          true,
        timezone:            true,
        noShowCutoffHour:    true,
        noShowProcessedDate: true,
        channexPropertyId:   true,
        property: {
          select: {
            organizationId: true,
            isActive:       true,
          },
        },
      },
    })

    let processed = 0
    let skipped   = 0

    for (const settings of allSettings) {
      if (!settings.property?.isActive) {
        skipped++
        continue
      }

      const tz       = settings.timezone || 'UTC'
      const orgId    = settings.property.organizationId

      const localHour = toLocalHour(now, tz)
      const localDate = toLocalDate(now, tz)

      // Hora local aún no alcanzó el cutoff → esperar
      if (localHour < settings.noShowCutoffHour) {
        skipped++
        continue
      }

      // Ya se procesó hoy en esta timezone → saltar
      // BUG FIX 2026-05-29: comparar UTC date directo en vez de convertir con
      // toLocalDate(tz). Postgres `date` column se lee como midnight UTC del
      // día N. Convertir con tz UTC-X (Cancún UTC-5) da el día N-1 → off-by-one
      // → guard NUNCA matcheaba → cron procesaba misma propiedad cada 30min,
      // marcando como no-show TODAS las reservas pendientes (incluso recién
      // creadas durante el día). Comparamos UTC ISO date string directo.
      const lastProcessed = settings.noShowProcessedDate
        ? settings.noShowProcessedDate.toISOString().slice(0, 10)
        : null
      if (lastProcessed === localDate) {
        skipped++
        continue
      }

      // BUG #6 fix 2026-06-04 — ventana de backlog 7 días en vez de solo "hoy".
      //
      // El query previo `checkinAt: { gte: dayStart, lte: dayEnd }` filtraba
      // SOLO el día local actual. Si el cron fallaba un día (downtime, deploy,
      // server restart), las stays de ese día quedaban ghost no-shows
      // permanentes — el run siguiente no las capturaba porque caían fuera
      // del rango. Pre-prod testing 2026-06-04 evidencia: 10 stays seed
      // 5/28-5/31 con checkinAt pasado, actualCheckin=null, noShowAt=null.
      //
      // Fix: rango backlog de 7 días (`BACKLOG_DAYS`). El cron principal
      // procesa hoy + recupera cualquier stay olvidada de los 6 días
      // previos. `noShowProcessedDate` sigue siendo el guard idempotente
      // del día actual (no re-procesa lo de hoy en el mismo día). Las
      // stays de días previos son por definición "ya pasaron sin checkin"
      // y deben marcarse como no-show.
      const BACKLOG_DAYS = 7
      const backlogStart = new Date(`${localDate}T00:00:00.000Z`)
      backlogStart.setUTCDate(backlogStart.getUTCDate() - (BACKLOG_DAYS - 1))
      const dayEnd       = new Date(`${localDate}T23:59:59.999Z`)

      const overdueStays = await this.prisma.guestStay.findMany({
        where: {
          organizationId:    orgId ?? undefined,
          propertyId:        settings.propertyId,
          deletedAt:         null,
          actualCheckin:     null, // BUG FIX 2026-05-29: sin esto, stays que YA
                                   // hicieron check-in se marcaban como no-show
                                   // (caso real: actualCheckin=17:11, noShowAt=17:30).
          actualCheckout:    null,
          noShowAt:          null,
          noShowRevertedAt:  null, // exclude stays that were manually reverted — don't re-mark
          cancelledAt:       null, // no procesar canceladas
          checkinAt: { gte: backlogStart, lte: dayEnd },
        },
        select: {
          id: true,
          guestName: true,
          scheduledCheckout: true,
          room: { select: { channexRoomTypeId: true } },
        },
      })

      if (overdueStays.length === 0) {
        // Marcar como procesado aunque no haya no-shows (para no re-ejecutar)
        await this.prisma.propertySettings.update({
          where: { propertyId: settings.propertyId },
          data:  { noShowProcessedDate: new Date(`${localDate}T00:00:00.000Z`) },
        })
        skipped++
        continue
      }

      this.logger.log(
        `[NightAudit] property=${settings.propertyId} tz=${tz} localDate=${localDate} ` +
        `processing ${overdueStays.length} potential no-show(s)`,
      )

      for (const stay of overdueStays) {
        try {
          await this.guestStaysService.markAsNoShowSystem(
            stay.id,
            orgId ?? '',
            settings.propertyId,
          )

          // Sprint CHANNEX-OUTBOUND-CERT Day 5 — refactor AP-2.2.
          // Antes: direct pushInventory desde el scheduler. Ahora emit event
          // → OutboxBuilder enqueue → Worker drain con rate limit + retry.
          const channexRoomTypeId = stay.room?.channexRoomTypeId
          if (settings.channexPropertyId && channexRoomTypeId) {
            const event: ChannexAvailabilityChangedEvent = {
              propertyId: settings.propertyId,
              entries: [{
                propertyId: settings.channexPropertyId,
                roomTypeId: channexRoomTypeId,
                dateFrom:   localDate,
                dateTo:     toDateString(stay.scheduledCheckout),
                availability: 1,  // release hotel model
              }],
            }
            this.events.emit(CHANNEX_AVAILABILITY_CHANGED, event)
          }

          processed++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.error(`[NightAudit] Error processing stay=${stay.id}: ${msg}`)
        }
      }

      // Marcar la propiedad como procesada para este día local
      await this.prisma.propertySettings.update({
        where: { propertyId: settings.propertyId },
        data:  { noShowProcessedDate: new Date(`${localDate}T00:00:00.000Z`) },
      })
    }

    if (processed > 0 || skipped === 0) {
      this.logger.log(`[NightAudit] Ciclo completado — no-shows procesados: ${processed}, propiedades saltadas: ${skipped}`)
    }
  }
}
