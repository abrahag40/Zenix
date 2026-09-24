import { IsIn, IsOptional, IsString } from 'class-validator'

/**
 * Lo que el sitio manda para preparar un pago.
 *
 * 🔴 Fíjate en lo que NO está: importe, moneda, cuenta destino. No es una
 * omisión — es la garantía. `forbidNonWhitelisted` rechaza cualquier campo
 * que este DTO no declare, así que mandar `amount` da 400 en vez de colarse.
 *
 * El `bookingRef` va en la ruta y no aquí; esto sólo lleva CÓMO va a pagar,
 * que es lo único que el cliente legítimamente decide.
 */
export class PrepararPagoDto {
  /**
   * Cómo va a pagar. Determina cuánto se le guarda la habitación: 15 min una
   * tarjeta, 72 h un vale de OXXO. Ver `politica-de-retencion.ts`.
   */
  @IsOptional()
  @IsIn(['TARJETA', 'VALE_EFECTIVO', 'TRANSFERENCIA', 'EN_EL_HOTEL'])
  medio?: 'TARJETA' | 'VALE_EFECTIVO' | 'TRANSFERENCIA' | 'EN_EL_HOTEL'

  /** Reservado para la clave pública de Stripe si algún día se pide aquí. */
  @IsOptional()
  @IsString()
  nada?: never
}
