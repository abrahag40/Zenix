/**
 * useMobileDashboard — fetcher para el endpoint role-aware
 * `/v1/dashboard/mobile` (Etapa B §B1 plan MOBILE-DASHBOARD).
 *
 * El backend decide qué proyectar según actor.role:
 *  · SUPERVISOR  → ocupación + revenue + attention + upcoming
 *  · RECEPTIONIST → movements + bloqueadas + cobros
 *  · HOUSEKEEPER → 403 (usa /v1/housekeeping/my-day)
 *
 * Polling 60s + SSE triggers (mismos que el dashboard legacy).
 */
import { useEffect } from 'react'
import type { SseEventType } from '@zenix/shared'
import { useApiResource } from '../../../api/useApiResource'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'

export interface MobileDashboardHero {
  greeting: string
  firstName: string
  propertyName: string
  propertyCity: string | null
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  timezone: string
  currentTimeIso: string
}

export interface SupervisorSnapshot {
  role: 'SUPERVISOR'
  hero: MobileDashboardHero
  occupancy: { occupied: number; arrivingToday: number; blocked: number; total: number }
  revenue: { todayAmount: number; currency: string; projected: boolean; vsYesterdayPct: number | null }
  attentionNow: Array<{ kind: 'overstayed' | 'maintenance_critical' | 'unpaid_arrival'; title: string; count: number; deeplink: string }>
  upcoming4h: {
    arrivalsCount: number
    departuresCount: number
    nextEvent: { kind: 'arrival' | 'departure'; guestName: string; roomLabel: string; timeIso: string } | null
  }
  lastSyncIso: string
}

export interface ReceptionistSnapshot {
  role: 'RECEPTIONIST'
  hero: MobileDashboardHero
  movements: {
    arrivals: Array<{
      stayId: string; guestName: string; roomLabel: string; paxCount: number
      etaIso: string; paymentModel: string; balance: number; currency: string
      hasDocument: boolean
    }>
    departures: Array<{
      stayId: string; guestName: string; roomLabel: string
      scheduledIso: string; balance: number; currency: string
    }>
  }
  blockedRooms: Array<{
    blockId: string; roomLabel: string; reason: string
    untilIso: string | null; maintenanceTicketId: string | null
  }>
  pendingCharges: { count: number; totalAmount: number; currency: string }
  lastSyncIso: string
}

export type MobileDashboardSnapshot = SupervisorSnapshot | ReceptionistSnapshot

/** Eventos SSE que invalidan el snapshot (refetch inmediato sin esperar poll). */
const MOBILE_DASHBOARD_TRIGGERS: SseEventType[] = [
  'task:planned',
  'task:ready',
  'task:done',
  'task:upgraded',   // Etapa A §A1 — escalación OTA same-day
  'task:moved',      // Etapa A §A2 — migración por room move
  'task:cancelled',
  'block:activated',
  'block:expired',
  'block:cancelled',
  'stay:no_show',
  'stay:no_show_reverted',
  'stay:cancelled',   // QA-08 — cancel manual no-OTA refresca dashboard
  'stay:restored',    // QA-08 — restore manual refresca dashboard
  'checkin:confirmed',
  'checkout:early',
  'checkout:confirmed',
  'room:moved',
  // BUG E2E-18 fix (2026-06-08) — una reserva OTA nueva/cancelada de Channex
  // debe refrescar las llegadas/salidas del recepcionista + el donut del
  // supervisor en tiempo real (antes solo aparecía tras el poll de 60s).
  'channex:stay:created',
  'channex:stay:modified',
  'channex:stay:cancelled',
  'channex:group:created',
  'channex:group:cancelled',
]

export function useMobileDashboard() {
  const result = useApiResource<MobileDashboardSnapshot>(
    '/v1/dashboard/mobile',
    { pollMs: 60_000 },
  )

  useEffect(() => {
    return registerSseConsumer(MOBILE_DASHBOARD_TRIGGERS, () => {
      result.refetch().catch(() => undefined)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return result
}
