/**
 * PendingTasksCard — cross-departmental pending operational items.
 *
 * Surfaces three counts in a single dense card:
 *   - Limpieza pendiente   (HK tasks not done)
 *   - Mtto crítico         (open tickets with priority CRITICAL/HIGH)
 *   - Cobros pendientes    (unpaid folios — RECEPTION+ only)
 *
 * Why this card:
 *   - Research #6 §1.2A — "maintenance issues opened today" was the #8
 *     most-requested information across PMS reviews.
 *   - The receptionist + admin need a single glance for "what's behind
 *     today" — and these three are the recurring backlogs.
 *   - Each pill is tappable (Sprint 9: routes to filtered view).
 *
 * Privacy:
 *   - "Cobros pendientes" hidden for HOUSEKEEPER (financial separation,
 *     same rule as TodayRevenueCard).
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useAuthStore } from '../../../store/auth'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface PendingTasksData {
  /** HK tasks not yet DONE for today. */
  housekeepingPending: number
  /** Mtto tickets opened with high/critical priority + still open. */
  maintenanceCritical: number
  /** Unpaid folios — RECEPTION+ only. */
  unpaidFolios: number
  /** Currency amount sum of pending payments — formatted by caller. */
  unpaidAmountLabel?: string | null
}

interface PendingTasksCardProps {
  data?: PendingTasksData | null
}

export function PendingTasksCard({ data }: PendingTasksCardProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'

  if (!data) return null

  const showFinancial = !isHK && data.unpaidFolios > 0

  return (
    <DashCard label="OPERACIÓN PENDIENTE">
      <View style={styles.row}>
        {/* HK pending — visible to all roles */}
        <PendingPill
          count={data.housekeepingPending}
          label={data.housekeepingPending === 1 ? 'Limpieza' : 'Limpiezas'}
          tone="warning"
          onTap={() => {
            Haptics.selectionAsync()
            // Sprint 9: route to housekeeping filtered list
            router.push('/trabajo')
          }}
        />

        {/* Maintenance — visible to all roles */}
        <PendingPill
          count={data.maintenanceCritical}
          label={data.maintenanceCritical === 1 ? 'Mtto crítico' : 'Mtto críticos'}
          tone="negative"
          onTap={() => {
            Haptics.selectionAsync()
            // Sprint 9: route to maintenance tickets filtered to HIGH/CRITICAL
          }}
        />

        {/* Financial pill — RECEPTION+ only */}
        {showFinancial && (
          <PendingPill
            count={data.unpaidFolios}
            label="Cobros"
            secondary={data.unpaidAmountLabel ?? undefined}
            tone="info"
            onTap={() => {
              Haptics.selectionAsync()
              // Sprint 9: route to folios with status=PARTIAL/UNPAID
            }}
          />
        )}
      </View>
    </DashCard>
  )
}

function PendingPill({
  count,
  label,
  secondary,
  tone,
  onTap,
}: {
  count: number
  label: string
  secondary?: string
  tone: 'warning' | 'negative' | 'info'
  onTap?: () => void
}) {
  const tint =
    tone === 'warning'
      ? { fg: '#FBBF24', bg: 'rgba(245,158,11,0.10)' }
      : tone === 'negative'
        ? { fg: '#F87171', bg: 'rgba(239,68,68,0.10)' }
        : { fg: '#60A5FA', bg: 'rgba(59,130,246,0.10)' }

  const isInactive = count === 0

  const content = (
    <View
      style={[
        styles.pill,
        { backgroundColor: tint.bg },
        isInactive && styles.pillInactive,
      ]}
    >
      <Text
        style={[
          dashboardType.displayLg,
          {
            color: isInactive ? colors.text.tertiary : tint.fg,
            fontSize: 32,
            lineHeight: 36,
          },
        ]}
      >
        {count}
      </Text>
      <Text
        style={[
          dashboardType.caption,
          { color: isInactive ? colors.text.tertiary : tint.fg, fontWeight: typography.weight.semibold },
        ]}
      >
        {label}
      </Text>
      {secondary && (
        <Text style={dashboardType.micro} numberOfLines={1}>
          {secondary}
        </Text>
      )}
    </View>
  )

  if (!onTap || isInactive) return content
  return (
    <Pressable onPress={onTap} style={({ pressed }) => [pressed && { opacity: 0.6 }, styles.pillWrap]}>
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  pillWrap: {
    flex: 1,
  },
  pill: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    gap: 2,
    minHeight: 88,
  },
  pillInactive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
})
