/**
 * MaintenanceHub — REAL implementation (Sprint Mx-1B-M).
 *
 * Reemplaza el ModuleStub. Hub del técnico de mantenimiento con secciones
 * priorizadas (CLAUDE.md §59 D18 — Treisman pre-attentive):
 *
 *   🔥 Crítico              — CRITICAL asignados a mí o en cola
 *   👷 Mis tickets          — ACK / IN_PROGRESS asignados a mí
 *   📥 Disponibles          — OPEN sin asignar (voluntary pickup)
 *   ⏸ En espera de piezas  — WAITING_PARTS propios
 *
 *   Si role===SUPERVISOR mostrar primero:
 *   🟡 Esperando tu aprobación — requiresApproval && pendingApproval
 *
 * Pull-to-refresh + tap-to-detail + FAB "+ Reportar problema".
 */

import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import type { MaintenanceTicketDto } from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { useMaintenanceTickets } from '../api/useTickets'
import { TicketCard } from '../components/TicketCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

type SectionLevel = 'critical' | 'warning' | 'normal' | 'info'

type ListItem =
  | {
      type: 'header'
      key: string
      label: string
      tint: string
      level: SectionLevel
      count: number
    }
  | { type: 'ticket'; key: string; ticket: MaintenanceTicketDto }
  | { type: 'empty'; key: string; label: string }

interface SectionConfig {
  key: 'pendingApproval' | 'critical' | 'mine' | 'queue' | 'waitingParts'
  label: string
  tint: string
  level: SectionLevel
  emptyLabel?: string
}

export function MaintenanceHub() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { groups, isLoading, isRefreshing, error, refetch } = useMaintenanceTickets()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const isSupervisor = user?.role === 'SUPERVISOR'

  // Configuración de secciones — orden importa (pre-attentive top→bottom)
  const sections: SectionConfig[] = []
  if (isSupervisor && groups.pendingApproval.length > 0) {
    sections.push({
      key: 'pendingApproval',
      label: '🟡 Esperando tu aprobación',
      tint: '#FBBF24',
      level: 'warning',
    })
  }
  if (groups.critical.length > 0) {
    sections.push({
      key: 'critical',
      label: '🔥 Crítico',
      tint: '#F87171',
      level: 'critical',
    })
  }
  sections.push({
    key: 'mine',
    label: '👷 Mis tickets',
    tint: '#34D399',
    level: 'normal',
    emptyLabel: 'Sin tickets asignados ahora',
  })
  sections.push({
    key: 'queue',
    label: '📥 Disponibles en cola',
    tint: '#60A5FA',
    level: 'info',
    emptyLabel: 'No hay tickets en cola',
  })
  if (groups.waitingParts.length > 0) {
    sections.push({
      key: 'waitingParts',
      label: '⏸ Esperando piezas',
      tint: '#A78BFA',
      level: 'info',
    })
  }

  // Construir flat list combinando headers + ticket cards
  const data: ListItem[] = []
  for (const sec of sections) {
    const list = groups[sec.key]
    data.push({
      type: 'header',
      key: `h-${sec.key}`,
      label: sec.label,
      tint: sec.tint,
      level: sec.level,
      count: list.length,
    })
    if (list.length === 0 && sec.emptyLabel) {
      data.push({ type: 'empty', key: `e-${sec.key}`, label: sec.emptyLabel })
    } else if (!collapsed[sec.key]) {
      for (const t of list) {
        data.push({ type: 'ticket', key: `t-${t.id}`, ticket: t })
      }
    }
  }

  const onPressTicket = useCallback(
    (id: string) => {
      router.push(`/maintenance/ticket/${id}` as never)
    },
    [router],
  )

  const onReport = useCallback(() => {
    router.push('/maintenance/report' as never)
  }, [router])

  if (isLoading) {
    return (
      <SafeAreaView style={styles.canvas}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.brand[500]} size="large" />
          <Text style={styles.loaderText}>Cargando tus tickets…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.canvas}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>No pudimos cargar los tickets</Text>
          <Text style={styles.errorBody}>{error.message}</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const totalActive =
    groups.critical.length +
    groups.mine.length +
    groups.queue.length +
    groups.waitingParts.length +
    (isSupervisor ? groups.pendingApproval.length : 0)

  return (
    <SafeAreaView style={styles.canvas} edges={['top']}>
      {/* Header del Hub — saludo + resumen */}
      <View style={styles.hubHeader}>
        <Text style={styles.hello}>{greet(user?.name)}</Text>
        <Text style={styles.summary}>
          {totalActive === 0
            ? 'Sin tickets activos. Buen día 🌿'
            : `${totalActive} ticket${totalActive === 1 ? '' : 's'} activo${totalActive === 1 ? '' : 's'}`}
        </Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetch}
            tintColor={colors.brand[500]}
          />
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            const secKey = sectionKeyFromHeaderKey(item.key)
            const isCol = collapsed[secKey] ?? false
            return (
              <Pressable
                onPress={() =>
                  setCollapsed((s) => ({ ...s, [secKey]: !(s[secKey] ?? false) }))
                }
                style={styles.sectionHeader}
              >
                <View style={[styles.sectionAccent, { backgroundColor: item.tint }]} />
                <Text style={styles.sectionLabel}>{item.label}</Text>
                <View style={styles.sectionCountWrap}>
                  <Text style={styles.sectionCount}>{item.count}</Text>
                </View>
                <Text style={styles.collapseIcon}>{isCol ? '▸' : '▾'}</Text>
              </Pressable>
            )
          }
          if (item.type === 'empty') {
            return (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>{item.label}</Text>
              </View>
            )
          }
          return <TicketCard ticket={item.ticket} onPress={onPressTicket} />
        }}
      />

      {/* FAB "+ Reportar problema" — visible siempre para el técnico */}
      <Pressable onPress={onReport} style={styles.fab} android_ripple={{ color: '#fff' }}>
        <Text style={styles.fabText}>+ Reportar problema</Text>
      </Pressable>
    </SafeAreaView>
  )
}

function sectionKeyFromHeaderKey(key: string) {
  return key.replace(/^h-/, '')
}

function greet(name?: string | null) {
  const h = new Date().getHours()
  const slot = h < 12 ? 'Buen día' : h < 19 ? 'Buena tarde' : 'Buena noche'
  return name ? `${slot}, ${name.split(' ')[0]}` : slot
}

// Apple HIG (testing T-6/T-9): 8pt grid, body 15pt, headline 17pt semibold
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.canvas.primary },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { color: colors.text.secondary, fontSize: typography.size.body },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorTitle: { color: colors.text.primary, fontSize: typography.size.bodyLg, fontWeight: '600' },
  errorBody: { color: colors.text.secondary, fontSize: typography.size.body, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: colors.text.inverse, fontWeight: '600', fontSize: typography.size.body },
  hubHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  hello: {
    color: colors.text.primary,
    fontSize: typography.size.titleLg, // 24pt — Title 1
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  summary: { color: colors.text.secondary, fontSize: typography.size.body, marginTop: 6 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: 8,
    gap: 10,
  },
  sectionAccent: { width: 4, height: 18, borderRadius: 2 },
  sectionLabel: {
    color: colors.text.primary,
    fontSize: typography.size.bodyLg, // Headline 17pt
    fontWeight: '600',
    flex: 1,
  },
  sectionCountWrap: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
  },
  sectionCount: { color: colors.text.secondary, fontSize: typography.size.small, fontWeight: '700' },
  collapseIcon: { color: colors.text.tertiary, fontSize: typography.size.small, width: 16, textAlign: 'center' },
  emptyRow: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyText: { color: colors.text.tertiary, fontSize: typography.size.body, fontStyle: 'italic', textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: { color: colors.text.inverse, fontWeight: '700', fontSize: typography.size.body },
})
