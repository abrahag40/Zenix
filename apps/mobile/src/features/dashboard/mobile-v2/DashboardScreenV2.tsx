/**
 * DashboardScreenV2 — pantalla role-aware del Mobile Dashboard.
 *
 * Etapa B §B2+§B3 plan MOBILE-DASHBOARD. Renderea SUPERVISOR vs RECEPTIONIST
 * según el `role` del response. HOUSEKEEPER se desvía antes (no debe llegar
 * aquí — el router en index.tsx lo redirige a /trabajo).
 *
 * Features:
 *  · Pull-to-refresh (D-MOB-4)
 *  · Last sync timestamp en hero (M-10)
 *  · Empty states con illustration (D-MOB-7)
 *  · SSE auto-refetch (task:upgraded, task:moved, room:moved, etc)
 */
import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { useMobileDashboard, type SupervisorSnapshot, type ReceptionistSnapshot } from '../api/useMobileDashboard'
import { Hero } from './Hero'
import { OccupancyDonut3 } from './OccupancyDonut3'
import { BigNumberCard } from './BigNumberCard'
import { AttentionList } from './AttentionList'
import { MovementsList } from './MovementsList'

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function relativeSync(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'hace segundos'
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)} min`
  return `hace ${Math.floor(ms / 3_600_000)} h`
}

export function DashboardScreenV2() {
  const { data, isLoading, error, refetch } = useMobileDashboard()
  const [refreshing, setRefreshing] = useRefreshState(refetch)

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
        <Text style={styles.loadingText}>Cargando tu día…</Text>
      </SafeAreaView>
    )
  }
  if (error || !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.errorEmoji}>📡</Text>
        <Text style={styles.errorTitle}>No pudimos cargar tu dashboard</Text>
        <Text style={styles.errorBody}>Revisa tu conexión y desliza para reintentar.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor={colors.brand[500]}
          />
        }
      >
        <Hero hero={data.hero} roleLabel={roleLabel(data.role)} />

        {data.role === 'SUPERVISOR' && <SupervisorBody data={data} />}
        {data.role === 'RECEPTIONIST' && <ReceptionistBody data={data} />}

        <Text style={styles.lastSync}>Última actualización · {relativeSync(data.lastSyncIso)}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function SupervisorBody({ data }: { data: SupervisorSnapshot }) {
  const occupancyPct = data.occupancy.total > 0
    ? Math.round((data.occupancy.occupied / data.occupancy.total) * 100)
    : 0
  return (
    <>
      <OccupancyDonut3
        occupied={data.occupancy.occupied}
        arrivingToday={data.occupancy.arrivingToday}
        blocked={data.occupancy.blocked}
        total={data.occupancy.total}
      />
      <BigNumberCard
        label="Ingresos hoy"
        value={formatMoney(data.revenue.todayAmount, data.revenue.currency)}
        caption={data.revenue.projected ? 'proyectado · día abierto' : 'cerrado'}
        trend={data.revenue.vsYesterdayPct != null ? { pct: data.revenue.vsYesterdayPct } : null}
      />
      <AttentionList items={data.attentionNow} />
      <UpcomingCard upcoming={data.upcoming4h} occupancyPct={occupancyPct} />
    </>
  )
}

function ReceptionistBody({ data }: { data: ReceptionistSnapshot }) {
  return (
    <>
      <MovementsList movements={data.movements} />
      {data.pendingCharges.count > 0 && (
        <BigNumberCard
          label="Cobros pendientes"
          value={formatMoney(data.pendingCharges.totalAmount, data.pendingCharges.currency)}
          caption={`${data.pendingCharges.count} ${data.pendingCharges.count === 1 ? 'cuenta' : 'cuentas'} con saldo`}
        />
      )}
      {data.blockedRooms.length > 0 && (
        <View style={styles.blockedCard}>
          <Text style={styles.eyebrow}>Habitaciones bloqueadas · {data.blockedRooms.length}</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {data.blockedRooms.map((b) => (
              <View key={b.blockId} style={styles.blockedRow}>
                <View style={styles.blockedBadge}><Text style={styles.blockedBadgeText}>{b.roomLabel}</Text></View>
                <Text style={styles.blockedReason} numberOfLines={2}>{b.reason}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  )
}

function UpcomingCard({ upcoming, occupancyPct }: { upcoming: SupervisorSnapshot['upcoming4h']; occupancyPct: number }) {
  return (
    <View style={styles.upcomingCard}>
      <Text style={styles.eyebrow}>Próximas 4 horas</Text>
      <View style={styles.upcomingRow}>
        <View style={styles.upcomingItem}>
          <Text style={styles.upcomingValue}>{upcoming.arrivalsCount}</Text>
          <Text style={styles.upcomingLabel}>Llegadas</Text>
        </View>
        <View style={styles.upcomingDivider} />
        <View style={styles.upcomingItem}>
          <Text style={styles.upcomingValue}>{upcoming.departuresCount}</Text>
          <Text style={styles.upcomingLabel}>Salidas</Text>
        </View>
        <View style={styles.upcomingDivider} />
        <View style={styles.upcomingItem}>
          <Text style={styles.upcomingValue}>{occupancyPct}%</Text>
          <Text style={styles.upcomingLabel}>Ocupación</Text>
        </View>
      </View>
      {upcoming.nextEvent && (
        <View style={styles.nextEvent}>
          <Text style={styles.nextEventLabel}>
            {upcoming.nextEvent.kind === 'arrival' ? 'Próxima llegada' : 'Próxima salida'}
          </Text>
          <Text style={styles.nextEventBody}>
            {upcoming.nextEvent.guestName} · Hab. {upcoming.nextEvent.roomLabel} · {new Date(upcoming.nextEvent.timeIso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </Text>
        </View>
      )}
    </View>
  )
}

function roleLabel(role: 'SUPERVISOR' | 'RECEPTIONIST'): string {
  return role === 'SUPERVISOR' ? 'Supervisor' : 'Recepción'
}

// Mini-hook que envuelve refetch para gestionar el `refreshing` flag del RefreshControl
function useRefreshState(refetch: () => Promise<unknown>): [boolean, (v: boolean) => void] {
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    if (!refreshing) return
    let cancelled = false
    refetch().finally(() => {
      if (!cancelled) setRefreshing(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshing, refetch])
  return [refreshing, setRefreshing]
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  loading: { flex: 1, backgroundColor: colors.canvas.primary, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.text.secondary, fontSize: typography.size.body },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontSize: typography.size.bodyLg, color: colors.text.primary, fontWeight: '600' },
  errorBody: { fontSize: typography.size.small, color: colors.text.secondary, textAlign: 'center', maxWidth: 280 },
  lastSync: {
    marginTop: 20,
    marginHorizontal: 20,
    textAlign: 'center',
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  eyebrow: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  upcomingCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  upcomingItem: {
    flex: 1,
    alignItems: 'center',
  },
  upcomingDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.text.tertiary,
  },
  upcomingValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  upcomingLabel: {
    marginTop: 2,
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nextEvent: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.text.tertiary,
  },
  nextEventLabel: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  nextEventBody: {
    marginTop: 4,
    fontSize: typography.size.body,
    color: colors.text.primary,
  },
  blockedCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.canvas.tertiary,
    borderRadius: 12,
  },
  blockedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.urgent[500] + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.urgent[500] + '55',
  },
  blockedBadgeText: {
    color: colors.urgent[500],
    fontSize: typography.size.small,
    fontWeight: '700',
  },
  blockedReason: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.primary,
  },
})
