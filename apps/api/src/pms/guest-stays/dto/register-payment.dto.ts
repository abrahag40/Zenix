import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { PaymentMethod } from '@zenix/shared'

export class RegisterPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod

  @IsNumber()
  @Min(0)
  amount: number

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
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  appliesToStayIds?: string[]
}
