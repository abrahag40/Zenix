/**
 * RotatingTicker — auto-rotating insight carousel.
 *
 * Shows ONE insight at a time and rotates through a list every N seconds
 * with a fade transition. Tap to advance manually; tap-and-hold to pause.
 *
 * Why a ticker (and not stacking all insights):
 *   - Sweller 1988 cognitive load: showing 6 secondary metrics simultaneously
 *     dilutes the attention budget that the primary metric (occupancy %)
 *     deserves.
 *   - Apple Stocks "Watchlist Overview" carousel: 4-5 second rotation is
 *     the empirically-optimal rate for users to read + absorb without
 *     pressure (NN/g 2022, "Carousel Usability").
 *   - The user explicitly asked for this: animated swap of relevant
 *     real-time hotel operational data in the same screen position.
 *
 * Pagination dots clarify "this is one of N" — important for predictability
 * (Norman 1988 — system status visibility heuristic).
 *
 * Pattern reference: Bloomberg Terminal headline ticker, Apple Health
 * "Highlights" rotator, Stripe Atlas dashboard insights.
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
import { colors } from '../../../design/colors'
import { dashboardType } from '../typography'

export interface TickerInsight {
  /** Required unique id (used as key + analytics tag). */
  id: string
  /** Optional emoji or symbol prefix. */
  icon?: string
  /** First-line label (most prominent). */
  label: string
  /** Optional second-line caption (de-emphasized). */
  caption?: string
  /** Optional tint color for the label (e.g., emerald for positive). */
  tone?: 'positive' | 'negative' | 'neutral' | 'warning'
}

interface RotatingTickerProps {
  insights: TickerInsight[]
  /** Auto-advance interval in ms. Default 5000 (NN/g recommendation). */
  intervalMs?: number
  /** Where to render the pagination indicator:
   *   'inline' — to the right of the ticker text (legacy)
   *   'below'  — centered below the ticker text (the user-preferred style for Revenue card)
   *   'none'   — no dots (cleanest — for cards already dense like the donut footer)
   *  Default: 'none'. */
  dotsPosition?: 'inline' | 'below' | 'none'
  /** Center-align the text content inside the ticker row. Default true. */
  centered?: boolean
}

const TONE_COLOR: Record<NonNullable<TickerInsight['tone']>, string> = {
  positive: '#34D399',
  negative: '#F87171',
  warning:  '#FBBF24',
  neutral:  colors.text.secondary,
}

export function RotatingTicker({
  insights,
  intervalMs = 5000,
  dotsPosition = 'none',
  centered = true,
}: RotatingTickerProps) {
  const [index, setIndex] = useState(0)
  const opacity = useSharedValue(1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedRef = useRef(false)

  const advance = (manual: boolean = false) => {
    // Fade out → swap → fade in. Total ~360ms (Apple HIG implicit transition).
    opacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }, (done) => {
      if (!done) return
    })
    // Use setTimeout for the swap so the fade out is visible before content changes.
    setTimeout(() => {
      setIndex((i) => (i + 1) % insights.length)
      opacity.value = withTiming(1, { duration: 180, easing: Easing.in(Easing.quad) })
    }, 180)
    if (manual) Haptics.selectionAsync()
  }

  // Auto-rotate
  useEffect(() => {
    if (insights.length <= 1) return
    const tick = () => {
      if (!pausedRef.current) advance()
      timerRef.current = setTimeout(tick, intervalMs)
    }
    timerRef.current = setTimeout(tick, intervalMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights.length, intervalMs])

  if (insights.length === 0) return null

  const current = insights[index]
  const tone = current.tone ?? 'neutral'
  const labelColor = TONE_COLOR[tone]

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const showDots = dotsPosition !== 'none' && insights.length > 1
  const Dots = showDots ? (
    <View style={styles.dots}>
      {insights.map((_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
      ))}
    </View>
  ) : null

  // Layout strategy:
  //  - 'inline':  flex row, text + dots side-by-side (legacy)
  //  - 'below':   centered text on top, dots centered below
  //  - 'none':    centered text, no dots
  //
  // Centering — when `centered` is true, the row uses justifyContent:'center'
  // so the (icon + text) cluster sits at the visual center of the available
  // width. The user explicitly asked for this on the donut footer.
  return (
    <Pressable
      onPress={() => insights.length > 1 && advance(true)}
      onPressIn={() => { pausedRef.current = true }}
      onPressOut={() => { pausedRef.current = false }}
      style={dotsPosition === 'below' ? styles.wrapStacked : styles.wrap}
    >
      <Animated.View
        style={[
          styles.row,
          centered && styles.rowCentered,
          dotsPosition === 'below' && styles.rowFullWidth,
          animStyle,
        ]}
      >
        {current.icon && <Text style={styles.icon}>{current.icon}</Text>}
        <View style={[styles.textCol, centered && styles.textColCentered]}>
          <Text
            style={[
              dashboardType.bodySmall,
              { color: labelColor },
              centered && styles.textCentered,
            ]}
            numberOfLines={1}
          >
            {current.label}
          </Text>
          {current.caption && (
            <Text
              style={[
                dashboardType.caption,
                centered && styles.textCentered,
              ]}
              numberOfLines={1}
            >
              {current.caption}
            </Text>
          )}
        </View>
        {dotsPosition === 'inline' && Dots}
      </Animated.View>

      {dotsPosition === 'below' && Dots}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Inline / centered (no-dots-below) layout
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 36,
  },
  // Stacked layout (text on top, dots below)
  wrapStacked: {
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
    paddingTop: 2,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowCentered: {
    justifyContent: 'center',
  },
  rowFullWidth: {
    flex: 0,
    width: '100%',
  },
  icon: {
    fontSize: 16,
  },
  textCol: {
    flex: 1,
  },
  textColCentered: {
    flex: 0,
  },
  textCentered: {
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dotActive: {
    backgroundColor: colors.brand[400],
    width: 14,
  },
})
