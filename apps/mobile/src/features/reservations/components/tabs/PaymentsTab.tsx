/**
 * Payments tab — folio summary + payment lines.
 *
 * Lines are append-only (USALI 12ª ed. — see CLAUDE.md Sprint 8).
 * Voids appear as a separate line with strike-through; the original
 * line stays untouched in audit trail.
 */

import { View, Text, StyleSheet } from 'react-native'
import { Section, FieldRow, EmptyHint } from './_shared'
import { colors } from '../../../../design/colors'
import { typography } from '../../../../design/typography'
import type { ReservationDetail, ReservationPaymentLine } from '../../types'

const METHOD_LABEL: Record<ReservationPaymentLine['method'], string> = {
  CASH:           'Efectivo',
  CARD_TERMINAL:  'Tarjeta',
  BANK_TRANSFER:  'Transferencia',
  OTA_PREPAID:    'OTA prepago',
  COMP:           'Cortesía',
}

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount)
  if (Number.isNaN(n)) return `${amount} ${currency}`
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function PaymentRow({ p }: { p: ReservationPaymentLine }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text
          style={[styles.method, p.isVoid && styles.voidText]}
          numberOfLines={1}
        >
          {METHOD_LABEL[p.method]}
          {p.isVoid && '  (anulado)'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {new Date(p.collectedAt).toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {p.collectedByName && ` · ${p.collectedByName}`}
          {p.reference && ` · ${p.reference}`}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          p.isVoid && styles.voidText,
        ]}
      >
        {formatMoney(p.amount, p.currency)}
      </Text>
    </View>
  )
}

export function PaymentsTab({ reservation: r }: { reservation: ReservationDetail }) {
  return (
    <View>
      <Section title="Folio">
        <FieldRow label="Tarifa" value={`${formatMoney(r.ratePerNight, r.currency)} / noche`} />
        <FieldRow label="Total" value={formatMoney(r.totalAmount, r.currency)} emphasized />
        <FieldRow label="Pagado" value={formatMoney(r.amountPaid, r.currency)} />
        <FieldRow label="Estado" value={r.paymentStatus} emphasized />
      </Section>

      <Section title="Movimientos">
        {r.payments.length === 0 ? (
          <EmptyHint>Sin movimientos registrados todavía.</EmptyHint>
        ) : (
          r.payments.map((p) => <PaymentRow key={p.id} p={p} />)
        )}
      </Section>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  method: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  meta: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
  },
  amount: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.bold,
  },
  voidText: {
    textDecorationLine: 'line-through',
    color: colors.text.tertiary,
  },
})
