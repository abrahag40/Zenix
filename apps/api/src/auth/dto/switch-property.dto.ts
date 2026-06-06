/**
 * SwitchPropertyDto — fix bug #24 (Bloque W).
 *
 * Detectado en testing E2E 2026-06-06: POST /auth/switch-property con body
 * `{"propertyId": "..."}` (sin `targetPropertyId`) devolvía HTTP 201 con
 * token "nuevo" que mantenía el property actual. Root cause:
 *   - @Body('targetPropertyId') resuelve a undefined
 *   - service llamaba prisma.property.findFirst({ where: { id: undefined } })
 *     que Prisma trata como NULL → puede retornar la primer property que
 *     matchee organizationId (silent fallback)
 *
 * Riesgo:
 *   - UX confusing: usuario clic "Cambiar a Cancún" → silently se queda en Tulum
 *   - Si un frontend con bug envía parámetro mal, el usuario podría operar
 *     pensando que está en otra property
 *
 * Fix: validar @IsString @IsNotEmpty con mensaje claro.
 */
import { IsNotEmpty, IsString } from 'class-validator'

export class SwitchPropertyDto {
  @IsString({ message: 'targetPropertyId debe ser string' })
  @IsNotEmpty({ message: 'targetPropertyId es requerido' })
  targetPropertyId!: string
}
