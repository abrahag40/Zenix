/**
 * ApprovalsListScreen — full list when "Ver todas" tapped on dashboard
 * card. Sprint 8I uses mocks; Sprint 9 wires `GET /v1/approvals/pending`.
 *
 * Each row: same shape as the dashboard card row but full-width and
 * grouped by kind. Tap row → /approvals/[id] for detail with audit log.
 */

import { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_APPROVALS,
} from '../../dashboard/__mocks__/mockDashboard'
import type { ApprovalRequest, ApprovalKind } from '../../dashboard/components/PendingApprovalsCard'

const KIND_INFO: Record<ApprovalKind, { emoji: string; label: string; tint: string }> = {
  LATE_CHECKOUT:  { emoji: '🕐', label: 'Late check-out', tint: '#FBBF24' },
  EARLY_CHECKIN:  { emoji: '⏰', label: 'Early check-in', tint: '#FBBF24' },
  COMP:           { emoji: '🎟', label: 'Cortesías',      tint: '#A78BFA' },
  BLOCK_RELEASE:  { emoji: '🔓', label: 'Liberar bloqueos', tint: '#60A5FA' },
  WAIVE_FEE:      { emoji: '🤝', label: 'Perdonar cargos', tint: '#A78BFA' },
  OTHER:          { emoji: '📝', label: 'Otros',          tint: '#9CA3AF' },
}

export function ApprovalsListScreen() {
  const list: ApprovalRequest[] = MOCKS_DASHBOARD_ENABLED ? MOCK_APPROVALS : []

  const grouped = useMemo(() => {
    const map = new Map<ApprovalKind, ApprovalRequest[]>()
    for (const r of list) {
      const arr = map.get(r.kind) ?? []
      arr.push(r)
      map.set(r.kind, arr)
    }
    const order: ApprovalKind[] = [
      'LATE_CHECKOUT', 'EARLY_CHECKIN', 'COMP', 'WAIVE_FEE', 'BLOCK_RELEASE', 'OTHER',
    ]
    return order.flatMap((k) => (map.has(k) ? [{ kind: k, items: map.get(k)! }] : []))
  }, [list])

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Aprobaciones pendientes" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {list.length === 0 ? (
          <Text style={styles.empty}>Sin aprobaciones pendientes ✓</Text>
        ) : (
          <Text style={styles.summary}>
            {list.length} solicitudes esperando tu aprobación
          </Text>
        )}

        {grouped.map(({ kind, items }) => {
          const info = KIND_INFO[kind]
          return (
            <View key={kind} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupEmoji}>{info.emoji}</Text>
                <Text style={[dashboardType.sectionLabel, { color: info.tint }]}>
                  {info.label.toUpperCase()}
                </Text>
                <Text style={styles.groupCount}>· {items.length}</Text>
              </View>

              {items.map((req) => (
                <Pressable
                  key={req.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => {
                    Haptics.selectionAsync()
                    router.push(`/approvals/${req.id}`)
                  }}
                >
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
                        {req.title}
                      </Text>
                      {req.amountLabel && (
                        <Text style={[dashboardType.bodyEmphasis, { color: info.tint }]}>
                          {req.amountLabel}
                        </Text>
                      )}
                    </View>
                    <Text style={dashboardType.caption} numberOfLines={1}>
                      {req.subline}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas.primary },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 22 },
  summary: {
    fontSize: 16, color: colors.text.secondary, lineHeight: 22, paddingTop: 4,
  },
  empty: {
    paddingTop: 80, textAlign: 'center', fontSize: 16,
    color: colors.text.tertiary, fontStyle: 'italic',
  },
  group: { gap: 8 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  groupEmoji: { fontSize: 14 },
  groupCount: {
    fontSize: 11, color: colors.text.tertiary, fontWeight: typography.weight.medium,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: colors.canvas.secondary,
    borderWidth: 1, borderColor: colors.border.subtle,
  },
  rowPressed: { opacity: 0.6 },
  rowBody: { flex: 1, gap: 4 },
  rowTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  chevron: {
    fontSize: 22, color: colors.text.tertiary, fontWeight: '300',
  },
})
