/**
 * History tab — chronological audit trail.
 *
 * Vertical timeline with icon markers. Newest events on top.
 * Each event has a relative + absolute timestamp (Norman 1988 —
 * progressive disclosure: scan by relative, verify by absolute).
 */

import { View, Text, StyleSheet } from 'react-native'
import { EmptyHint } from './_shared'
import { colors } from '../../../../design/colors'
import { typography } from '../../../../design/typography'
import type { ReservationDetail, ReservationHistoryEvent } from '../../types'

const ICON_EMOJI: Record<ReservationHistoryEvent['iconKey'], string> = {
  arrival:   '🛬',
  departure: '🛫',
  payment:   '💳',
  noshow:    '⚠️',
  system:    '⚙️',
  edit:      '✏️',
}

const ICON_BG: Record<ReservationHistoryEvent['iconKey'], string> = {
  arrival:   'rgba(16,185,129,0.15)',
  departure: 'rgba(59,130,246,0.15)',
  payment:   'rgba(168,85,247,0.15)',
  noshow:    'rgba(239,68,68,0.15)',
  system:    'rgba(255,255,255,0.06)',
  edit:      'rgba(245,158,11,0.15)',
}

export function HistoryTab({ reservation: r }: { reservation: ReservationDetail }) {
  if (r.history.length === 0) {
    return (
      <View style={styles.wrap}>
        <EmptyHint>Sin eventos registrados.</EmptyHint>
      </View>
    )
  }

  // Reverse chronological — newest first
  const sorted = [...r.history].reverse()

  return (
    <View style={styles.wrap}>
      {sorted.map((e, idx) => {
        const isLast = idx === sorted.length - 1
        return (
          <View key={e.id} style={styles.eventRow}>
            {/* Icon column with vertical line */}
            <View style={styles.iconCol}>
              <View style={[styles.icon, { backgroundColor: ICON_BG[e.iconKey] }]}>
                <Text style={styles.iconEmoji}>{ICON_EMOJI[e.iconKey]}</Text>
              </View>
              {!isLast && <View style={styles.connector} />}
            </View>

            {/* Body */}
            <View style={styles.body}>
              <Text style={styles.description}>{e.description}</Text>
              <Text style={styles.metaText}>
                {e.whenLabel} · {e.absoluteLabel}
                {e.actorName && ` · por ${e.actorName}`}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconCol: {
    alignItems: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 16,
  },
  connector: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border.subtle,
    marginVertical: 2,
  },
  body: {
    flex: 1,
    paddingBottom: 18,
    gap: 2,
  },
  description: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },
  metaText: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
})
