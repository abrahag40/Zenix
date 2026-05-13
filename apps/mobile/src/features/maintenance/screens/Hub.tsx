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

import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { MaintenanceTicketDto } from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { useMaintenanceTickets } from '../api/useTickets'
import { maintenanceApi } from '../api/maintenance.api'
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

  /*
   * M3.5 — Multi-select mode para bulk-start.
   *
   * UX: long-press en card ACK → entra en multi-select + selecciona ese.
   * Tap toggles selection. FAB cambia a "Iniciar N · Cancelar".
   * Solo tickets ACK pueden ser seleccionados (los demás se ignoran).
   *
   * Pattern iOS Photos / iOS Mail: long-press inicia el mode, tap toggle.
   * Apple HIG 2024: "Enter multi-select via gesture, exit via cancel or
   * action confirmation."
   */
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStarting, setBulkStarting] = useState(false)

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  // Validador: solo los ACK del usuario son seleccionables para bulk-start.
  const ackTicketIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of groups.mine) {
      if (t.status === 'ACKNOWLEDGED') ids.add(t.id)
    }
    return ids
  }, [groups.mine])

  const onPressTicket = useCallback(
    (id: string) => {
      if (selectionMode) {
        // En multi-select, tap toggles selection (solo ACK son válidos)
        if (!ackTicketIds.has(id)) return
        void Haptics.selectionAsync()
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        return
      }
      router.push(`/maintenance/ticket/${id}` as never)
    },
    [router, selectionMode, ackTicketIds],
  )

  const onLongPressTicket = useCallback(
    (id: string) => {
      // Solo ACK habilita el modo bulk-start
      if (!ackTicketIds.has(id)) return
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setSelectionMode(true)
      setSelectedIds(new Set([id]))
    },
    [ackTicketIds],
  )

  async function onBulkStart() {
    if (selectedIds.size === 0) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setBulkStarting(true)
    try {
      const res = await maintenanceApi.bulkStart(Array.from(selectedIds))
      const startedN = res.started.length
      const skippedN = res.skipped.length + res.errors.length
      const msg = skippedN === 0
        ? `${startedN} ticket${startedN === 1 ? '' : 's'} iniciado${startedN === 1 ? '' : 's'}`
        : `${startedN} iniciados · ${skippedN} no se pudieron procesar`
      Alert.alert('Bulk start', msg)
      exitSelectionMode()
      void refetch()
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Error de red'
      Alert.alert('No se pudo iniciar', m)
    } finally {
      setBulkStarting(false)
    }
  }

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
            // M3.3 — border-l semántico + bg tint sutil (paridad W3.5d).
            // hexToRgba con alpha 0.10 da el wash de color de fondo.
            const tintBg = hexToRgba(item.tint, 0.10)
            return (
              <Pressable
                onPress={() =>
                  setCollapsed((s) => ({ ...s, [secKey]: !(s[secKey] ?? false) }))
                }
                style={[
                  styles.sectionHeader,
                  { borderLeftColor: item.tint, backgroundColor: tintBg },
                ]}
              >
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
          return (
            <TicketCard
              ticket={item.ticket}
              onPress={onPressTicket}
              onLongPress={onLongPressTicket}
              selected={selectedIds.has(item.ticket.id)}
              selectionMode={selectionMode}
              selectable={ackTicketIds.has(item.ticket.id)}
            />
          )
        }}
        ListFooterComponent={
          <Pressable
            onPress={() => router.push('/maintenance/history' as never)}
            style={styles.historyLink}
          >
            <Text style={styles.historyLinkText}>📋 Ver histórico (últimos 30 días)</Text>
          </Pressable>
        }
      />

      {/* M3.5 — FAB cambia según mode:
            · Default → "+ Reportar problema"
            · Multi-select → toolbar Cancelar / Iniciar N
          Apple HIG: el bottom action bar reemplaza el FAB cuando hay
          selección activa (iOS Photos pattern). */}
      {selectionMode ? (
        <View style={styles.bulkBar}>
          <Pressable onPress={exitSelectionMode} style={styles.bulkCancelBtn}>
            <Text style={styles.bulkCancelText}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={onBulkStart}
            disabled={selectedIds.size === 0 || bulkStarting}
            style={[styles.bulkStartBtn, (selectedIds.size === 0 || bulkStarting) && styles.bulkStartBtnDisabled]}
          >
            {bulkStarting ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.bulkStartText}>
                Iniciar {selectedIds.size} ticket{selectedIds.size === 1 ? '' : 's'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onReport} style={styles.fab} android_ripple={{ color: '#fff' }}>
          <Text style={styles.fabText}>+ Reportar problema</Text>
        </Pressable>
      )}
    </SafeAreaView>
  )
}

function sectionKeyFromHeaderKey(key: string) {
  return key.replace(/^h-/, '')
}

/**
 * Convierte un hex color a rgba con alpha — para tint backgrounds de los
 * section headers (M3.3 paridad W3.5d). Acepta #RGB o #RRGGBB.
 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
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
    // M3.3 paridad W3.5d — section headers con border-l semántico (4px)
    // + bg sutil del tint (alpha 8%). Pattern NotificationPanel web.
    // Color psicológico §61 D20 — red/amber/blue/violet por urgencia.
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    gap: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  sectionLabel: {
    color: colors.text.primary,
    fontSize: typography.size.bodyLg, // Headline 17pt
    fontWeight: '600',
    flex: 1,
  },
  sectionCountWrap: {
    backgroundColor: 'rgba(255,255,255,0.10)',
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
  // M3.5 — Bulk action bar (reemplaza el FAB cuando hay multi-select)
  bulkBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  bulkCancelBtn: {
    flex: 1,
    backgroundColor: colors.canvas.secondary,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  bulkCancelText: { color: colors.text.primary, fontWeight: '600', fontSize: typography.size.body },
  bulkStartBtn: {
    flex: 2,
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  bulkStartBtnDisabled: { opacity: 0.5 },
  bulkStartText: { color: colors.text.inverse, fontWeight: '700', fontSize: typography.size.body },
  // Link discreto al histórico — Apple HIG: discoverability sin saturar el Hub.
  historyLink: {
    marginTop: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  historyLinkText: { color: colors.brand[400], fontSize: typography.size.body, fontWeight: '500' },
})
