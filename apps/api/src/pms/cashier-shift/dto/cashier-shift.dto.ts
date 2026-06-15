import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator'
import { CashOpeningSource, CashierShiftStatus } from '@zenix/shared'

/**
 * Apertura de turno de caja (D-CASH14). `openingFloat` es per-divisa
 * `{ MXN: 2000, USD: 0 }` (D-CASH3). El propertyId NO viaja en el body — se deriva
 * del JWT (el cajero abre turno en su propia propiedad). Si `openingSource=HANDOVER`,
 * `handoverFromShiftId` es obligatorio y el fondo debe igualar el cierre del saliente.
 */
export class OpenShiftDto {
  @IsObject({ message: 'openingFloat debe ser un objeto { divisa: monto }, ej. { "MXN": 2000 }' })
  openingFloat!: Record<string, number>

  @IsOptional()
  @IsEnum(CashOpeningSource)
  openingSource?: CashOpeningSource

  @IsOptional()
  @IsString()
  handoverFromShiftId?: string
}

/** Filtros del listado de turnos. Rango por `openedAt`; status opcional. */
export class ListShiftsQueryDto {
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601' })
  from?: string

  @IsOptional()
  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601' })
  to?: string

  @IsOptional()
  @IsEnum(CashierShiftStatus)
  status?: CashierShiftStatus
}
