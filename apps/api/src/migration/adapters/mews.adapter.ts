/**
 * MewsAdapter — pre-mapeo del "Reservation report → Excel/CSV" de Mews
 * (docs/sprints/migration/pms-export-landscape.md: Mews = "medio", empezar por
 * el reporte self-service). Spike del Sprint 6 para validar que agregar un PMS
 * NO toca el motor: solo declara su columnMapping.
 *
 * ASSUMED: mapeo derivado de la doc del Reservation Report de Mews, NO de un
 * export real — se ajusta cuando llegue el archivo del primer cliente Mews
 * (basta editar este mapeo; el motor genérico ya lo soporta).
 */
import { Injectable } from '@nestjs/common'
import { MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping } from '@zenix/shared'
import type { ISourcePmsAdapter } from './source-pms-adapter.interface'

@Injectable()
export class MewsAdapter implements ISourcePmsAdapter {
  readonly id = MigrationSource.MEWS
  readonly label = 'Mews'

  defaultMapping(): MigrationColumnMapping {
    return {
      reservation: {
        sourceId: 'Reservation number',
        status: 'State',
        guestName: 'Guest',
        guestEmail: 'Email',
        guestPhone: 'Phone',
        guestCountry: 'Nationality',
        checkIn: 'Arrival',
        checkOut: 'Departure',
        roomLabel: 'Assigned space',
        roomTypeLabel: 'Space type',
        adults: 'Adults',
        children: 'Children',
        totalAmount: 'Total amount',
        currency: 'Currency',
        sourceChannel: 'Channel',
        otaReservationCode: 'Channel number',
      },
      // Mews exporta fechas ISO en el Reservation Report.
      dateFormat: 'YYYY-MM-DD',
    }
  }
}
