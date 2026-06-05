/**
 * list-stays-query.dto — Sprint PAGINATION-CORE (bug #23 fix).
 *
 * Validación + parsing de los query params para GET /v1/guest-stays.
 *
 * Resuelve 3 problemas detectados durante PERF-1 stress (10k stays, 30 VUs):
 *   1. `from/to` declarados pero ignorados server-side → fix vía DTO required
 *   2. Lógica de overlap usaba OR (siempre true) en vez de AND → fix en service
 *   3. Sin hard limit → 21MB / 1.45s per request a 10k stays → cap aquí
 *
 * Patrón overlap correcto de intervalos:
 *   stay [checkinAt, scheduledCheckout)  overlaps  window [from, to)
 *   ⟺   checkinAt < to  AND  scheduledCheckout > from
 *
 * Validation:
 *   - from/to: required ISO 8601 (espacio razonable para calendar render)
 *   - Si ausentes → 400 con mensaje claro (no 500 + payload gigante)
 *   - includeCancelled: opcional bool (default false — calendar excluye
 *     cancelled del view per CLAUDE.md §97; drawer "Canceladas hoy" usa
 *     endpoint separado `/v1/guest-stays/cancelled`)
 *   - limit: opcional 1-5000, default 5000 (hard cap defensivo)
 *
 * Backward-compat: frontend (useGuestStays + guestStaysApi.list) ya envía
 * from/to ISO en cada request — no rompe el caller actual.
 */
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ListStaysQueryDto {
  @IsString()
  propertyId!: string

  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601 (e.g. 2026-06-01)' })
  from!: string

  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601 (e.g. 2026-06-30)' })
  to!: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeCancelled?: boolean

  /**
   * Defensa contra DoS accidental — sin cap, un cliente podría pedir 5 años
   * y bajar 200MB. 5000 stays cubre el peor caso de un hotel boutique
   * mostrando 1 año completo en una sola vista (improbable, ~14 stays/día).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number
}
