/**
 * StrictString — Sprint HARDENING-BATCH (bug #25 fix).
 *
 * Contexto: `enableImplicitConversion: true` global en main.ts coerce
 * boolean/number/object → string. Resultado: `{guestName: true}` → "true".
 *
 * No apagamos el global (queries dependen para coerce ?limit=10 → 10).
 * Fix por-campo: `@Transform` que retorna `undefined` si el valor original
 * no es string. Eso fuerza a `@IsString()` a fallar con mensaje claro.
 *
 * Trade-off documentado: si el caller envía `null` explicit, también
 * retornamos undefined → @IsOptional acepta. Eso evita el bug #29
 * (null → 500) sin perder el rechazo de tipo erróneo.
 *
 * Uso:
 *   @StrictString({ minLength: 1, maxLength: 200 })
 *   guestName?: string
 */
import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

interface StrictStringOptions {
  minLength?: number
  maxLength?: number
}

export function StrictString(opts: StrictStringOptions = {}) {
  const decorators: PropertyDecorator[] = [
    // BUG #25 fix — preservar tipo original del input para que @IsString
    // dispare 400 con mensaje específico. NO retornar undefined (eso oculta
    // el ataque); NO retornar string (eso es coerción silently).
    //
    // BUG #29 fix — explícito null vs ausente:
    //   undefined → ausente, @IsOptional acepta
    //   null      → explícito, retornamos undefined para idempotencia con
    //               PATCH semantics (null=undefined en update parcial)
    //   string    → pasa
    //   otro tipo → mantenemos el tipo original → IsString dispara 400
    Transform(
      ({ value, obj, key }) => {
        const raw = (obj as Record<string, unknown>)?.[key as string]
        if (raw === undefined) return undefined
        if (raw === null) return undefined // BUG #29 idempotent con missing
        if (typeof raw === 'string') return raw
        // Tipo erróneo → mantener para que IsString falle. Sin esto el
        // enableImplicitConversion coerce true→"true", 42→"42".
        return raw
      },
      { toClassOnly: true },
    ),
    IsOptional(), // PATCH parcial — opcional por design
    IsString(),
  ]
  if (opts.minLength !== undefined) decorators.push(MinLength(opts.minLength))
  if (opts.maxLength !== undefined) decorators.push(MaxLength(opts.maxLength))
  return applyDecorators(...decorators)
}

/**
 * StrictStringRequired — variante que NO permite undefined.
 * Para required fields donde un boolean injectado se debe rechazar como 400.
 */
export function StrictStringRequired(opts: StrictStringOptions = {}) {
  const decorators: PropertyDecorator[] = [
    Transform(
      ({ value, obj, key }) => {
        const raw = (obj as Record<string, unknown>)?.[key as string]
        if (raw === undefined || raw === null) return raw // dejar que IsString detecte missing
        if (typeof raw === 'string') return raw
        return undefined // boolean/number/etc → undefined → IsString falla "must be string"
      },
      { toClassOnly: true },
    ),
    IsString(),
  ]
  if (opts.minLength !== undefined) decorators.push(MinLength(opts.minLength))
  if (opts.maxLength !== undefined) decorators.push(MaxLength(opts.maxLength))
  return applyDecorators(...decorators)
}
