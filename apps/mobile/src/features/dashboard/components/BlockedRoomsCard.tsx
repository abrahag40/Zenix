/**
 * BlockedRoomsCard — preview card on the dashboard.
 *
 * v2 changes (Research #6 follow-up + bug-report close-blank-modal):
 *   - Modal pattern REMOVED. The previous version had a `<Modal>` whose
 *     body was conditionally rendered via `selected && (...)`. Pressing
 *     close set `selected` to null instantly, which unmounted the body
 *     before the slide-down animation finished — producing the "blank
 *     while closing" bug.
 *   - Tap row → navigates to `/blocked-rooms/[id]` (proper screen).
 *   - Card caps at 3 visible rows. If `count > 3`, footer becomes a
 *     "Ver todas (N)" CTA → `/blocked-rooms` (full list with grouping).
 *
 * Card composition: built from `_DashCard` shell to share padding,
 * header pattern, and CTA footer with every other dashboard card.
 *
 * Saturation guard:
 *   ≤3 blocked rooms → 3 rows visible, no CTA
 *   >3 blocked rooms → 3 rows visible + "Ver todas (N)" CTA
 *
 * Justification for cap=3:
 *   - Apple Today widgets pattern (max 3 list items)
 *   - Linear "My Issues" (max 3 before "View all")
 *   - 7±2 working memory minus the card frame's 2 elements (label + count)
 *     = 3 actionable rows max before saturation (Sweller 1988)
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface BlockedRoom {
  id: string
  roomNumber: string
  reason: string
  category: 'MAINTENANCE' | 'RENOVATION' | 'ADMIN' | 'OTHER'
  startsAt: string
  endsAt: string | null
  rangeLabel: string
  requestedByName?: string | null
  approvedByName?: string | null
  ticketId?: string | null
}

interface BlockedRoomsCardProps {
  rooms?: BlockedRoom[]
}

const CATEGORY_TINT: Record<
  BlockedRoom['category'],
  { fg: string; bg: string; emoji: string; label: string }
> = {
  MAINTENANCE: { bg: 'rgba(245,158,11,0.14)', fg: '#FBBF24', emoji: '🔧', label: 'Mtto' },
  RENOVATION:  { bg: 'rgba(168,139,250,0.14)', fg: '#A78BFA', emoji: '🎨', label: 'Renov.' },
  ADMIN:       { bg: 'rgba(59,130,246,0.14)', fg: '#60A5FA', emoji: '🔒', label: 'Admin' },
  OTHER:       { bg: 'rgba(255,255,255,0.06)', fg: '#9CA3AF', emoji: '•', label: 'Otro' },
}

const VISIBLE_CAP = 3

export function BlockedRoomsCard({ rooms }: BlockedRoomsCardProps) {
  const list = rooms ?? []
  if (list.length === 0) return null

  const visible = list.slice(0, VISIBLE_CAP)
  const overflow = list.length - VISIBLE_CAP

  const navigateToList = () => {
    router.push('/blocked-rooms')
  }

  return (
    <DashCard
      label="HABITACIONES BLOQUEADAS"
      labelColor="#FBBF24"
      accentColor="#FBBF24"
      tintBg="rgba(245,158,11,0.06)"
      tintBorder="rgba(245,158,11,0.20)"
      trailing={
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      }
      cta={
        overflow > 0
          ? { label: `Ver todas (${list.length})`, onPress: navigateToList, tone: 'primary' }
          : undefined
      }
    >
      <View style={styles.list}>
        {visible.map((room) => (
          <BlockedRoomRow key={room.id} room={room} />
        ))}
      </View>
    </DashCard>
  )
}

function BlockedRoomRow({ room }: { room: BlockedRoom }) {
  const tint = CATEGORY_TINT[room.category]
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync()
        router.push(`/blocked-rooms/${room.id}`)
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.roomBadge, { backgroundColor: tint.bg, borderColor: tint.fg }]}>
        <Text style={[styles.roomBadgeText, { color: tint.fg }]}>{room.roomNumber}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
            {room.reason}
          </Text>
        </View>
        <Text style={dashboardType.caption} numberOfLines={1}>
          {tint.emoji} {tint.label} · {room.rangeLabel}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  countBadge: {
    backgroundColor: 'rgba(245,158,11,0.20)',
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    color: '#FBBF24',
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  roomBadge: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  roomBadgeText: {
    fontSize: 14,
    fontWeight: typography.weight.bold,
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
  chevron: {
    fontSize: 22,
    color: colors.text.tertiary,
    fontWeight: '300',
    paddingHorizontal: 4,
  },
})
