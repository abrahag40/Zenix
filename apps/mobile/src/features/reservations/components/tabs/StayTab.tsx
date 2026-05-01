/**
 * Stay tab — high-level booking metadata.
 */

import { View, StyleSheet, Text } from 'react-native'
import { Section, FieldRow } from './_shared'
import { SourceBadge } from '../SourceBadge'
import { colors } from '../../../../design/colors'
import { typography } from '../../../../design/typography'
import type { ReservationDetail } from '../../types'

const KEY_TYPE_LABEL: Record<NonNullable<ReservationDetail['keyType']>, string> = {
  PHYSICAL: 'Llave física',
  CARD:     'Tarjeta',
  CODE:     'Código',
  MOBILE:   'Llave móvil',
}

export function StayTab({ reservation: r }: { reservation: ReservationDetail }) {
  return (
    <View>
      <Section title="Estadía">
        <FieldRow label="Habitación" value={r.roomNumber ? `Hab. ${r.roomNumber}` : '—'} emphasized />
        {r.unitLabel && <FieldRow label="Unidad" value={r.unitLabel} />}
        <FieldRow label="Fechas" value={r.dateRangeLabel} />
        <FieldRow label="Pax" value={String(r.paxCount)} />
        <View style={styles.channelRow}>
          <Text style={styles.channelLabel}>Canal</Text>
          {r.source ? <SourceBadge source={r.source} /> : <Text style={styles.channelEmpty}>—</Text>}
        </View>
        <FieldRow label="ID reserva" value={r.id} />
      </Section>

      {(r.arrivalNotes || r.notes) && (
        <Section title="Notas">
          {r.arrivalNotes && <FieldRow label="Llegada" value={r.arrivalNotes} paragraph />}
          {r.notes && <FieldRow label="Generales" value={r.notes} paragraph />}
        </Section>
      )}

      {r.keyType && (
        <Section title="Acceso">
          <FieldRow label="Llave entregada" value={KEY_TYPE_LABEL[r.keyType]} emphasized />
        </Section>
      )}

      {r.isNoShow && r.noShowReason && (
        <Section title="No-show">
          <FieldRow label="Razón" value={r.noShowReason} paragraph />
          <FieldRow label="Marcado a las" value={r.noShowAt ? new Date(r.noShowAt).toLocaleString('es-MX') : '—'} />
        </Section>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  channelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border.subtle,
    gap: 12,
  },
  channelLabel: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  channelEmpty: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
  },
})
