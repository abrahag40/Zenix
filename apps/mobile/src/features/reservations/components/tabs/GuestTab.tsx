/**
 * Guest tab — PII and identity. Server redacts for non-RECEPTION roles.
 */

import { View } from 'react-native'
import { Section, FieldRow, EmptyHint } from './_shared'
import type { ReservationDetail } from '../../types'

export function GuestTab({ reservation: r }: { reservation: ReservationDetail }) {
  if (r.isRedacted) {
    return (
      <Section title="Huésped">
        <EmptyHint>Tu rol no permite ver datos personales del huésped.</EmptyHint>
      </Section>
    )
  }

  return (
    <View>
      <Section title="Datos del huésped">
        <FieldRow label="Nombre" value={r.guestName} emphasized />
        <FieldRow label="Email" value={r.guestEmail} />
        <FieldRow label="Teléfono" value={r.guestPhone} />
        <FieldRow label="Nacionalidad" value={r.nationality} />
      </Section>

      <Section title="Documento">
        <FieldRow label="Tipo" value={r.documentType ?? 'No registrado'} />
        <FieldRow label="Número" value={r.documentNumberMasked ?? '—'} />
      </Section>
    </View>
  )
}
