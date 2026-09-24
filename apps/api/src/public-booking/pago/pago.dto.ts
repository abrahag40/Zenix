import { IsIn, IsOptional } from 'class-validator'

/**
 * Lo que el sitio manda para preparar un pago.
 *
 * 🔴 Fíjate en lo que NO está: importe, moneda, cuenta destino. No es una
 * omisión — es la garantía. `forbidNonWhitelisted` rechaza cualquier campo
 * que este DTO no declare, así que mandar `amount` da 400 en vez de colarse.
 *
 * El `bookingRef` va en la ruta y no aquí; esto sólo lleva CÓMO va a pagar,
 * que es lo único que el cliente legítimamente decide.
 *
 * 🔴 Y aquí NO se dejan campos «reservados para más adelante». Hubo uno,
 * `nada?: never`, puesto por si algún día hacía falta. `never` no es un tipo
 * que Swagger sepa convertir en esquema, así que al construir la
 * documentación lanzaba «A circular dependency has been detected (property
 * key: nada)» y **la API no arrancaba**. Tumbó un despliegue entero un campo
 * que no hacía nada. El coste de un hueco especulativo no es cero.
 */
export class PrepararPagoDto {
  /**
   * Cómo va a pagar. Determina cuánto se le guarda la habitación: 15 min una
   * tarjeta, 72 h un vale de OXXO. Ver `politica-de-retencion.ts`.
   */
  @IsOptional()
  @IsIn(['TARJETA', 'VALE_EFECTIVO', 'TRANSFERENCIA', 'EN_EL_HOTEL'])
  medio?: 'TARJETA' | 'VALE_EFECTIVO' | 'TRANSFERENCIA' | 'EN_EL_HOTEL'
}
