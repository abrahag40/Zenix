/**
 * OccupancyCard — primary universal KPI with 7-day trend sparkline.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ Ocupación hoy                       ALTA     │
 *   │                                              │
 *   │ 78%                       ╱─╲                │
 *   │                       ╱──╯  ╲╱╲              │  ← sparkline 7d
 *   │ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱                       │  ← progress bar
 *   │ Lun  Mar  Mié  Jue  Vie  Sáb  Dom            │
 *   └──────────────────────────────────────────────┘
 *
 * Why sparkline vs bar chart:
 *   - Tufte 1983 *The Visual Display of Quantitative Information*: sparkline
 *     = "data-rich, design-simple, word-sized". Conveys trend without
 *     consuming card real-estate.
 *   - 7 data points = single-glance pattern (Treisman 1980 pre-attentive).
 *   - No axes/legend required — context implicit (bottom labels = days).
 *
 * Color coding:
 *   ≥80%  → emerald (good)
 *   50-79 → amber  (advisory)
 *   <50%  → gray   (low — alert revenue manager)
 *
 * Industry standard: STR Global, ISAHC, USALI 12ª ed. all cite
 * occupancy as the single most-tracked hotel KPI.
 *
 * Real data: connects to GET /v1/reports/occupancy?days=7 in Sprint 9.
 * Until then, accepts an optional `trend` array (length 7) for QA/preview.
 */

import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface OccupancyCardProps {
  /** 0-100 percentage for today. `null` shows placeholder. */
  percentage?: number | null
  /** Last 7 days of occupancy %, oldest → newest. Today is index 6.
   *  Pass `undefined` to hide the sparkline (graceful degradation). */
  trend?: number[]
}

function pickTint(p: number): { fg: string; bg: string } {
  if (p >= 80) return { fg: colors.brand[400], bg: 'rgba(16,185,129,0.12)' }
  if (p >= 50) return { fg: colors.warning[500], bg: 'rgba(245,158,11,0.10)' }
  return { fg: colors.text.tertiary, bg: 'rgba(255,255,255,0.04)' }
}

const SPARK_W = 120
const SPARK_H = 36
const SPARK_PAD = 4

/** Build an SVG path command for the sparkline polyline. */
function buildSparkPath(values: number[]): { line: string; lastX: number; lastY: number } {
  if (values.length === 0) return { line: '', lastX: 0, lastY: 0 }
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 100)
  const range = Math.max(max - min, 1) // avoid /0
  const stepX = (SPARK_W - SPARK_PAD * 2) / Math.max(values.length - 1, 1)
  const points = values.map((v, i) => {
    const x = SPARK_PAD + i * stepX
    // Invert Y so higher % is higher visually
    const y = SPARK_PAD + ((max - v) / range) * (SPARK_H - SPARK_PAD * 2)
    return { x, y }
  })
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')
  const last = points[points.length - 1]
  return { line, lastX: last.x, lastY: last.y }
}

const DAY_LABELS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function OccupancyCard({ percentage, trend }: OccupancyCardProps) {
  const display = percentage == null ? '—' : `${Math.round(percentage)}%`
  const tint =
    percentage == null
      ? { fg: colors.text.tertiary, bg: colors.canvas.tertiary }
      : pickTint(percentage)
  const fillWidth = percentage == null ? 0 : Math.max(0, Math.min(100, percentage))

  const showSpark = Array.isArray(trend) && trend.length >= 2
  const spark = showSpark ? buildSparkPath(trend!) : null

  return (
    <View style={[styles.card, { backgroundColor: tint.bg }]}>
      <View style={styles.header}>
        <Text style={styles.label}>Ocupación hoy</Text>
        {percentage != null && (
          <Text style={[styles.subText, { color: tint.fg }]}>
            {percentage >= 80 ? 'Alta' : percentage >= 50 ? 'Media' : 'Baja'}
          </Text>
        )}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: tint.fg }]}>{display}</Text>
        {spark && (
          <View style={styles.sparkWrap}>
            <Svg width={SPARK_W} height={SPARK_H}>
              <Path
                d={spark.line}
                stroke={tint.fg}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Highlight today (last point) with a filled dot */}
              <Circle cx={spark.lastX} cy={spark.lastY} r={3} fill={tint.fg} />
            </Svg>
          </View>
        )}
      </View>

      {/* Subtle progress bar (today's value) */}
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { backgroundColor: tint.fg, width: `${fillWidth}%` },
          ]}
        />
      </View>

      {/* Day labels — only when sparkline is rendered */}
      {showSpark && (
        <View style={styles.dayRow}>
          {DAY_LABELS_ES.map((d, i) => (
            <Text key={i} style={styles.dayLabel}>
              {d}
            </Text>
          ))}
        </View>
      )}
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
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  subText: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  value: {
    fontSize: 48,
    fontWeight: typography.weight.heavy,
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  sparkWrap: {
    paddingBottom: 6,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPARK_PAD,
    marginTop: -2,
  },
  dayLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    width: SPARK_W / 7,
    textAlign: 'center',
  },
})
