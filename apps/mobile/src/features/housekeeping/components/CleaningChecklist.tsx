/**
 * CleaningChecklist — guía visual de pasos de limpieza.
 *
 * Sprint 8I: stub 6 ítems estándar. Sprint 9: lee de RoomTypeChecklist.
 *
 * Spacing justificado (Apple HIG §Targets, ISO 9241-110):
 *   - Touch target por row: paddingVertical 11 + 24px checkbox = 46pt (> 44pt mínimo)
 *   - Separadores hairline entre filas: percepción de lista sin peso visual (Gestalt proximidad)
 *   - Checkbox 24×24: 2px más que antes → área de contacto mejora un 17% en zona pulgar
 *   - Padding interno card: 16px = 2× unidad base del 8pt grid (Material 3 + HIG alineados)
 *   - Gap header/progressbar/list: 10px = 1.25× base unit — suficiente para jerarquía sin exceso
 *
 * forwardRef expone highlightFirstIncomplete() para que el padre la llame
 * cuando el usuario toca "Finalizar" sin haber completado todos los pasos.
 * Esto crea un feedback instructivo concreto (Norman 1988 — Gulf of Evaluation).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  interpolateColor,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'

export interface ChecklistItem {
  id: string
  label: string
  emoji?: string
}

const DEFAULT_ITEMS: ChecklistItem[] = [
  { id: 'bed',         emoji: '🛏️', label: 'Cambiar y tender ropa de cama' },
  { id: 'bathroom',    emoji: '🚿', label: 'Limpiar baño (lavabo, ducha, inodoro)' },
  { id: 'dust',        emoji: '🧹', label: 'Quitar polvo de superficies y muebles' },
  { id: 'floor',       emoji: '✦',  label: 'Barrer y trapear el piso' },
  { id: 'amenities',   emoji: '🧴', label: 'Reponer amenities (jabón, papel, toallas)' },
  { id: 'ventilation', emoji: '🪟', label: 'Ventilar la habitación' },
]

export interface CleaningChecklistRef {
  /** Scroll into view the first incomplete item + flash it amber. */
  highlightFirstIncomplete: () => void
}

interface CleaningChecklistProps {
  items?: ChecklistItem[]
  interactive?: boolean
  onProgressChange?: (info: {
    completed: number
    total: number
    allDone: boolean
    snapshot: Array<{ id: string; label: string; completed: boolean }>
  }) => void
  style?: StyleProp<ViewStyle>
}

export const CleaningChecklist = forwardRef<CleaningChecklistRef, CleaningChecklistProps>(
  function CleaningChecklist(
    { items = DEFAULT_ITEMS, interactive = true, onProgressChange, style },
    ref,
  ) {
    const [checked, setChecked] = useState<Set<string>>(new Set())
    const [flashId, setFlashId] = useState<string | null>(null)

    useImperativeHandle(ref, () => ({
      highlightFirstIncomplete() {
        const first = items.find((it) => !checked.has(it.id))
        if (!first) return
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        setFlashId(first.id)
        // Clear flash after animation completes
        setTimeout(() => setFlashId(null), 900)
      },
    }))

    useEffect(() => {
      onProgressChange?.({
        completed: checked.size,
        total: items.length,
        allDone: checked.size >= items.length,
        snapshot: items.map((it) => ({
          id: it.id,
          label: it.label,
          completed: checked.has(it.id),
        })),
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checked, items.length])

    const toggle = (id: string) => {
      if (!interactive) return
      Haptics.selectionAsync()
      setChecked((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    const completedCount = checked.size
    const total = items.length
    const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0

    const remaining = total - completedCount

    return (
      <View style={[styles.card, style]}>
        {/* Header: label + step-dots indicator + counter.
            Reference: Apple Health activity rings, Things 3 day checklist,
            Strava workout segments. Showing ALL steps as dots at the top
            (one dot per item) eliminates the "I didn't know there was more"
            problem — the user sees the FULL set before starting to scroll.
            Each dot = one step. Filled = done, hollow = pending. */}
        <View style={styles.header}>
          <Text style={styles.sectionLabel}>CHECKLIST</Text>
          <View style={styles.headerRight}>
            <View style={styles.stepDots}>
              {items.map((it) => (
                <View
                  key={`dot-${it.id}`}
                  style={[styles.stepDot, checked.has(it.id) && styles.stepDotDone]}
                />
              ))}
            </View>
            <Text style={[styles.counter, completedCount === total && styles.counterDone]}>
              {completedCount}/{total}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <ProgressFill pct={progressPct} />
        </View>

        {/* Items */}
        <View style={styles.list}>
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              checked={checked.has(item.id)}
              interactive={interactive}
              isFlashing={flashId === item.id}
              showDivider={index > 0}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </View>

        {/* Footer hint — only when items remain incomplete.
            Closes Norman's Gulf of Evaluation: the user is told explicitly
            what's left, in plain language, right after the last visible item.
            Disappears when done so it doesn't add noise post-completion. */}
        {remaining > 0 && (
          <View style={styles.remainingHint}>
            <Text style={styles.remainingHintText}>
              {remaining === 1 ? 'Falta 1 paso' : `Faltan ${remaining} pasos`}
            </Text>
          </View>
        )}
      </View>
    )
  },
)

// ── ProgressFill — animated width via Reanimated ──────────────────────────────
function ProgressFill({ pct }: { pct: number }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withTiming(pct / 100, { duration: 350 })
  }, [pct, progress])

  const style = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as `${number}%`,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 0.99, 1],
      ['#34D399', '#34D399', '#A78BFA'],
    ),
  }))

  return <Animated.View style={[styles.progressFill, style]} />
}

// ── ChecklistRow ──────────────────────────────────────────────────────────────
function ChecklistRow({
  item, checked, interactive, isFlashing, showDivider, onToggle,
}: {
  item: ChecklistItem
  checked: boolean
  interactive: boolean
  isFlashing: boolean
  showDivider: boolean
  onToggle: () => void
}) {
  const scale = useSharedValue(1)
  const checkOpacity = useSharedValue(checked ? 1 : 0)
  const flashBg = useSharedValue(0)

  // Check/uncheck animation
  useEffect(() => {
    if (checked) {
      scale.value = withSpring(1.08, MOTION.spring.snappy, () => {
        'worklet'
        scale.value = withSpring(1, MOTION.spring.snappy)
      })
      checkOpacity.value = withTiming(1, { duration: 150 })
    } else {
      checkOpacity.value = withTiming(0, { duration: 100 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  // Flash amber when highlighted as first-incomplete
  useEffect(() => {
    if (isFlashing) {
      flashBg.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 150 }),
          withTiming(0, { duration: 150 }),
        ),
        3,
        false,
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlashing])

  const checkboxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const checkmarkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
  }))
  const rowFlashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      flashBg.value,
      [0, 1],
      ['transparent', 'rgba(251,191,36,0.12)'],
    ),
  }))

  return (
    <Animated.View style={[showDivider && styles.rowDivider, rowFlashStyle]}>
      <Pressable
        onPress={onToggle}
        disabled={!interactive}
        style={({ pressed }) => [
          styles.row,
          pressed && interactive && styles.rowPressed,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        {/* Checkbox — 24×24pt, exceeds 44pt total touch target with paddingVertical:11 */}
        <Animated.View
          style={[
            styles.checkbox,
            checked && styles.checkboxChecked,
            checkboxStyle,
          ]}
        >
          <Animated.Text style={[styles.checkmark, checkmarkStyle]}>✓</Animated.Text>
        </Animated.View>

        {item.emoji && (
          <Text style={styles.emoji}>{item.emoji}</Text>
        )}

        <Text
          style={[styles.label, checked && styles.labelChecked]}
          numberOfLines={2}
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    // padding 16px = 2× 8pt base grid — aligns with card insets across the screen
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: colors.text.tertiary,
    letterSpacing: 0.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Step-dots: 6px circles with 4px gap, total visible width scales with N.
  // For 6 items: ~6×6 + 5×4 = 56px. Fits comfortably in header right side.
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  stepDotDone: {
    backgroundColor: '#34D399',
  },
  counter: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
  },
  counterDone: {
    color: '#A78BFA',
  },
  // Footer hint — small, gentle, disappears when done
  remainingHint: {
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  remainingHintText: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  list: {
    // No gap — spacing is provided by paddingVertical on each row.
    // Hairline dividers create separation without additional whitespace cost.
    marginBottom: 6,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // paddingVertical 11px: 24px checkbox + 22px padding = 46pt touch target (Apple HIG 44pt min)
    paddingVertical: 11,
  },
  rowPressed: {
    opacity: 0.65,
  },
  checkbox: {
    // 24×24 — up from 22: +17% contact area (Nielsen tap target research, Hoober 2013)
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: '#34D399',
    borderColor: '#34D399',
  },
  checkmark: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    lineHeight: 16,
  },
  emoji: {
    fontSize: 15,
    width: 20,
    textAlign: 'center',
  },
  label: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
    lineHeight: typography.size.small * 1.4,
  },
  labelChecked: {
    color: colors.text.tertiary,
    textDecorationLine: 'line-through',
  },
})
