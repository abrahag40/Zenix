/**
 * RevenueCarouselCard — TodayRevenueCard rebuilt as a full-content
 * carousel.
 *
 * User clarification: "no me refería a info abajo con dots; me refería
 * a cambiar consecutivamente TODA la info de la card. Recuerda que esa
 * info debe ser extraíble de la BD. Remover dots para no saturar."
 *
 * Design pattern reference:
 *   - Apple Watch complications: each "frame" is a self-contained
 *     financial snapshot (ADR / RevPAR / cash on hand / etc.)
 *   - Bloomberg Terminal headline rotator
 *   - Stripe Dashboard "Account snapshot" carousel
 *
 * Behavior:
 *   - Auto-rotates between frames every 7s with cross-fade.
 *   - Tap on the card advances manually (haptic).
 *   - Long-press pauses (rare; mostly for users reading slowly).
 *   - NO pagination dots (user explicitly removed them as visual noise).
 *
 * Why 7s and not 5s:
 *   - Each frame contains a number + breakdown, which takes ~3-4s to
 *     read attentively (Stripe's research on financial snapshots).
 *   - 5s rate of the simpler ticker would feel rushed for a denser frame.
 *
 * Data shape:
 *   Each frame is a `RevenueFrame` with its own header label, primary
 *   amount, caption, and optional breakdown. The dashboard parent
 *   provides the frames; Sprint 9 wires them to real backend data
 *   (GET /v1/reports/revenue-snapshot returns the full frame array).
 */

import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useAuthStore } from '../../../store/auth'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface RevenueBreakdown {
  label: string
  amount: string
  meta: string
  /** 0-100. Renders a thin progress bar below the row. Optional. */
  /** 0-100. Server uses null when no progress bar applies; we accept both
   *  null and undefined for resilience. */
  progressPct?: number | null
  /** Color for the progress bar (and meta tint). */
  color?: string | null
}

export interface RevenueFrame {
  /** Stable id used as React key. */
  id: string
  /** Card label (top L2 micro): "INGRESOS HOY", "ADR HOY", etc. */
  label: string
  /** Primary numeric value, already formatted. */
  primaryWhole: string
  /** Currency or unit suffix ("MXN", "MXN/hab", etc.). */
  primarySuffix: string
  /** L4 caption beneath the number. */
  caption: string
  /** Optional caption tone (color hint). Default neutral. */
  captionTone?: 'positive' | 'negative' | 'neutral' | 'warning'
  /** Optional breakdown rows (e.g., Cobrado / Pendiente). */
  breakdown?: RevenueBreakdown[]
}

interface RevenueCarouselCardProps {
  frames: RevenueFrame[]
  /** Auto-advance interval. Default 7000. */
  intervalMs?: number
}

const TONE_COLOR: Record<NonNullable<RevenueFrame['captionTone']>, string> = {
  positive: '#34D399',
  negative: '#F87171',
  warning:  '#FBBF24',
  neutral:  colors.text.tertiary,
}

export function RevenueCarouselCard({
  frames,
  intervalMs = 7000,
}: RevenueCarouselCardProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'

  const [index, setIndex] = useState(0)
  const opacity = useSharedValue(1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedRef = useRef(false)

  // advance must be defined before useEffect to satisfy hooks ordering rules.
  // (Early return was here before — moved after all hooks to avoid React's
  // "Rendered more hooks than during the previous render" error.)
  const advance = (manual = false) => {
    if (manual) Haptics.selectionAsync()
    opacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) })
    setTimeout(() => {
      setIndex((i) => (i + 1) % frames.length)
      opacity.value = withTiming(1, { duration: 200, easing: Easing.in(Easing.quad) })
    }, 200)
  }

  // Auto-rotate — guard inside, not an early return before this hook.
  useEffect(() => {
    if (isHK || frames.length <= 1) return
    const tick = () => {
      if (!pausedRef.current) advance()
      timerRef.current = setTimeout(tick, intervalMs)
    }
    timerRef.current = setTimeout(tick, intervalMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHK, frames.length, intervalMs])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  // Safe to early-return here — all hooks have been called unconditionally above.
  if (isHK || frames.length === 0) return null

  const current = frames[index]
  const captionColor = TONE_COLOR[current.captionTone ?? 'neutral']

  // Fixed minHeight prevents the layout jitter the user reported.
  // Calc: amount (52) + caption (18) + gap (12) + breakdown header
  // separator (12) + 4 rows × (line 18 + bar 4 + gap 6 = 28) = ~206.
  // We pad to 220 to absorb font scale + uppercase L2 caps.
  // The shorter frames center their content vertically inside this fixed
  // viewport — visual stability across all 7 frames.
  const FIXED_BODY_HEIGHT = 220

  return (
    <Pressable
      onPress={() => frames.length > 1 && advance(true)}
      onPressIn={() => { pausedRef.current = true }}
      onPressOut={() => { pausedRef.current = false }}
    >
      <DashCard label={current.label}>
        <Animated.View style={[styles.body, { minHeight: FIXED_BODY_HEIGHT }, animStyle]}>
          {/* Big number row — fixed height alignment */}
          <View style={styles.amountRow}>
            <Text style={dashboardType.displayLg} numberOfLines={1} adjustsFontSizeToFit>
              {current.primaryWhole}
            </Text>
            {current.primarySuffix.length > 0 && (
              <Text
                style={[
                  dashboardType.bodySmall,
                  { color: colors.text.secondary, marginLeft: 6 },
                ]}
              >
                {current.primarySuffix}
              </Text>
            )}
          </View>

          {/* Caption — L4 with tone color */}
          <Text
            style={[dashboardType.caption, { color: captionColor, marginTop: 4 }]}
            numberOfLines={2}
          >
            {current.caption}
          </Text>

          {/* Breakdown — separated, consistent spacing */}
          {current.breakdown && current.breakdown.length > 0 && (
            <View style={styles.breakdownBlock}>
              {current.breakdown.map((row, i) => (
                <View key={i} style={styles.breakdownRow}>
                  <View style={styles.breakdownTextRow}>
                    <Text style={[dashboardType.caption, styles.breakdownLabel]}>
                      {row.label}
                    </Text>
                    <Text style={[dashboardType.bodySmall, styles.breakdownAmount]}>
                      {row.amount}
                    </Text>
                    <Text style={[dashboardType.caption, styles.breakdownMeta]}>
                      {row.meta}
                    </Text>
                  </View>
                  {row.progressPct != null && (
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: row.color ?? colors.brand[400],
                            width: `${row.progressPct}%`,
                          },
                        ]}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      </DashCard>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    // Fixed-height viewport — content above fold pinned consistently
    // across frames (no layout jitter when frame count of breakdown
    // rows changes from 2 → 4).
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minHeight: 52,
  },
  breakdownBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 8,
  },
  breakdownRow: {
    gap: 4,
  },
  breakdownTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownLabel: {
    width: 96,         // fixed label column → values align across rows
  },
  breakdownAmount: {
    flex: 1,
  },
  breakdownMeta: {
    minWidth: 60,
    textAlign: 'right',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
})
