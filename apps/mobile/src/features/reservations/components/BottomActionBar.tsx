/**
 * BottomActionBar — contextual CTA bar for ReservationDetailScreen.
 *
 * Buttons rendered are CONTEXTUAL by reservation status (Research #4 §5.2):
 *   UNCONFIRMED + arrives today  → [Confirmar check-in] [⚠ no-show]
 *                                  (only after warning hour, but Sprint 9
 *                                   wires the warning-hour gate; for now
 *                                   we always show no-show on UNCONFIRMED.)
 *   IN_HOUSE + not arrival day   → [Salida anticipada] [Check-out]
 *   IN_HOUSE + arrival day       → [Check-out]
 *   NO_SHOW (<48h)               → [↩ Revertir no-show]
 *   DEPARTED / CANCELLED         → no bar (read-only)
 *
 * Position: fixed bottom with safe-area inset, separator line above.
 * Z-stack: above the ScrollView content via absolute positioning.
 *
 * UX:
 *   - Primary action = emerald filled (high affordance)
 *   - Destructive action = red outlined (forcing function via color
 *     + confirmation Alert before mutation; CLAUDE.md §32)
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import type { ReservationDetail } from '../types'

interface Props {
  reservation: ReservationDetail
  onConfirmCheckin: () => void
  onMarkNoShow: () => void
  onCheckout: () => void
  onEarlyCheckout: () => void
  onRevertNoShow: () => void
}

function isArrivalToday(checkinAt: string): boolean {
  const d = new Date(checkinAt)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

export function BottomActionBar({
  reservation: r,
  onConfirmCheckin,
  onMarkNoShow,
  onCheckout,
  onEarlyCheckout,
  onRevertNoShow,
}: Props) {
  const insets = useSafeAreaInsets()
  const arrivesToday = isArrivalToday(r.checkinAt)
  const noShowAgeHours = hoursSince(r.noShowAt)
  const canRevertNoShow = r.status === 'NO_SHOW' && noShowAgeHours < 48

  // ── Decide buttons by status ────────────────────────────────────
  const buttons: { label: string; emoji?: string; variant: 'primary' | 'danger' | 'secondary'; onPress: () => void }[] = []

  if (r.status === 'UNCONFIRMED') {
    buttons.push({
      label: 'Confirmar check-in',
      emoji: '✓',
      variant: 'primary',
      onPress: onConfirmCheckin,
    })
    buttons.push({
      label: 'Marcar no-show',
      emoji: '⚠',
      variant: 'danger',
      onPress: onMarkNoShow,
    })
  } else if (r.status === 'IN_HOUSE') {
    if (!arrivesToday) {
      buttons.push({
        label: 'Salida anticipada',
        emoji: '🛫',
        variant: 'secondary',
        onPress: onEarlyCheckout,
      })
    }
    buttons.push({
      label: 'Check-out',
      emoji: '✓',
      variant: 'primary',
      onPress: onCheckout,
    })
  } else if (r.status === 'DEPARTING') {
    buttons.push({
      label: 'Check-out',
      emoji: '✓',
      variant: 'primary',
      onPress: onCheckout,
    })
  } else if (canRevertNoShow) {
    buttons.push({
      label: '↩ Revertir no-show',
      variant: 'secondary',
      onPress: onRevertNoShow,
    })
  }

  // No actions → don't render the bar (read-only states)
  if (buttons.length === 0) return null

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.row}>
        {buttons.map((b, i) => {
          const variantStyle =
            b.variant === 'primary'
              ? styles.primary
              : b.variant === 'danger'
                ? styles.danger
                : styles.secondary
          const labelStyle =
            b.variant === 'primary'
              ? styles.primaryLabel
              : b.variant === 'danger'
                ? styles.dangerLabel
                : styles.secondaryLabel
          return (
            <Pressable
              key={i}
              style={[styles.btn, variantStyle]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                b.onPress()
              }}
            >
              <Text style={labelStyle}>
                {b.emoji ? `${b.emoji}  ` : ''}{b.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.canvas.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.brand[500],
  },
  primaryLabel: {
    fontSize: typography.size.body,
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
  },
  danger: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  dangerLabel: {
    fontSize: typography.size.body,
    color: '#F87171',
    fontWeight: typography.weight.semibold,
  },
  secondary: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  secondaryLabel: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
})
