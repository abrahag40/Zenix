/**
 * CloudbedsAdapter — pre-mapeo sobre el motor genérico (D-MIG7). Define el
 * columnMapping del export de Cloudbeds para que el consultor NO mapee a mano.
 * Mapeo derivado de docs/sprints/migration/cloudbeds-export-schema.md (ASSUMED:
 * doc oficial, no export real — se ajusta cuando llegue el archivo del piloto;
 * si el formato difiere, basta editar este mapeo, el motor genérico ya lo soporta).
 */
import { Injectable } from '@nestjs/common'
import { MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping } from '@zenix/shared'
import type { ISourcePmsAdapter } from './source-pms-adapter.interface'

@Injectable()
export class CloudbedsAdapter implements ISourcePmsAdapter {
  readonly id = MigrationSource.CLOUDBEDS
  readonly label = 'Cloudbeds'

  defaultMapping(): MigrationColumnMapping {
    return {
      reservation: {
        sourceId: 'Reservation ID',
        status: 'Status',
        guestFirstName: 'Guest First Name',
        guestLastName: 'Guest Last Name',
        guestEmail: 'Email',
        guestPhone: 'Phone',
        guestCountry: 'Country',
        checkIn: 'Check-in',
        checkOut: 'Check-out',
        roomLabel: 'Room Name',
        roomTypeLabel: 'Room Type',
        adults: 'Adults',
        children: 'Children',
        totalAmount: 'Total',
        balance: 'Balance',
        currency: 'Currency',
        sourceChannel: 'Source',
        otaReservationCode: 'OTA Reference',
      },
      dateFormat: 'DD/MM/YYYY',
    }
  }
}
