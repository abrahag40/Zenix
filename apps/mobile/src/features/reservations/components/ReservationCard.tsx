/**
 * ReservationCard — atomic list unit (Hostaway/Cloudbeds pattern).
 *
 * Layout (single tap target, ~110px tall):
 *   ┌─────────────────────────────────────────────┐
 *   │ ●●  María García                Hab. 203    │
 *   │     Hoy 15:00 → Mañana 12:00      ⚪ 2 pax  │
 *   │     Booking ✓                               │
 *   └─────────────────────────────────────────────┘
 *
 * Visual encoding:
 *   - Left avatar disc with initials (or status icon if redacted)
 *   - Status chip top-right via accent border-left + dot
 *   - OTA source as small badge under the date range
 *
 * Why this design:
 *   - Fitts's Law: full-width press target, ~110px tall = thumb-friendly
 *   - 7±2: 4-5 pieces of info per row (name, room, dates, pax, source)
 *   - Pre-attentive (Treisman): status color carries meaning before reading
 *   - Apple HIG: list item with leading + trailing accessory
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'
import { SourceBadge } from './SourceBadge'
import type { ReservationListItem, ReservationStatus } from '../types'

interface ReservationCardProps {
  item: ReservationListItem
  onPress: () => void
}

const STATUS_TINT: Record<ReservationStatus, { bg: string; fg: string; dot: string }> = {
  UNCONFIRMED: { bg: 'rgba(245,158,11,0.12)', fg: '#FBBF24', dot: '#FBBF24' },
  IN_HOUSE:    { bg: 'rgba(16,185,129,0.12)',  fg: '#34D399', dot: '#34D399' },
  DEPARTING:   { bg: 'rgba(59,130,246,0.12)',  fg: '#60A5FA', dot: '#60A5FA' },
  UPCOMING:    { bg: 'rgba(255,255,255,0.04)', fg: '#9CA3AF', dot: '#9CA3AF' },
  NO_SHOW:     { bg: 'rgba(239,68,68,0.12)',   fg: '#F87171', dot: '#F87171' },
  DEPARTED:    { bg: 'rgba(255,255,255,0.04)', fg: '#9CA3AF', dot: '#9CA3AF' },
  CANCELLED:   { bg: 'rgba(255,255,255,0.04)', fg: '#9CA3AF', dot: '#9CA3AF' },
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  UNCONFIRMED: 'Sin confirmar',
  IN_HOUSE:    'En casa',
  DEPARTING:   'Sale hoy',
  UPCOMING:    'Próxima',
  NO_SHOW:     'No-show',
  DEPARTED:    'Salió',
  CANCELLED:   'Cancelada',
}

function initials(name: string): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function ReservationCard({ item, onPress }: ReservationCardProps) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const tint = STATUS_TINT[item.status]

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
    >
      <Animated.View style={[styles.card, animStyle]}>
        {/* Left accent bar (status color) */}
        <View style={[styles.accent, { backgroundColor: tint.dot }]} />

        {/* Avatar disc */}
        <View style={[styles.avatar, { backgroundColor: tint.bg, borderColor: tint.fg }]}>
          <Text style={[styles.avatarText, { color: tint.fg }]}>{initials(item.guestName)}</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.row1}>
            <Text style={styles.guestName} numberOfLines={1}>
              {item.guestName}
            </Text>
            <View style={styles.rightBlock}>
              {item.roomNumber && (
                <Text style={styles.roomNumber}>Hab. {item.roomNumber}</Text>
              )}
            </View>
          </View>

          <Text style={styles.dateRange} numberOfLines={1}>
            {item.dateRangeLabel}
          </Text>

          <View style={styles.metaRow}>
            <View style={[styles.statusChip, { backgroundColor: tint.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: tint.fg }]} />
              <Text style={[styles.statusLabel, { color: tint.fg }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <SourceBadge source={item.source} />
            <Text style={styles.paxLabel}>· {item.paxCount} pax</Text>
            {item.unitLabel && (
              <Text style={styles.unitLabel}>· {item.unitLabel}</Text>
            )}
          </View>
        </View>

        {/* Trailing chevron */}
        <Text style={styles.chevron}>›</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minHeight: 88,
    alignItems: 'center',
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  avatarText: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  row1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  guestName: {
    flex: 1,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  rightBlock: {
    flexShrink: 0,
  },
  roomNumber: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
  },
  dateRange: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
  paxLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  unitLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    fontWeight: '300',
    paddingHorizontal: 14,
  },
})
