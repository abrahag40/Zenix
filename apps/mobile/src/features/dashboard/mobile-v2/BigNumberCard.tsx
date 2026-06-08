/**
 * BigNumberCard — KPI hero (Stripe Dashboard mobile pattern).
 * Glance value: número grande + label uppercase + caption opcional.
 */
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

interface Props {
  label: string
  value: string
  caption?: string
  trend?: { pct: number } | null
}

export function BigNumberCard({ label, value, caption, trend }: Props) {
  const trendColor =
    trend == null
      ? colors.text.secondary
      : trend.pct > 0
        ? colors.brand[500]
        : trend.pct < 0
          ? colors.urgent[500]
          : colors.text.secondary
  const trendArrow = trend == null ? '' : trend.pct > 0 ? '↑' : trend.pct < 0 ? '↓' : '·'
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {(caption || trend) && (
        <View style={styles.captionRow}>
          {trend && (
            <Text style={[styles.trend, { color: trendColor }]}>
              {trendArrow} {Math.abs(trend.pct)}%
            </Text>
          )}
          {caption && <Text style={styles.caption}>{caption}</Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
  },
  label: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  value: {
    marginTop: 8,
    fontSize: 36,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.6,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
  },
  captionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trend: {
    fontSize: typography.size.small,
    fontWeight: '600',
  },
  caption: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },
})
