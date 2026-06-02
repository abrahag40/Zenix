import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator'

/**
 * GROUP-BILLING Fase C C2 (D-GRP-C5) — registro administrativo del outcome del
 * reembolso de una reserva cancelada. El reembolso se procesa FUERA de Zenix
 * (OTA VCC / transferencia / efectivo, §195) y aquí se registra el resultado.
 * Mismo patrón que RegisterNoShowChargeDto (§196).
 */
export class RegisterCancelRefundDto {
  /** REFUNDED = se reembolsó; WAIVED = no se reembolsó (huésped renunció / política). */
  @IsEnum(['REFUNDED', 'WAIVED'] as const)
  status: 'REFUNDED' | 'WAIVED'

  /** cash | transfer | ota_card | manual_card | ota_collect | other. */
  @IsString()
  @IsOptional()
  method?: string

  /** ID de transferencia / case ID de la OTA / folio. Evidencia. */
  @IsString()
  @IsOptional()
  reference?: string

  /** Monto realmente reembolsado (si difiere del calculado — reembolso parcial). */
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number

  /** Obligatorio si status=WAIVED (audit trail). */
  @IsString()
  @IsOptional()
  reason?: string
}
