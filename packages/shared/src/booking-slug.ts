// BOOKING-ENGINE B0 (2026-06-11) — slug system para "Zenix Booking".
// El slug es el identificador público de la página de reservas directas:
// book.zenix.com/{slug}. Debe ser URL-safe, estable y único global (la
// unicidad la garantiza el índice UNIQUE en BookingEngineConfig.slug; este
// helper sólo produce el candidato + permite desambiguar con sufijo).

/** Convierte un texto libre (nombre de hotel) en un slug URL-safe. */
export function slugifyPropertyName(input: string): string {
  return input
    .normalize('NFD') // separa acentos: "Cancún" → "Cancu´n"
    .replace(/[̀-ͯ]/g, '') // elimina diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // no-alfanumérico → guión
    .replace(/^-+|-+$/g, '') // recorta guiones de los bordes
    .replace(/-{2,}/g, '-') // colapsa guiones repetidos
    .slice(0, 60) // límite razonable para URLs
}

/**
 * Genera un slug único a partir de un candidato base, probando sufijos
 * numéricos (`hotel-tulum`, `hotel-tulum-2`, ...) hasta que `isTaken` lo
 * acepte. `isTaken` consulta la DB (UNIQUE en booking_engine_config.slug).
 */
export async function buildUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugifyPropertyName(base) || 'hotel'
  if (!(await isTaken(root))) return root
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  // Fallback improbable — sufijo de timestamp evitado (determinismo);
  // 1000 colisiones del mismo nombre no ocurre en la práctica.
  throw new Error(`No se pudo generar un slug único para "${base}"`)
}
