import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator'
import { PaymentMethod } from '@zenix/shared'

/**
 * BUG #14 fix 2026-06-04 — Decimal precision guards.
 *
 * Pre-prod testing reveló dos edge cases mal manejados:
 *   1. amount=0.005 → guardado "0.01" (round silencioso, pierde precisión fiscal)
 *   2. amount=9999999999.99 → Prisma Decimal(12,2) overflow → HTTP 500
 *
 * Schema Prisma PaymentLog.amount = Decimal(12,2) → max representable es
 * 9_999_999_999.99 (12 dígitos total, 2 decimales). Cualquier valor superior
 * o con más de 2 decimales genera errores DB-level que escapan como 500.
 *
 * Fix DTO:
 *   · @Min(0.01) — rechaza sub-cent (ningún cargo legítimo es <0.01)
 *   · @Max(9_999_999_999.99) — alineado con Decimal(12,2)
 *   · @Matches /^\d+(\.\d{1,2})?$/ — máx 2 decimales (fiscal compliance)
 *
 * BUG #13 fix complementario — opcional currency ISO 4217 para multi-divisa.
 * Si no se envía, persistir en folio currency (backward-compat). Aliniedos con
 * §85 cash drawer multi-divisa + §88 payment method enum no se factoriza por
 * divisa (la divisa viaja en campo separado).
 */
export class RegisterPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount debe tener máx 2 decimales (fiscal Decimal(12,2))' })
  @Min(0.01, { message: 'amount mínimo es 0.01 (sub-cent rechazado por fiscal compliance)' })
  @Max(9_999_999_999.99, { message: 'amount excede el máximo representable (Decimal(12,2))' })
  amount: number

  /**
   * Divisa ISO 4217 del pago. Optional — si no se envía, se persiste en
   * la divisa del folio (currency de GuestStay). Validado contra
   * propertyCurrency en service layer. Para multi-divisa real (§81-§88),
   * v1.0.1 PAY-CORE agrega PaymentFxLock + Banxico rate freeze.
   */
  @IsString()
  @Length(3, 3, { message: 'currency debe ser ISO 4217 (3 chars)' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217 uppercase (e.g. USD, MXN, EUR)' })
  @IsOptional()
  currency?: string

  @IsString()
  @IsOptional()
  reference?: string

  @IsString()
  @IsOptional()
  approvedById?: string

  @IsString()
  @IsOptional()
  approvalReason?: string

  /**
   * GROUP-PAYMENTS Fase A (D-GRP-A1) — quién entregó el dinero. Cuando un
   * huésped paga por otra habitación del grupo, el PaymentLog se registra
   * contra la stay PAGADA pero `paidByStayId` apunta al pagador. Null = la
   * stay paga lo suyo.
   */
  @IsString()
  @IsOptional()
  paidByStayId?: string

  /**
   * GROUP-PAYMENTS Fase A (D-GRP-A4) — stays del grupo que este pago liquida.
   * Si tiene >1 entrada, el monto se distribuye proporcionalmente al balance
   * de cada stay y se crea un PaymentLog por stay (mismo transactionGroupId +
   * paidByStayId). Vacío/ausente = el pago aplica solo a la stay en contexto.
   *
   * BUG #27 fix — `ArrayMinSize(1)` cuando el campo viene presente. Sin esto,
   * `appliesToStayIds: []` era aceptado silently y se trataba como pago
   * individual — confuso para arqueo. Caller debe omitir el field si no
   * aplica a múltiples stays (`undefined`), no enviarlo vacío.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'appliesToStayIds vacío no permitido — omite el campo si el pago es solo para esta reserva' })
  @IsString({ each: true })
  @IsOptional()
  appliesToStayIds?: string[]
}
