/**
 * Etapa B §B5 — tests del Mobile Dashboard V2.
 *
 * Cubre los 3 estados críticos por rol:
 *  · SUPERVISOR happy path → ocupación / revenue / attention / upcoming render.
 *  · RECEPTIONIST happy path → movements / pending charges / blocked rooms render.
 *  · Loading state → ActivityIndicator + "Cargando tu día…" sin crash.
 *  · Error state → empty card con instrucción accionable.
 *
 * Foco en NO regression: la sesión owner reportó 3 bugs visibles del audit
 * (donut inconsistente, "5 huéspedes" con 0 ocupadas, "—" en tareas). Estos
 * tests aseguran que el shape role-aware del endpoint /v1/dashboard/mobile
 * se renderee correctamente y que los empty states no muestren "—" frío.
 */

// Mock hook ANTES del import del componente (Jest hoisting).
const mockSnapshot: { data: unknown; isLoading: boolean; error: unknown; refetch: () => Promise<unknown> } = {
  data: null,
  isLoading: false,
  error: null,
  refetch: jest.fn().mockResolvedValue(undefined),
}
jest.mock('../api/useMobileDashboard', () => ({
  useMobileDashboard: () => mockSnapshot,
}))
// Mock router para AttentionList (que llama router.push en taps)
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))
// Mock SafeAreaView — el provider real requiere context que no tenemos en jest.
jest.mock('react-native-safe-area-context', () => {
  const RN = jest.requireActual('react-native')
  return { SafeAreaView: RN.View }
})
// Mock react-native-svg — el componente OccupancyDonut3 lo usa.
jest.mock('react-native-svg', () => {
  const RN = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: RN.View,
    Svg: RN.View,
    Circle: RN.View,
    G: RN.View,
  }
})

import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { DashboardScreenV2 } from './DashboardScreenV2'
import type { SupervisorSnapshot, ReceptionistSnapshot } from '../api/useMobileDashboard'

const supervisorFixture: SupervisorSnapshot = {
  role: 'SUPERVISOR',
  hero: {
    greeting: 'Buenos días',
    firstName: 'Ana',
    propertyName: 'Hotel Tulum',
    propertyCity: 'Tulum',
    timeOfDay: 'morning',
    timezone: 'America/Cancun',
    currentTimeIso: '2026-06-08T15:00:00.000Z',
  },
  occupancy: { occupied: 14, arrivingToday: 2, blocked: 1, total: 22 },
  revenue: { todayAmount: 12500, currency: 'MXN', projected: true, vsYesterdayPct: 8 },
  attentionNow: [
    { kind: 'overstayed', title: 'Salidas vencidas sin checkout', count: 1, deeplink: 'mobile://overstayed' },
  ],
  upcoming4h: {
    arrivalsCount: 2,
    departuresCount: 1,
    nextEvent: { kind: 'arrival', guestName: 'María García', roomLabel: '201', timeIso: '2026-06-08T16:00:00.000Z' },
  },
  lastSyncIso: new Date().toISOString(),
}

const receptionistFixture: ReceptionistSnapshot = {
  role: 'RECEPTIONIST',
  hero: {
    greeting: 'Buenas tardes',
    firstName: 'Carlos',
    propertyName: 'Hotel Tulum',
    propertyCity: 'Tulum',
    timeOfDay: 'afternoon',
    timezone: 'America/Cancun',
    currentTimeIso: '2026-06-08T19:00:00.000Z',
  },
  movements: {
    arrivals: [
      {
        stayId: 'stay-1', guestName: 'Michael Johnson', roomLabel: 'C2', paxCount: 3,
        etaIso: '2026-06-08T20:00:00.000Z', paymentModel: 'HOTEL_COLLECT',
        balance: 360, currency: 'MXN', hasDocument: false,
      },
    ],
    departures: [],
  },
  blockedRooms: [
    { blockId: 'b1', roomLabel: '104', reason: 'Mtto · ticket #45', untilIso: null, maintenanceTicketId: 't-45' },
  ],
  pendingCharges: { count: 18, totalAmount: 3185, currency: 'MXN' },
  lastSyncIso: new Date().toISOString(),
}

/** Helper — extract all text from the render tree (simple snapshot of visible labels). */
function collectText(node: TestRenderer.ReactTestInstance | TestRenderer.ReactTestInstance[] | null): string[] {
  if (!node) return []
  const nodes = Array.isArray(node) ? node : [node]
  const out: string[] = []
  for (const n of nodes) {
    if (!n) continue
    if (typeof n === 'string') {
      out.push(n)
    } else if ('children' in n) {
      for (const c of n.children) {
        if (typeof c === 'string') out.push(c)
        else out.push(...collectText(c as TestRenderer.ReactTestInstance))
      }
    }
  }
  return out
}

describe('DashboardScreenV2', () => {
  beforeEach(() => {
    mockSnapshot.data = null
    mockSnapshot.isLoading = false
    mockSnapshot.error = null
    jest.clearAllMocks()
  })

  it('Loading state — muestra "Cargando tu día…" sin crash', () => {
    mockSnapshot.isLoading = true
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' ')
    expect(texts).toMatch(/Cargando tu día/i)
    renderer.unmount()
  })

  it('Error state — muestra mensaje accionable, no "—" frío', () => {
    mockSnapshot.error = new Error('Network down')
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' ')
    expect(texts).toMatch(/No pudimos cargar tu dashboard/i)
    expect(texts).toMatch(/Revisa tu conexión/i)
    expect(texts).not.toMatch(/^—$/) // owner audit: nunca placeholder frío
    renderer.unmount()
  })

  it('SUPERVISOR happy path — render ocupación + revenue + attention + upcoming', () => {
    mockSnapshot.data = supervisorFixture
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' | ')
    // Hero
    expect(texts).toMatch(/Buenos días/)
    expect(texts).toMatch(/Ana/)
    expect(texts).toMatch(/Hotel Tulum/)
    expect(texts).toMatch(/Supervisor/)
    // Occupancy donut — 14 ocupadas + 22 total
    expect(texts).toMatch(/Ocupadas/)
    expect(texts).toMatch(/Llegan hoy/)
    expect(texts).toMatch(/Bloqueadas/)
    expect(texts).toMatch(/Disponibles/) // owner D-MOB-6 — vacías visibles solo como complemento numérico
    // Revenue
    expect(texts).toMatch(/Ingresos hoy/i)
    // Attention list (1 item)
    expect(texts).toMatch(/Atender ahora/i)
    expect(texts).toMatch(/Salidas vencidas/)
    // Upcoming4h
    expect(texts).toMatch(/Próximas 4 horas/i)
    expect(texts).toMatch(/Llegadas/)
    // Last sync footer
    expect(texts).toMatch(/Última actualización/i)
    renderer.unmount()
  })

  it('SUPERVISOR sin attention items — muestra empty state "Día limpio" (NO "—")', () => {
    mockSnapshot.data = { ...supervisorFixture, attentionNow: [] }
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' | ')
    expect(texts).toMatch(/Día limpio/i)
    expect(texts).toMatch(/Sin pendientes urgentes/i)
    // Anti-regresión: el audit owner reportó "—" frío en "tareas activas"
    expect(texts).not.toMatch(/\b—\b\s*tareas activas/i)
    renderer.unmount()
  })

  it('RECEPTIONIST happy path — render movements + pendingCharges + blockedRooms', () => {
    mockSnapshot.data = receptionistFixture
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' | ')
    // Hero
    expect(texts).toMatch(/Carlos/)
    expect(texts).toMatch(/Recepción/)
    // Tabs movements
    expect(texts).toMatch(/Llegadas/)
    expect(texts).toMatch(/Salidas/)
    // Arrival rendered
    expect(texts).toMatch(/Michael Johnson/)
    expect(texts).toMatch(/C2/)
    expect(texts).toMatch(/3 pax/)
    // Pending charges
    expect(texts).toMatch(/Cobros pendientes/i)
    expect(texts).toMatch(/18.*cuentas/i)
    // Blocked rooms
    expect(texts).toMatch(/Habitaciones bloqueadas/i)
    expect(texts).toMatch(/104/)
    expect(texts).toMatch(/Mtto.*ticket/i)
    renderer.unmount()
  })

  it('Walk-in tab eliminada (D-MOB-1) — solo Llegadas y Salidas en RECEPTIONIST', () => {
    mockSnapshot.data = receptionistFixture
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(<DashboardScreenV2 />)
    })
    const texts = collectText(renderer.root).join(' | ')
    // Anti-regresión D-MOB-1
    expect(texts).not.toMatch(/Walk-in/i)
    // Confirmar que sí están las 2 tabs correctas
    expect(texts).toMatch(/Llegadas/)
    expect(texts).toMatch(/Salidas/)
    renderer.unmount()
  })
})
