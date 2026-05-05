/**
 * SpecialRequestsCard — Capa 2 (ACTION).
 *
 * Surfaces guest-specific requests pending fulfillment today.
 * Hostaway widget #1 by user satisfaction, and 23% of boutique-hotel
 * complaints come from unfulfilled special requests (Baymard 2023).
 *
 * Privacy:
 *   - Guest names hidden for HOUSEKEEPER (housekeeper sees the operative
 *     instruction "vista al mar Hab. 312" but not who requested it).
 *
 * Icon system (extensible):
 *   The user's primary example was "vista al mar". Most LATAM hotels see
 *   a recurring set of request types — captured here as a fixed enum
 *   so backend Sprint 9 can return one of these and the UI renders the
 *   right icon without a dictionary lookup. Fallback icon for `OTHER`.
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { useAuthStore } from '../../../store/auth'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type SpecialRequestType =
  | 'OCEAN_VIEW'        // 🌅 vista al mar
  | 'EXTRA_BED'         // 🛏 cama extra
  | 'CRIB'              // 👶 cuna para bebé
  | 'CELEBRATION'       // 🥂 botella de vino / cumpleaños / aniversario
  | 'EARLY_CHECKIN'     // ⏰ check-in temprano
  | 'LATE_CHECKOUT'     // 🕐 late check-out
  | 'ACCESSIBILITY'     // ♿ habitación accesible
  | 'DIETARY'           // 🥗 dietética / vegano / sin gluten
  | 'QUIET_ROOM'        // 🤫 lejos del elevador / piso silencioso
  | 'AIRPORT_PICKUP'    // 🚐 transfer aeropuerto
  | 'OTHER'             // 📝 nota libre

export interface SpecialRequest {
  id: string
  type: SpecialRequestType
  /** Free-text description (specific note). */
  description: string
  /** Backend-redacted by role: null for HOUSEKEEPER. */
  guestName: string | null
  roomNumber: string | null
  /** Pre-formatted "hoy 15:00", "ahora", "mañana check-in". */
  whenLabel: string
  /** Optional priority — affects color tint. */
  priority?: 'normal' | 'high'
  /** Whether the request has been marked as fulfilled. */
  fulfilled?: boolean
}

interface SpecialRequestsCardProps {
  requests?: SpecialRequest[]
}

const TYPE_INFO: Record<
  SpecialRequestType,
  { emoji: string; label: string }
> = {
  OCEAN_VIEW:     { emoji: '🌅', label: 'Vista al mar' },
  EXTRA_BED:      { emoji: '🛏',  label: 'Cama extra' },
  CRIB:           { emoji: '👶', label: 'Cuna' },
  CELEBRATION:    { emoji: '🥂', label: 'Celebración' },
  EARLY_CHECKIN:  { emoji: '⏰', label: 'Check-in temprano' },
  LATE_CHECKOUT:  { emoji: '🕐', label: 'Late check-out' },
  ACCESSIBILITY:  { emoji: '♿', label: 'Accesibilidad' },
  DIETARY:        { emoji: '🥗', label: 'Dietética' },
  QUIET_ROOM:     { emoji: '🤫', label: 'Habitación silenciosa' },
  AIRPORT_PICKUP: { emoji: '🚐', label: 'Transfer aeropuerto' },
  OTHER:          { emoji: '📝', label: 'Solicitud' },
}

const ROW_CAP = 3

export function SpecialRequestsCard({ requests }: SpecialRequestsCardProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'

  const list = requests ?? []
  // Hide entirely when no pending requests — keeps dashboard signal-rich
  if (list.length === 0) return null

  const visible = list.slice(0, ROW_CAP)
  const overflow = list.length - ROW_CAP

  return (
    <DashCard
      label="SOLICITUDES ESPECIALES"
      trailing={
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{list.length}</Text>
        </View>
      }
      cta={
        overflow > 0
          ? {
              label: `Ver todas (${list.length})`,
              tone: 'primary',
              onPress: () => router.push('/special-requests'),
            }
          : undefined
      }
    >
      <View style={styles.list}>
        {visible.map((r) => (
          <RequestRow key={r.id} request={r} isHK={isHK} />
        ))}
      </View>
    </DashCard>
  )
}

function RequestRow({ request, isHK }: { request: SpecialRequest; isHK: boolean }) {
  const info = TYPE_INFO[request.type]
  const isHigh = request.priority === 'high'

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync()
        // Sprint 9: route to /special-requests/[id]
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconCircle, isHigh && styles.iconCircleHigh]}>
        <Text style={styles.iconEmoji}>{info.emoji}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={dashboardType.bodyEmphasis} numberOfLines={1}>
            {request.description}
          </Text>
          {isHigh && (
            <View style={styles.priorityChip}>
              <Text style={styles.priorityText}>!</Text>
            </View>
          )}
        </View>
        <Text style={dashboardType.caption} numberOfLines={1}>
          {request.roomNumber ? `Hab. ${request.roomNumber}` : '—'}
          {!isHK && request.guestName ? ` · ${request.guestName}` : ''}
          {' · '}{request.whenLabel}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  countBadge: {
    backgroundColor: 'rgba(167,139,250,0.20)',
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    color: '#A78BFA',
    fontWeight: typography.weight.bold,
  },
  list: {
    gap: 6,
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
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleHigh: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderColor: '#FBBF24',
  },
  iconEmoji: {
    fontSize: 18,
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
  priorityChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    fontSize: 12,
    color: '#1F1B1B',
    fontWeight: typography.weight.heavy,
  },
  chevron: {
    fontSize: 22,
    color: colors.text.tertiary,
    fontWeight: '300',
    paddingHorizontal: 4,
  },
})
