/**
 * FxRateCard — daily FX rate for properties that quote in USD/EUR.
 *
 * LATAM hostels and boutique hotels frequently bill in USD/EUR even
 * when the local currency is MXN/COP/ARS. The receptionist needs the
 * day's rate to:
 *   - Quote walk-ins
 *   - Process partial cash payments mid-stay
 *   - Convert tips/extras
 *
 * Surfaced only in MORNING window (06-12) by kpiPolicy. Stays out of
 * the way during peak operational hours.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ Tipo de cambio                       hoy     │
 *   │                                              │
 *   │ $18.42 MXN  per USD          ↑ +0.12 (0.65%) │
 *   │ $19.85 MXN  per EUR          ↓ -0.04 (0.20%) │
 *   └──────────────────────────────────────────────┘
 *
 * Source: backend will pull from Banxico (MX) / BCRA (AR) / BanRep (CO)
 * APIs. Sprint 9 wiring; for now accepts mock props.
 *
 * NOTE — INFORMATIONAL ONLY: this card is a quick-glance reference.
 * The actual rate used in transactions comes from PropertySettings.
 * The card does NOT execute any conversion.
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface FxRateRow {
  /** ISO 4217 (e.g., 'USD', 'EUR'). */
  currency: string
  /** Rate expressed as: 1 unit of `currency` = `rate` units of local currency. */
  rate: number
  /** Day-over-day delta (signed). null = unavailable. */
  delta?: number | null
  /** Local currency code (e.g., 'MXN'). Used for the suffix. */
  localCurrency: string
}

interface FxRateCardProps {
  rates?: FxRateRow[]
  /** ISO date label "26 abr" — pre-formatted by API or caller. */
  dateLabel?: string
}

export function FxRateCard({ rates, dateLabel }: FxRateCardProps) {
  const list = rates ?? []

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Tipo de cambio</Text>
        <Text style={styles.dateLabel}>{dateLabel ?? 'hoy'}</Text>
      </View>

      {list.length === 0 ? (
        <Text style={styles.empty}>Configura tu fuente de TC en ajustes</Text>
      ) : (
        <View style={styles.rows}>
          {list.map((row) => {
            const delta = row.delta ?? 0
            const isPos = delta > 0
            const isNeg = delta < 0
            const pct = row.rate > 0 ? (Math.abs(delta) / row.rate) * 100 : 0
            const arrow = isPos ? '↑' : isNeg ? '↓' : '→'
            const deltaColor = isPos
              ? colors.brand[400]
              : isNeg
                ? colors.urgent[500]
                : colors.text.tertiary
            return (
              <View key={row.currency} style={styles.row}>
                <View style={styles.rateBlock}>
                  <Text style={styles.rateValue}>
                    ${row.rate.toFixed(2)} {row.localCurrency}
                  </Text>
                  <Text style={styles.rateUnit}>per {row.currency}</Text>
                </View>
                {row.delta != null && (
                  <Text style={[styles.delta, { color: deltaColor }]}>
                    {arrow} {Math.abs(delta).toFixed(2)} ({pct.toFixed(2)}%)
                  </Text>
                )}
              </View>
            )
          })}
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
    gap: 12,
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
  dateLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateBlock: {
    gap: 0,
  },
  rateValue: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  rateUnit: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  delta: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  empty: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
})
