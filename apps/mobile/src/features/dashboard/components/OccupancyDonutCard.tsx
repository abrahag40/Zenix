/**
 * OccupancyDonutCard — donut chart with 3 segments + delta vs yesterday.
 *
 * Replaces the previous sparkline + day-labels OccupancyCard. Driven by
 * Research #6 §2.1:
 *   - Sparklines without context were the #1 complaint in PMS mobile reviews
 *     (31× negative mentions across G2/Capterra)
 *   - Cleveland & McGill 1984: donuts more legible than pies on mobile
 *   - Apple Stocks / Stripe Dashboard pattern: big number at center,
 *     segments around, delta below
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ OCUPACIÓN HOY                          ALTA │
 *   │                                              │
 *   │   ╭───╮                                      │
 *   │  ╱     ╲    ● Ocupadas      11               │
 *   │ │  78%  │   ● Llegan hoy     4               │
 *   │  ╲     ╱    ● Vacías          7              │
 *   │   ╰───╯                                      │
 *   │                                              │
 *   │  ↑ +6% vs ayer · objetivo 80%               │
 *   └─────────────────────────────────────────────┘
 *
 * Privacy:
 *   - Counts (ocupadas/llegan/vacías) are operational data, visible to
 *     all roles. The card itself does NOT show revenue.
 *
 * Sprint 8I: accepts mock data. Sprint 9 wires `GET /v1/reports/occupancy`.
 */

import { useEffect, useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Stop, G } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { dashboardType } from '../typography'
import { RotatingTicker, type TickerInsight } from './RotatingTicker'

// Animated.createAnimatedComponent on SVG elements lets Reanimated drive
// strokeDasharray/Offset directly on the native side — no JS bridge frames.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export interface OccupancyDonutData {
  /** 0-100 percentage for today. Computed: occupied / totalCapacity * 100 */
  percentage: number
  /** Rooms currently occupied (in-house). */
  occupied: number
  /** Arriving today (UNCONFIRMED + checkin today). */
  arrivingToday: number
  /** Empty / available. */
  empty: number
  /** Yesterday's percentage for delta calc. null = no historic data. */
  yesterdayPercentage?: number | null
  /** Property's target occupancy for context. Default 80. */
  targetPercentage?: number
}

interface OccupancyDonutCardProps {
  data?: OccupancyDonutData | null
  /** Optional rotating insights shown in the footer. If empty/null, the
   *  footer shows the static "delta vs ayer · objetivo X%" line. */
  tickerInsights?: TickerInsight[]
}

const DONUT_SIZE = 110
const STROKE_WIDTH = 14
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2
const CENTER = DONUT_SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const SEGMENT_COLORS = {
  occupied:      '#A78BFA', // indigo (in-house established)
  arrivingToday: '#FBBF24', // amber (event of the day — attention)
  empty:         '#34D399', // emerald (capacity available)
}

// Band label removed per user feedback — the % itself is the band signal.
// The "ALTA / MEDIA / BAJA" pill duplicated information without adding
// a new dimension. Tufte 1990: never repeat a data point in two forms
// when one form (the number) is unambiguous.

export function OccupancyDonutCard({ data, tickerInsights }: OccupancyDonutCardProps) {
  if (!data) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>OCUPACIÓN HOY</Text>
        </View>
        <Text style={styles.emptyText}>—</Text>
      </View>
    )
  }

  const total = Math.max(data.occupied + data.arrivingToday + data.empty, 1)
  const pctOccupied = data.occupied / total
  const pctArriving = data.arrivingToday / total

  // Stroke-dash trick: each segment is an arc colored a portion of the
  // circumference. We rotate by -90° so the start is at 12-o'clock.
  const occLen = pctOccupied * CIRCUMFERENCE
  const arrLen = pctArriving * CIRCUMFERENCE
  const empLen = CIRCUMFERENCE - occLen - arrLen

  // ── Mount animation — arcs draw in from 0% to their target length.
  // Pattern: Apple Health rings, Stripe billing donut. The progress
  // value goes from 0 → 1 over ~900ms with cubic ease-out (the visual
  // "arrives smoothly" curve, no overshoot).
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    })
  // Re-trigger when the underlying numbers change so the user sees the
  // re-animation on data refresh — confirms "system updated" affordance
  // (Norman 1988 — feedback principle).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.percentage, data?.occupied, data?.arrivingToday, data?.empty])

  const occluProps  = useAnimatedProps(() => ({
    strokeDasharray: [occLen * progress.value, CIRCUMFERENCE - occLen * progress.value] as any,
  }))
  const arrivProps  = useAnimatedProps(() => ({
    strokeDasharray: [arrLen * progress.value, CIRCUMFERENCE - arrLen * progress.value] as any,
  }))
  const emptyProps  = useAnimatedProps(() => ({
    strokeDasharray: [empLen * progress.value, CIRCUMFERENCE - empLen * progress.value] as any,
  }))

  const target = data.targetPercentage ?? 80
  const delta =
    data.yesterdayPercentage != null
      ? Math.round(data.percentage - data.yesterdayPercentage)
      : null

  // Build the ticker insight set: start with the delta-vs-ayer insight
  // (always relevant) and append any caller-provided operational metrics.
  const insights = useMemo<TickerInsight[]>(() => {
    const base: TickerInsight[] = []
    if (delta != null) {
      base.push({
        id: 'delta-yesterday',
        icon: delta > 0 ? '↑' : delta < 0 ? '↓' : '→',
        label: `${delta > 0 ? '+' : ''}${delta}% vs ayer · objetivo ${target}%`,
        tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
      })
    }
    return [...base, ...(tickerInsights ?? [])]
  }, [delta, target, tickerInsights])

  return (
    <View style={styles.card}>
      {/* Header — single label only (no redundant band pill) */}
      <View style={styles.header}>
        <Text style={styles.label}>OCUPACIÓN HOY</Text>
      </View>

      {/* Donut + legend */}
      <View style={styles.body}>
        <View style={styles.donutWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            {/* Defs — per-segment sheen gradients only.
                The previous radial "halo" filled the donut center,
                obscuring the percentage text. Removed entirely.
                Each segment uses a top→bottom alpha gradient (1.0 → 0.75)
                for subtle depth — Tufte 1990 *no chartjunk*: depth
                without sacrificing legibility of the data inside. */}
            <Defs>
              <LinearGradient id="seg-occupied" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={SEGMENT_COLORS.occupied}      stopOpacity="1" />
                <Stop offset="100%" stopColor={SEGMENT_COLORS.occupied}      stopOpacity="0.75" />
              </LinearGradient>
              <LinearGradient id="seg-arriving" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={SEGMENT_COLORS.arrivingToday} stopOpacity="1" />
                <Stop offset="100%" stopColor={SEGMENT_COLORS.arrivingToday} stopOpacity="0.75" />
              </LinearGradient>
              <LinearGradient id="seg-empty" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={SEGMENT_COLORS.empty}         stopOpacity="1" />
                <Stop offset="100%" stopColor={SEGMENT_COLORS.empty}         stopOpacity="0.75" />
              </LinearGradient>
            </Defs>

            <G rotation="-90" origin={`${CENTER}, ${CENTER}`}>
              {/* Background ring */}
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {/* Segment 1 — occupied (animated dasharray) */}
              <AnimatedCircle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke="url(#seg-occupied)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDashoffset={0}
                strokeLinecap="butt"
                animatedProps={occluProps}
              />
              {/* Segment 2 — arriving today */}
              <AnimatedCircle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke="url(#seg-arriving)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDashoffset={-occLen}
                strokeLinecap="butt"
                animatedProps={arrivProps}
              />
              {/* Segment 3 — empty */}
              <AnimatedCircle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke="url(#seg-empty)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDashoffset={-(occLen + arrLen)}
                strokeLinecap="butt"
                animatedProps={emptyProps}
              />
            </G>
          </Svg>

          {/* Center label — number dominates */}
          <View style={styles.centerLabel} pointerEvents="none">
            <Text style={styles.centerValue}>{Math.round(data.percentage)}%</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <LegendRow color={SEGMENT_COLORS.occupied}      label="Ocupadas"     count={data.occupied} />
          <LegendRow color={SEGMENT_COLORS.arrivingToday} label="Llegan hoy"   count={data.arrivingToday} />
          <LegendRow color={SEGMENT_COLORS.empty}         label="Vacías"       count={data.empty} />
        </View>
      </View>

      {/* Rotating insight footer — replaces the static delta line.
          Centered text with no pagination dots: the donut header
          already carries the "ALTA" pill + bands, adding dots here
          would overload the visual budget (Sweller 1988).
          User-tap still advances; pause-on-press still works. */}
      <View style={styles.footer}>
        <RotatingTicker insights={insights} dotsPosition="none" centered />
      </View>
    </View>
  )
}

function LegendRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendCount}>{count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  bandPill: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontSize: 30,
    fontWeight: typography.weight.heavy,
    color: colors.text.primary,
    letterSpacing: -1,
  },
  legend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  legendCount: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
    minWidth: 28,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  delta: {
    fontSize: typography.size.small,
  },
  deltaIcon: {
    fontWeight: typography.weight.bold,
  },
  deltaValue: {
    fontWeight: typography.weight.semibold,
  },
  deltaCaption: {
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  deltaUp:   { color: colors.brand[400] },
  deltaDown: { color: '#F87171' },
  deltaFlat: { color: colors.text.tertiary },
  target: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    marginLeft: 6,
  },
  emptyText: {
    fontSize: typography.size.title,
    color: colors.text.tertiary,
    paddingVertical: 20,
    textAlign: 'center',
  },
})
