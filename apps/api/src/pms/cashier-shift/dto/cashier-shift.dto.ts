import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MinLength,
} from 'class-validator'
import { CashMovementType, CashOpeningSource, CashierShiftStatus } from '@zenix/shared'

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

/** Cierre / entrega de turno (D-CASH5/6). `actualClose` = conteo físico per-divisa
 *  (a ciegas — el cajero no ve el esperado). El cajero NO envía razón: el over/short
 *  lo concilia el supervisor en reconcileShift (R3). */
export class CloseShiftDto {
  @IsObject({ message: 'actualClose debe ser un objeto { divisa: monto }' })
  actualClose!: Record<string, number>

  @IsOptional()
  @IsString()
  witnessId?: string
}

/** Conciliación del supervisor de un turno fuera de tolerancia (D-CASH6). */
export class ReconcileShiftDto {
  @IsIn(['RECONCILED', 'DISPUTED'])
  decision!: 'RECONCILED' | 'DISPUTED'

  @IsString()
  @MinLength(5, { message: 'La razón de conciliación debe tener al menos 5 caracteres (audit §11)' })
  varianceReason!: string
}

/** Movimiento de caja append-only (D-CASH3, E3). `amount` es magnitud positiva;
 *  el signo lo deriva el servicio del `type` (PAID_OUT/CHANGE_GIVEN → sale).
 *  CORRECTION/FX_CONVERSION requieren `direction`. */
export class AddCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType

  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217 (ej. MXN)' })
  currency!: string

  @IsNumber()
  @IsPositive({ message: 'amount debe ser una magnitud positiva' })
  amount!: number

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT'

  @IsOptional()
  @IsString()
  paymentLogId?: string

  @IsOptional()
  @IsString()
  transactionGroupId?: string

  @IsOptional()
  @IsString()
  notes?: string
}

/** Query del resumen diario de caja (Sprint 3, SUPERVISOR). */
export class CashSummaryQueryDto {
  @IsString()
  propertyId!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe ser YYYY-MM-DD' })
  date!: string

  @IsOptional()
  @IsIn(['overShort', 'overages', 'shortages'])
  filter?: 'overShort' | 'overages' | 'shortages'
}

/** Arqueo "spot" del supervisor (D-CASH13): conteo físico a mitad de turno SIN
 *  cerrarlo. No interrumpe al cajero. */
export class RecordSpotCountDto {
  @IsObject({ message: 'counted debe ser un objeto { divisa: monto }' })
  counted!: Record<string, number>

  @IsOptional()
  @IsString()
  witnessId?: string

  @IsOptional()
  @IsString()
  notes?: string
}
