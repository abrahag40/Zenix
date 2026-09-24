import { IsInt, Max, Min } from 'class-validator'

/**
 * El único campo que el hotel puede cambiar de un tipo de habitación.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 SÓLO EL PRECIO, Y EN CENTAVOS ENTEROS.
 *
 * **Sólo el precio**, porque es el único dato que el hotel conoce mejor que
 * nadie y el único que cambia a menudo. El nombre, la ocupación y las
 * amenidades los gestiona quien monta la propiedad; dejarlos aquí abriría la
 * puerta a que una edición de precio renombre una habitación por descuido, y
 * `forbidNonWhitelisted` convierte ese descuido en un 400 en vez de en un dato
 * corrupto. Es el mismo criterio del panel de precios (ADR-0007): un panel que
 * edita una cosa no puede romper otra.
 *
 * **En centavos enteros**, porque el dinero en coma flotante ya mordió en este
 * proyecto: un promedio por noche salía `4161.795` y se publicó así. Un entero
 * no admite milésimas de peso y no hay redondeo que discutir.
 */
export class PrecioDeTipoDto {
  /**
   * Tarifa base por noche, **antes de impuestos**, en centavos.
   *
   * Los límites no son decoración: son el filtro del dedo gordo.
   *
   * · `Min(1)` — cero no significa «gratis», significa «no lo sé». Un tipo que
   *   no se vende se desactiva; publicar cero sería cotizar una noche a nada.
   * · `Max(100_000_000)` — un millón de pesos por noche. Ningún hotel de este
   *   producto cobra eso, y es exactamente lo que sale al teclear dos ceros de
   *   más. Rechazarlo cuesta una línea; publicarlo cuesta la confianza del
   *   huésped que lo vio.
   */
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  tarifaCentavos!: number
}
