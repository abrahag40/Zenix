/**
 * NoShowsListCard — visual list of potential no-shows.
 *
 * Surfaces only after the property's `potentialNoShowWarningHour`
 * (default 20:00 local). CLAUDE.md §36: the day-hotel ends at the
 * night audit (~02:00), so this card should remain useful into the
 * early hours.
 *
 * Why a LIST and not just a counter:
 *   - Receptionists asked specifically: "I want to SEE who hasn't
 *     arrived, not just how many." (User's exact request, this turn.)
 *   - A visible name + room is actionable — the receptionist can
 *     tap to call/WhatsApp before the night audit fires.
 *   - Stripe's "Failing payments" list pattern, Linear's "Issues
 *     needing attention" pattern: surface concrete items, not
 *     abstract counts.
 *
 * Layout per row:
 *   ┌──────────────────────────────────────────────┐
 *   │ ⚠️  María García                Hab. 203     │
 *   │     CheckIn 15:00 · ahora 21:42   ▸          │
 *   └──────────────────────────────────────────────┘
 *
 * Tap → ReservationDetailScreen (Sprint 9 wiring).
 *
 * Privacy: this card is reception-only. The dashboard MUST guard
 * before rendering it for HOUSEKEEPER role (kpiPolicy already does
 * via DTO redaction; this component trusts the DTO).
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface NoShowItem {
  stayId: string
  guestName: string
  roomNumber: string | null
  expectedCheckInLabel: string  // pre-formatted by API ("15:00", "ayer 14:00")
  hoursOverdue: number          // for tint intensity
}

interface NoShowsListCardProps {
  items?: NoShowItem[]
  onPressItem?: (stayId: string) => void
}

function tintForOverdue(hours: number): string {
  if (hours >= 4) return '#F87171' // red — critical
  if (hours >= 2) return '#FBBF24' // amber — warning
  return '#FCD34D'                  // soft amber — early
}

export function NoShowsListCard({ items, onPressItem }: NoShowsListCardProps) {
  const list = items ?? []
  const count = list.length

  if (count === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>Llegadas pendientes</Text>
          <Text style={styles.subText}>—</Text>
        </View>
        <Text style={styles.emptyMsg}>
          Todos los huéspedes esperados ya llegaron. ✓
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Llegadas pendientes</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>

      <View style={styles.list}>
        {list.slice(0, 4).map((item) => {
          const tint = tintForOverdue(item.hoursOverdue)
          return (
            <Pressable
              key={item.stayId}
              style={styles.row}
              onPress={() => onPressItem?.(item.stayId)}
            >
              <View style={[styles.dot, { backgroundColor: tint }]} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.guestName} numberOfLines={1}>
                    {item.guestName}
                  </Text>
                  {item.roomNumber && (
                    <Text style={styles.roomChip}>Hab. {item.roomNumber}</Text>
                  )}
                </View>
                <Text style={styles.rowMeta}>
                  Check-in {item.expectedCheckInLabel}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.text.tertiary }]}>›</Text>
            </Pressable>
          )
        })}
      </View>

      {count > 4 && (
        <Text style={styles.viewMore}>Ver {count - 4} más →</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.20)',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
  },
  subText: {
    fontSize: typography.size.body,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  countBadge: {
    backgroundColor: 'rgba(245,158,11,0.20)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: typography.size.small,
    color: '#FBBF24',
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestName: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
    flexShrink: 1,
  },
  roomChip: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rowMeta: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  viewMore: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
    textAlign: 'right',
  },
  emptyMsg: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
})
