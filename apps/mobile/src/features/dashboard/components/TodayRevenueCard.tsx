/**
 * TodayRevenueCard — RECEPTION/SUPERVISOR/ADMIN ONLY (privacy gate).
 *
 * Per the user's resolution to Q6 of Research #6: revenue is only
 * visible to roles that have a financial decision to make. HOUSEKEEPER
 * never sees this card (the parent dashboard never even passes data
 * for it when role is HK — defense in depth).
 *
 * Layout:
 *   ┌─ INGRESOS HOY ────────────────────────────┐
 *   │                                            │
 *   │  $42,180  MXN                              │
 *   │  proyectado · ↑ +12% vs ayer               │
 *   │                                            │
 *   │  Cobrado:    $38,200 · 90%                 │
 *   │  Pendiente:   $3,980 · 3 folios            │
 *   └────────────────────────────────────────────┘
 *
 * Design rationale:
 *   - Big number is the same L0 display used by OccupancyDonut for
 *     visual consistency.
 *   - "MXN" suffixed in smaller weight reads naturally as a unit.
 *   - Breakdown line: progress visualization via two stacked rows
 *     (cobrado vs pendiente) communicates collection efficiency
 *     without an additional chart.
 */

import { View, Text, StyleSheet } from 'react-native'
import { useAuthStore } from '../../../store/auth'
import { dashboardType } from '../typography'
import { DashCard } from './_DashCard'
import { RotatingTicker, type TickerInsight } from './RotatingTicker'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface TodayRevenueData {
  /** Today's projected revenue (paid + pending). */
  projectedAmount: number
  currency: string
  /** Already collected. */
  collectedAmount: number
  /** Outstanding folios — number + sum. */
  pendingFolios: number
  pendingAmount: number
  /** Day-over-day delta in percentage points. null = no historic. */
  deltaPercentVsYesterday?: number | null
}

interface TodayRevenueCardProps {
  data?: TodayRevenueData | null
  /** Capital-themed insights to rotate at the bottom of the card. */
  insights?: TickerInsight[]
}

function fmtMoney(amount: number, currency: string): { whole: string; suffix: string } {
  const whole = `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return { whole, suffix: currency }
}

export function TodayRevenueCard({ data, insights }: TodayRevenueCardProps) {
  const role = useAuthStore((s) => s.user?.role)
  const isHK = role === 'HOUSEKEEPER'
  // Defensive: even if parent passes data wrongly, the card hides itself.
  if (isHK || !data) return null

  const { whole, suffix } = fmtMoney(data.projectedAmount, data.currency)
  const collectedPct = data.projectedAmount > 0
    ? Math.round((data.collectedAmount / data.projectedAmount) * 100)
    : 0
  const pendingFmt = fmtMoney(data.pendingAmount, data.currency)

  const delta = data.deltaPercentVsYesterday
  const deltaTone =
    delta == null ? 'neutral' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  const deltaColor =
    deltaTone === 'positive' ? colors.brand[400]
    : deltaTone === 'negative' ? '#F87171'
    : colors.text.tertiary
  const deltaArrow = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→'

  return (
    <DashCard label="INGRESOS HOY">
      {/* Big number + currency + delta */}
      <View style={styles.amountRow}>
        <Text style={dashboardType.displayLg}>{whole}</Text>
        <Text style={[dashboardType.body, { color: colors.text.secondary, marginLeft: 4 }]}>
          {suffix}
        </Text>
      </View>

      <Text style={[dashboardType.caption, { marginTop: 4 }]}>
        proyectado
        {delta != null && (
          <>
            {' · '}
            <Text style={{ color: deltaColor, fontWeight: typography.weight.semibold }}>
              {deltaArrow} {Math.abs(delta)}% vs ayer
            </Text>
          </>
        )}
      </Text>

      {/* Breakdown */}
      <View style={styles.breakdownBlock}>
        <BreakdownRow
          label="Cobrado"
          amount={fmtMoney(data.collectedAmount, data.currency).whole + ' ' + data.currency}
          right={`${collectedPct}%`}
          color={colors.brand[400]}
          progressPct={collectedPct}
        />
        <BreakdownRow
          label="Pendiente"
          amount={pendingFmt.whole + ' ' + pendingFmt.suffix}
          right={`${data.pendingFolios} folio${data.pendingFolios !== 1 ? 's' : ''}`}
          color="#FBBF24"
        />
      </View>

      {/* Capital insights ticker — centered text + dots below.
          User explicitly approved the stepper here (the breakdown block
          gives this card more visual budget than the donut). */}
      {insights && insights.length > 0 && (
        <View style={styles.tickerBlock}>
          <RotatingTicker
            insights={insights}
            dotsPosition="below"
            centered
          />
        </View>
      )}
    </DashCard>
  )
}

function BreakdownRow({
  label,
  amount,
  right,
  color,
  progressPct,
}: {
  label: string
  amount: string
  right: string
  color: string
  progressPct?: number
}) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownTextRow}>
        <Text style={dashboardType.caption}>{label}</Text>
        <Text style={dashboardType.bodySmall}>{amount}</Text>
        <Text style={[dashboardType.caption, { marginLeft: 'auto' }]}>{right}</Text>
      </View>
      {progressPct != null && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: color, width: `${progressPct}%` },
            ]}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  breakdownBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 10,
  },
  breakdownRow: {
    gap: 6,
  },
  breakdownTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  tickerBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
})
