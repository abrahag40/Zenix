/**
 * TaskCard — single cleaning task row in the Hub.
 *
 * Design rationale:
 *   - Card layout with strong visual hierarchy (room number prominent, status chip secondary).
 *   - Color accent on left edge communicates priority pre-attentively (Treisman 1980).
 *   - Status chip uses the semantic color tokens from design/colors.taskStatus.
 *   - Tap → navigate to task detail (push notif deep-link target).
 *   - Reanimated press scale for tactile feedback (Apple HIG).
 *   - "Hoy entra" + "De ayer" badges shown when applicable (D5 — visual feedback for priority).
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { CleaningStatus } from '@zenix/shared'
import type { CleaningTaskDto } from '@zenix/shared'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'
import { usePropertyType, shouldShowBedLabel } from '../../property/usePropertyType'

interface TaskCardProps {
  task: CleaningTaskDto
  onPress: () => void
  /** When true, another task is IN_PROGRESS so this card is "soft-locked".
   *  Visual: dimmed + "En espera" badge. Tap still calls onPress (Hub
   *  shows the explanatory Alert) — we never silently swallow input
   *  (CLAUDE.md §33 feedback informativo). The visual signal eliminates
   *  the false affordance: user sees the card is locked BEFORE tapping. */
  isLocked?: boolean
}

const STATUS_LABEL: Record<CleaningStatus, string> = {
  [CleaningStatus.PENDING]: 'Esperando salida',
  [CleaningStatus.READY]: 'Lista para limpiar',
  [CleaningStatus.UNASSIGNED]: 'Sin asignar',
  [CleaningStatus.IN_PROGRESS]: 'Limpiando',
  [CleaningStatus.PAUSED]: 'Pausada',
  [CleaningStatus.DONE]: 'Terminada',
  [CleaningStatus.VERIFIED]: 'Verificada ✓',
  [CleaningStatus.CANCELLED]: 'Cancelada',
}

function statusToken(status: CleaningStatus) {
  switch (status) {
    case CleaningStatus.PENDING:    return colors.taskStatus.pendingDeparture
    case CleaningStatus.READY:
    case CleaningStatus.UNASSIGNED: return colors.taskStatus.readyToClean
    case CleaningStatus.IN_PROGRESS:
    case CleaningStatus.PAUSED:     return colors.taskStatus.inProgress
    case CleaningStatus.DONE:       return colors.taskStatus.done
    case CleaningStatus.VERIFIED:   return colors.taskStatus.verified
    default:                        return colors.taskStatus.pendingDeparture
  }
}

function priorityAccent(task: CleaningTaskDto): string {
  if (task.carryoverFromDate && task.hasSameDayCheckIn) return colors.urgent[500]
  if (task.hasSameDayCheckIn) return colors.urgent[400]
  if (task.carryoverFromDate) return colors.warning[500]
  return colors.brand[500]
}

export function TaskCard({ task, onPress, isLocked = false }: TaskCardProps) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const room = task.unit?.room
  const status = statusToken(task.status)
  const accent = priorityAccent(task)
  // Bed-level labels (e.g. "Cama A") only make sense in HOSTAL + SHARED.
  // HOTEL/BOUTIQUE/etc never show them; HOSTAL + PRIVATE rooms suppress
  // them too. Centralized rule in usePropertyType / shouldShowBedLabel.
  const propertyRules = usePropertyType()
  const showBedLabel = shouldShowBedLabel(propertyRules, room?.category)

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.98, MOTION.spring.snappy) }}
      onPressOut={() => { scale.value = withSpring(1, MOTION.spring.snappy) }}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
    >
      <Animated.View style={[styles.card, isLocked && styles.cardLocked, animStyle]}>
        {/* Left accent bar */}
        <View style={[styles.accent, { backgroundColor: accent }]} />

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <View>
              <View style={styles.roomRow}>
                {task.carryoverFromDate && task.hasSameDayCheckIn && (
                  <Text style={styles.priorityBadge}>🔴⚠️</Text>
                )}
                {!task.carryoverFromDate && task.hasSameDayCheckIn && (
                  <Text style={styles.priorityBadge}>🔴</Text>
                )}
                {task.carryoverFromDate && !task.hasSameDayCheckIn && (
                  <Text style={styles.priorityBadge}>⚠️</Text>
                )}
                {task.extensionFlag === 'WITHOUT_CLEANING' && (
                  <Text style={styles.priorityBadge}>✨</Text>
                )}
                <Text style={styles.roomNumber}>Hab. {room?.number ?? '—'}</Text>
              </View>
              {showBedLabel && task.unit && (
                <Text style={styles.unitLabel}>{task.unit.label}</Text>
              )}
            </View>

            {isLocked ? (
              <View style={styles.lockedChip}>
                <Text style={styles.lockedChipText} numberOfLines={1}>En espera</Text>
              </View>
            ) : (
              <View style={[styles.statusChip, { backgroundColor: status.bg, borderColor: status.border }]}>
                <Text style={[styles.statusLabel, { color: status.fg }]} numberOfLines={1}>
                  {STATUS_LABEL[task.status]}
                </Text>
              </View>
            )}
          </View>

          {/* Sub-info */}
          {(task.hasSameDayCheckIn || task.carryoverFromDate || task.extensionFlag) && (
            <View style={styles.subInfoRow}>
              {task.carryoverFromDate && (
                <Text style={styles.subInfo}>De ayer</Text>
              )}
              {task.hasSameDayCheckIn && (
                <Text style={[styles.subInfo, styles.subInfoUrgent]}>
                  Hoy entra
                </Text>
              )}
              {task.extensionFlag === 'WITHOUT_CLEANING' && (
                <Text style={styles.subInfo}>Extensión sin limpieza</Text>
              )}
              {task.extensionFlag === 'WITH_CLEANING' && (
                <Text style={styles.subInfo}>Extensión con limpieza</Text>
              )}
            </View>
          )}
        </View>
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
    minHeight: 76,
  },
  // Locked = another task is IN_PROGRESS. Dim opacity reads as "soft-disabled"
  // (Apple HIG: secondary state, not destructive). User still can tap; the
  // Hub shows the explanatory Alert. Avoiding `pointerEvents="none"` keeps
  // the action intentional rather than swallowed (CLAUDE.md §33).
  cardLocked: {
    opacity: 0.45,
  },
  lockedChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lockedChipText: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.3,
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityBadge: {
    fontSize: 14,
  },
  roomNumber: {
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  unitLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 140,
  },
  statusLabel: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  },
  subInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subInfo: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  subInfoUrgent: {
    color: colors.urgent[400],
    fontWeight: typography.weight.semibold,
  },
})
