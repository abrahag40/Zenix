/**
 * titleCase — Capitaliza palabras tipo "García" / "O'Brien" / "Pérez-López".
 *
 * Sprint CHECK-IN C1.12 (2026-05-29). Resuelve consistencia BI: nombres
 * persistidos como "aa aaa", "JOSE PEREZ", "garcía" se normalizan a
 * "Aa Aaa" / "Jose Perez" / "García" antes de tocar BD.
 *
 * Aplicado en:
 *  - GuestStaysService.create (form recepcionista)
 *  - GuestStaysService.confirmCheckin (editar al confirmar)
 *  - BookingNewHandler (OTA inbound)
 *  - BookingModifyHandler (OTA modify)
 *
 * Manejo Unicode:
 *  - Conserva acentos / tildes (`í`, `á`, `ñ`, `ü`).
 *  - Capitaliza después de espacio, guion, apóstrofo (O'Brien, Pérez-López).
 *  - Preserva caracteres CJK / cirílico tal cual.
 *
 * NO normaliza:
 *  - Particles tipo "de", "del", "la", "von" — el caller decide si quiere
 *    aplicar lowercase a esos (caso por país). v1.0.0 simple es uniforme.
 */
export function titleCase(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .trim()
    .toLowerCase()
    .replace(/(^|\s|-|')(\p{L})/gu, (_match, sep, ch) => sep + ch.toUpperCase())
}

/**
 * titleCaseOrUndefined — variante que retorna undefined si input es vacío.
 * Útil para DTOs opcionales donde queremos preservar el "no se proveyó".
 */
export function titleCaseOrUndefined(input: string | null | undefined): string | undefined {
  if (!input) return undefined
  const result = titleCase(input)
  return result || undefined
}
