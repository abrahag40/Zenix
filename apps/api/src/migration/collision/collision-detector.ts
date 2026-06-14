/**
 * CollisionDetector (D-MIG3 ★) — el corazón de MIGRATION-CORE Sprint 2.
 *
 * Detecta EMPALMES: dos reservas que ocupan el MISMO recurso físico en fechas
 * que se solapan. Recurso = habitación (privadas) o cama (dorms/hostal). El
 * requisito explícito del owner: avisar "dos huéspedes, misma fecha y
 * habitación/cama" ANTES de cargar a producción.
 *
 * Función PURA (sin BD). El caller (MigrationService) construye los "claims"
 * resolviendo la habitación/cama de cada reserva y excluyendo canceladas/no-show.
 *
 * Predicado de solape = el mismo de AvailabilityService (§35), half-open:
 *   solapan ⟺ a.checkIn < b.checkOut && b.checkIn < a.checkOut
 * Back-to-back (checkout de A == checkin de B) NO es empalme (§128).
 */

export interface OccupancyClaim {
  /** Identificador de la fila (rowIndex/id de staging, o id de reserva Zenix existente). */
  ref: string
  /** Clave del recurso físico ocupado (habitación normalizada, o habitación+cama). '' = sin recurso → no se evalúa. */
  resourceKey: string
  /** true si el recurso es una cama de dorm/hostal (afecta el tipo de conflicto). */
  shared: boolean
  /** ISO YYYY-MM-DD. */
  checkIn: string
  checkOut: string
}

export interface DetectedCollision {
  type: 'ROOM_OVERLAP' | 'BED_OVERLAP'
  /** Las dos filas en conflicto. Si `existing` es true, `refs[1]` es una reserva Zenix ya existente. */
  refs: [string, string]
  resourceKey: string
  message: string
  existing: boolean
}

/** ¿Se solapan los rangos [checkIn, checkOut)? Half-open: back-to-back NO solapa. */
export function rangesOverlap(
  aIn: string, aOut: string, bIn: string, bOut: string,
): boolean {
  if (!aIn || !aOut || !bIn || !bOut) return false
  // Comparación lexicográfica válida para fechas ISO YYYY-MM-DD.
  return aIn < bOut && bIn < aOut
}

function valid(c: OccupancyClaim): boolean {
  return !!c.resourceKey && !!c.checkIn && !!c.checkOut && c.checkIn < c.checkOut
}

function collision(a: OccupancyClaim, b: OccupancyClaim, existing: boolean): DetectedCollision {
  const shared = a.shared || b.shared
  return {
    type: shared ? 'BED_OVERLAP' : 'ROOM_OVERLAP',
    refs: [a.ref, b.ref],
    resourceKey: a.resourceKey,
    existing,
    message: shared
      ? `Empalme de cama "${a.resourceKey}": dos huéspedes coinciden en fechas.`
      : `Empalme de habitación "${a.resourceKey}": dos huéspedes coinciden en fechas.`,
  }
}

/**
 * Detecta empalmes en dos pasadas:
 *   (1) staging-vs-staging: entre las filas del propio import.
 *   (2) staging-vs-existing: contra reservas que YA existen en Zenix (por si el
 *       hotel cargó algo manualmente antes de migrar).
 * `existing` debe traer SOLO reservas activas (no canceladas/no-show), igual que `claims`.
 */
export function detectCollisions(
  claims: OccupancyClaim[],
  existing: OccupancyClaim[] = [],
): DetectedCollision[] {
  const result: DetectedCollision[] = []
  const active = claims.filter(valid)

  // ── Pasada 1: staging-vs-staging, agrupado por recurso ──
  const byResource = new Map<string, OccupancyClaim[]>()
  for (const c of active) {
    const bucket = byResource.get(c.resourceKey) ?? []
    bucket.push(c)
    byResource.set(c.resourceKey, bucket)
  }
  for (const bucket of byResource.values()) {
    if (bucket.length < 2) continue
    // Ordenar por checkIn → comparar pares que pueden solapar.
    bucket.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        // Como está ordenado por checkIn, si bucket[j] empieza en/después del
        // checkout de bucket[i], ningún j posterior solapa con i → corta.
        if (bucket[j].checkIn >= bucket[i].checkOut) break
        if (rangesOverlap(bucket[i].checkIn, bucket[i].checkOut, bucket[j].checkIn, bucket[j].checkOut)) {
          result.push(collision(bucket[i], bucket[j], false))
        }
      }
    }
  }

  // ── Pasada 2: staging-vs-existing ──
  if (existing.length > 0) {
    const existingByResource = new Map<string, OccupancyClaim[]>()
    for (const e of existing.filter(valid)) {
      const bucket = existingByResource.get(e.resourceKey) ?? []
      bucket.push(e)
      existingByResource.set(e.resourceKey, bucket)
    }
    for (const c of active) {
      const others = existingByResource.get(c.resourceKey)
      if (!others) continue
      for (const e of others) {
        if (rangesOverlap(c.checkIn, c.checkOut, e.checkIn, e.checkOut)) {
          result.push(collision(c, e, true))
        }
      }
    }
  }

  return result
}
