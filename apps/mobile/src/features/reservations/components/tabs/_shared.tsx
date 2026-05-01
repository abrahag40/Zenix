/**
 * Shared atoms for the four reservation-detail tabs.
 *
 * Centralizing FieldRow + Section keeps the four tab files narrow and
 * focused on their data — each one becomes a declarative list of fields.
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../../../design/colors'
import { typography } from '../../../../design/typography'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

export function FieldRow({
  label,
  value,
  emphasized,
  /** Free-text fields (notas, instrucciones) read better as a paragraph
   *  below the label rather than tucked right-aligned. */
  paragraph,
}: {
  label: string
  value: string | null | undefined
  emphasized?: boolean
  paragraph?: boolean
}) {
  if (paragraph) {
    return (
      <View style={styles.paragraphRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.paragraphValue}>{value ?? '—'}</Text>
      </View>
    )
  }
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[styles.value, emphasized && styles.valueEmphasized]}
        numberOfLines={2}
      >
        {value ?? '—'}
      </Text>
    </View>
  )
}

export function EmptyHint({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  sectionBody: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
    gap: 12,
  },
  label: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    flexShrink: 0,
  },
  value: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
    textAlign: 'right',
    flex: 1,
  },
  valueEmphasized: {
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  empty: {
    paddingVertical: 14,
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  paragraphRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
    gap: 6,
  },
  paragraphValue: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
    textAlign: 'left',
    width: '100%',
  },
})
