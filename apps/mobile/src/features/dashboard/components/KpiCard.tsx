/**
 * KpiCard — single KPI tile with accent + value + sublabel.
 *
 * Reusable across all KPI types (occupancy, checkouts, check-ins, etc).
 * The Dashboard maps each KpiSpec from kpiPolicy.ts to a KpiCard.
 *
 * Visual hierarchy:
 *   - Accent bar on left (color = semantic meaning)
 *   - Label small uppercase
 *   - Value big number
 *   - Sublabel small contextual
 *
 * Anti-pattern rejected: "value-less" cards that show "0" or "—" without
 * context. We use friendly copy when value is unavailable ("Cargando", "Sin datos").
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export interface KpiCardProps {
  label: string
  value: string | number
  sublabel?: string
  /** Accent color on the left edge (semantic). */
  tint: string
  /** Optional warning state — turns the value red. */
  warning?: boolean
}

export function KpiCard({ label, value, sublabel, tint, warning }: KpiCardProps) {
  return (
    <View style={styles.tile}>
      <View style={[styles.accent, { backgroundColor: tint }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warning && styles.valueWarning]}>
        {value}
      </Text>
      {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    minHeight: 96,
  },
  accent: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: 3,
  },
  label: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    marginBottom: 8,
  },
  value: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.title,
  },
  valueWarning: {
    color: colors.urgent[400],
  },
  sublabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    marginTop: 2,
  },
})
