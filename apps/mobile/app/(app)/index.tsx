/**
 * Dashboard — Tab 1 (Inicio) — adaptive KPIs by time-of-day.
 *
 * Architecture: AD-015 (apps/mobile/ARCHITECTURE.md) + CLAUDE.md §37.
 *
 * Permanent (24/7):
 *   - OccupancyCard with 7-day sparkline (STR Global #1 hotel KPI)
 *   - InHouseCard (guests in-house — drives every op decision)
 *   - RoomsGridCard (pre-attentive visual room status, Treisman 1980)
 *   - "Mi día" (personal counter — role-aware)
 *
 * Adaptive (rotates by hour):
 *   Morning (06-12)    : Checkouts pending · Rooms to clean · FxRate
 *   Afternoon (12-17)  : Check-ins received
 *   Evening (17-22)    : NoShowsList (after warning hour) · Late check-ins
 *   Overnight (22-06)  : NoShowsList (pre-audit) · Day summary · Tomorrow
 *
 * NOT shown (Research #3 rejections):
 *   - Walk-ins available (4-9% of revenue, noise on daily dashboard)
 *   - Post-12pm checkouts (operation already closed by then)
 *   - RevPAR / ADR (revenue manager territory, not operational)
 *
 * Data:
 *   - Sprint 8I: QA mock data when EXPO_PUBLIC_USE_MOCKS=true
 *   - Sprint 9: real /reports endpoints (occupancy, in-house,
 *     rooms-status, no-shows, fx-rate)
 */

import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { useAuthStore } from '../../src/store/auth'
import { colors } from '../../src/design/colors'
import { typography } from '../../src/design/typography'
import { MOTION } from '../../src/design/motion'
import { IconSun } from '../../src/design/icons'
import { pickKpis, currentWindowLabel, type KpiKey } from '../../src/features/dashboard/kpiPolicy'
import { KpiCard } from '../../src/features/dashboard/components/KpiCard'
import { OccupancyDonutCard } from '../../src/features/dashboard/components/OccupancyDonutCard'
import { InHouseCard } from '../../src/features/dashboard/components/InHouseCard'
import { BlockedRoomsCard } from '../../src/features/dashboard/components/BlockedRoomsCard'
import { RoomsGridCard } from '../../src/features/dashboard/components/RoomsGridCard'
import { NoShowsListCard } from '../../src/features/dashboard/components/NoShowsListCard'
import { FxRateCard } from '../../src/features/dashboard/components/FxRateCard'
import { PendingTasksCard } from '../../src/features/dashboard/components/PendingTasksCard'
import { RevenueCarouselCard } from '../../src/features/dashboard/components/RevenueCarouselCard'
import { MovementsCard } from '../../src/features/dashboard/components/MovementsCard'
// SpecialRequestsCard + PendingApprovalsCard intentionally not imported
// here — deferred to a non-essential sprint per user feedback. The
// components still exist in src/features/dashboard/components/ for
// future re-activation. See docs/dashboard-deferred.md.
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_OCCUPANCY_DONUT,
  MOCK_ROOMS_GRID,
  MOCK_IN_HOUSE,
  MOCK_IN_HOUSE_ROOMS,
  MOCK_NO_SHOWS,
  MOCK_FX_RATES,
  MOCK_BLOCKED_ROOMS,
  MOCK_TICKER_INSIGHTS,
  MOCK_PENDING_TASKS,
  MOCK_REVENUE_FRAMES,
  MOCK_TODAY_ARRIVALS,
  MOCK_TODAY_DEPARTURES,
  // Deferred: MOCK_SPECIAL_REQUESTS, MOCK_APPROVALS — see deferred doc
} from '../../src/features/dashboard/__mocks__/mockDashboard'

function pickGreeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ─── KPI metadata for the small cards (KpiCard fallback) ─────────────
// Big custom cards (Occupancy, RoomsGrid, InHouse, NoShowsList, FxRate)
// render via dedicated components. The small ones below are placeholders
// until Sprint 9 wires their real data sources.
interface KpiMeta {
  label: string
  value: string | number
  sublabel?: string
  tint: string
}

const SMALL_KPI_META: Partial<Record<KpiKey, KpiMeta>> = {
  myDay:            { label: 'Tu día',            value: '—', tint: '#A78BFA',            sublabel: 'tareas activas' },
  checkoutsPending: { label: 'Check-outs',        value: '—', tint: colors.warning[500],  sublabel: 'pendientes' },
  roomsToClean:     { label: 'Por limpiar',       value: '—', tint: colors.warning[400],  sublabel: 'habitaciones' },
  checkinsReceived: { label: 'Check-ins',         value: '—', tint: colors.brand[500],    sublabel: 'recibidos / esperados' },
  lateCheckIns:     { label: 'Late check-ins',    value: '—', tint: colors.warning[500],  sublabel: 'esperados' },
  daySummary:       { label: 'Día completado',    value: '—', tint: '#A78BFA',            sublabel: 'resumen' },
  nextDayArrivals:  { label: 'Mañana',            value: '—', tint: colors.brand[500],    sublabel: 'llegadas previstas' },
  comingSoon:       { label: 'Día limpio',        value: '🎉', tint: colors.brand[500],   sublabel: 'sin pendientes' },
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? 'colega'
  const propertyName = user?.propertyName ?? 'Tu propiedad'

  // Re-evaluate the KPI policy every minute. The hour boundary may cross
  // and the displayed KPI set should rotate without reload.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // TODO(sprint-9): timezone should come from the user's property settings,
  // not from the device. For now use the device tz as proxy.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const kpis = pickKpis({ now, timezone: tz })
  const windowLabel = currentWindowLabel(now, tz)

  // Mount animation — staggered fade + rise. Mirrors login screen.
  const headerOpacity = useSharedValue(0)
  const headerY = useSharedValue(16)
  const cardsOpacity = useSharedValue(0)

  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 400, easing: MOTION.ease.spring })
    headerY.value = withSpring(0, MOTION.spring.standard)
    cardsOpacity.value = withDelay(120, withTiming(1, { duration: 500, easing: MOTION.ease.spring }))
  }, [])

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }))
  const cardsStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
  }))

  // ── Resolve data sources (mock or null) ──────────────────────────
  // In Sprint 9 these will become useQuery hooks. For now, mocks
  // when the env flag is on, null/undefined otherwise — every card
  // already handles the empty state gracefully.
  const occupancyDonut  = MOCKS_DASHBOARD_ENABLED ? MOCK_OCCUPANCY_DONUT : null
  const roomsGrid       = MOCKS_DASHBOARD_ENABLED ? MOCK_ROOMS_GRID : []
  const inHouse         = MOCKS_DASHBOARD_ENABLED ? MOCK_IN_HOUSE : { guestCount: null, roomsOccupied: null, arrivalsToday: null, departuresToday: null }
  const inHouseRooms    = MOCKS_DASHBOARD_ENABLED ? MOCK_IN_HOUSE_ROOMS : []
  const noShows         = MOCKS_DASHBOARD_ENABLED ? MOCK_NO_SHOWS : []
  const fxRates         = MOCKS_DASHBOARD_ENABLED ? MOCK_FX_RATES : []
  const blockedRooms    = MOCKS_DASHBOARD_ENABLED ? MOCK_BLOCKED_ROOMS : []
  const tickerInsights  = MOCKS_DASHBOARD_ENABLED ? MOCK_TICKER_INSIGHTS : []
  const pendingTasks    = MOCKS_DASHBOARD_ENABLED ? MOCK_PENDING_TASKS : null
  const revenueFrames   = MOCKS_DASHBOARD_ENABLED ? MOCK_REVENUE_FRAMES : []
  const todayArrivals   = MOCKS_DASHBOARD_ENABLED ? MOCK_TODAY_ARRIVALS : []
  const todayDepartures = MOCKS_DASHBOARD_ENABLED ? MOCK_TODAY_DEPARTURES : []

  // Reception/Supervisor/Admin can access the calendar shortcut + reservation
  // search. Housekeeping doesn't need them.
  const canAccessReservations =
    user?.role === 'RECEPTIONIST' || user?.role === 'SUPERVISOR'

  // Helpers for active-set lookups
  const activeKeys = new Set(kpis.map((k) => k.key))
  const showInHouse    = activeKeys.has('inHouse')
  const showRoomsGrid  = activeKeys.has('roomsGrid')
  const showNoShows    = activeKeys.has('noShowsList')
  const showFxRate     = activeKeys.has('fxRate')

  // Small KPI cards = adaptive ones not handled by a dedicated component
  const HANDLED_BY_DEDICATED = new Set<KpiKey>(['occupancy', 'inHouse', 'roomsGrid', 'noShowsList', 'fxRate'])
  const smallKpis = kpis.filter((k) => !HANDLED_BY_DEDICATED.has(k.key))

  // Parent ScrollView ref so InHouseCard can ask the page to scroll the
  // expanded list into a comfortable read position. Without this the
  // user has to scroll past their own scroll-attempt area when expanding.
  const scrollRef = useRef<ScrollView | null>(null)

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting hero ─────────────────────────────────────── */}
        <Animated.View style={[styles.header, headerStyle]}>
          <View style={styles.greetingRow}>
            <IconSun size={22} color={colors.warning[500]} />
            <Text style={styles.greeting}>{pickGreeting()}</Text>
            <View style={styles.windowBadge}>
              <Text style={styles.windowBadgeText}>{windowLabel}</Text>
            </View>
          </View>
          <Text style={styles.name}>{firstName}</Text>
        </Animated.View>

        {/* ── Property card ─────────────────────────────────────── */}
        <Animated.View style={[styles.propertyCard, cardsStyle]}>
          <View>
            <Text style={styles.propertyLabel}>Tu propiedad</Text>
            <Text style={styles.propertyName}>{propertyName}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{roleLabel(user?.role)}</Text>
          </View>
        </Animated.View>

        {/*
          ── Dashboard ordering — Inverted Pyramid (Research v3 §1) ──

          1. STATE       — what is happening NOW          (Occupancy + InHouse)
          2. ACTION      — what I need to DO              (Pending + Blocked)
          3. PREDICTIVE  — what's COMING                  (NoShows late-arrivals)
          4. CONTEXT     — numbers for DECISIONS          (Revenue · FX)
          5. EXPLORE     — visual MAP for deep-dive       (RoomsGrid)
          6. ACCESS      — shortcuts                       (Calendar · Search)

          Justified in docs/research-dashboard-v3.md.
        */}

        {/* ── 1.A STATE: ocupación general ─────────────────────── */}
        <Animated.View style={cardsStyle}>
          <OccupancyDonutCard data={occupancyDonut} tickerInsights={tickerInsights} />
        </Animated.View>

        {/* ── 1.B STATE: en casa (expandible) ─────────────────── */}
        {showInHouse && (
          <Animated.View style={cardsStyle}>
            <InHouseCard
              guestCount={inHouse.guestCount}
              roomsOccupied={inHouse.roomsOccupied}
              arrivalsToday={inHouse.arrivalsToday}
              departuresToday={inHouse.departuresToday}
              rooms={inHouseRooms}
              onExpanded={(cardY, totalH) => {
                // Center the expanded card vertically within the viewport.
                // We aim slightly above the middle so the user perceives
                // forward motion (the new content rises into view).
                const target = Math.max(0, cardY - 80)
                scrollRef.current?.scrollTo({ y: target, animated: true })
              }}
            />
          </Animated.View>
        )}

        {/* ── 2.A ACTION: pendientes operativos ───────────────── */}
        <Animated.View style={cardsStyle}>
          <PendingTasksCard data={pendingTasks} />
        </Animated.View>

        {/* SpecialRequestsCard + PendingApprovalsCard removed from
            dashboard wiring per user feedback ("considerarlo para sprint
            de mejoras no escenciales"). The components remain in
            src/features/dashboard/components/ and the routes
            /approvals + /special-requests stay registered, so a future
            sprint can re-enable them without rebuilding from scratch.
            See docs/dashboard-deferred.md for the deferral notes. */}

        {/* ── 2.B ACTION: bloqueos ─────────────────────────────── */}
        <Animated.View style={cardsStyle}>
          <BlockedRoomsCard rooms={blockedRooms} />
        </Animated.View>

        {/* ── 3.A PREDICTIVE: movimientos hoy (RECEPTION+) ────── */}
        {canAccessReservations && (
          <Animated.View style={cardsStyle}>
            <MovementsCard
              arrivals={todayArrivals}
              departures={todayDepartures}
            />
          </Animated.View>
        )}

        {/* ── 3.B PREDICTIVE: late arrivals / no-show risk ─────── */}
        {showNoShows && (
          <Animated.View style={cardsStyle}>
            <NoShowsListCard items={noShows} />
          </Animated.View>
        )}

        {/* ── 4.A CONTEXT: ingresos (carrusel) — RECEPTION+ ────── */}
        {canAccessReservations && (
          <Animated.View style={cardsStyle}>
            <RevenueCarouselCard frames={revenueFrames} />
          </Animated.View>
        )}

        {/* ── 4.B CONTEXT: tipo de cambio (mañana) ──────────────── */}
        {showFxRate && (
          <Animated.View style={cardsStyle}>
            <FxRateCard rates={fxRates} />
          </Animated.View>
        )}

        {/* ── Adaptive small KPI grid (residual KPIs from policy) ── */}
        {smallKpis.length > 0 && (
          <Animated.View style={[styles.kpiGrid, cardsStyle]}>
            {smallKpis.map((k) => {
              const meta = SMALL_KPI_META[k.key]
              if (!meta) return null
              return (
                <KpiCard
                  key={k.key}
                  label={meta.label}
                  value={meta.value}
                  sublabel={meta.sublabel}
                  tint={meta.tint}
                />
              )
            })}
          </Animated.View>
        )}

        {/* ── 5 EXPLORE: rooms grid (visual map) ─────────────────── */}
        {showRoomsGrid && (
          <Animated.View style={cardsStyle}>
            <RoomsGridCard rooms={roomsGrid} />
          </Animated.View>
        )}

        {/* ── 6 ACCESS: shortcuts at the bottom (Apple HIG: actions
              that aren't part of the data flow live below the fold) ── */}
        {canAccessReservations && (
          <Animated.View style={[styles.shortcutsRow, cardsStyle]}>
            <Pressable
              style={styles.shortcutBtn}
              onPress={() => {
                Haptics.selectionAsync()
                router.push('/reservas-calendario')
              }}
            >
              <Text style={styles.shortcutEmoji}>📅</Text>
              <Text style={styles.shortcutLabel}>Calendario</Text>
            </Pressable>
            <Pressable
              style={styles.shortcutBtn}
              onPress={() => {
                Haptics.selectionAsync()
                router.push('/trabajo')
              }}
            >
              <Text style={styles.shortcutEmoji}>🔍</Text>
              <Text style={styles.shortcutLabel}>Buscar reserva</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Sprint 9 footer ──────────────────────────────────── */}
        {!MOCKS_DASHBOARD_ENABLED && (
          <Animated.View style={[styles.comingSoon, cardsStyle]}>
            <Text style={styles.comingSoonTitle}>📊 Datos en tiempo real próximamente</Text>
            <Text style={styles.comingSoonBody}>
              Estos KPIs se conectarán a la fuente de verdad del calendario PMS en el siguiente sprint.
              La estructura adaptativa por hora del día (mañana / tarde / noche / madrugada) ya está activa.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function roleLabel(role?: string): string {
  switch (role) {
    case 'HOUSEKEEPER': return 'Recamarista'
    case 'SUPERVISOR':  return 'Supervisor'
    case 'RECEPTIONIST':return 'Recepción'
    default:            return ''
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 14,
  },
  header: {
    paddingTop: 12,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  greeting: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  windowBadge: {
    backgroundColor: 'rgba(16,185,129,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  windowBadgeText: {
    fontSize: typography.size.micro,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
  },
  propertyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  propertyLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
    fontWeight: typography.weight.semibold,
    marginBottom: 4,
  },
  propertyName: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  roleBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
  },
  shortcutEmoji: {
    fontSize: 18,
  },
  shortcutLabel: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  comingSoon: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
  },
  comingSoonTitle: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: 6,
  },
  comingSoonBody: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },
})
