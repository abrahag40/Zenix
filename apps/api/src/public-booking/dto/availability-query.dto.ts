import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator'

/**
 * Query de disponibilidad/tarifas para la API pública (BOOKING-ENGINE B1).
 * Fechas como ISO-8601 (YYYY-MM-DD). El website externo arma estos params
 * según la documentación de Zenix Booking — el contrato es HTTP, headless.
 */
export class AvailabilityQueryDto {
  @IsISO8601()
  checkIn!: string

  @IsISO8601()
  checkOut!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number

  /** Opcional: limitar a un room type específico (cotización puntual). */
  @IsOptional()
  roomTypeId?: string
}
