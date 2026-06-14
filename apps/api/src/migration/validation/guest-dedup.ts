/**
 * guest-dedup (MIGRATION-CORE Sprint 2) — agrupa huéspedes que son la misma
 * persona (mismo email > teléfono normalizado > nombre normalizado) para no
 * crear perfiles duplicados al migrar. PURO. Genera grupos de filas duplicadas
 * que el servicio reporta como conflictos DUP_GUEST (WARN) en el preview.
 */
import type { MigrationReservationDto } from '@zenix/shared'

export interface DuplicateGuestGroup {
  /** Clave de identidad (email/teléfono/nombre). */
  key: string
  /** refs (rowIndex/id) de las reservas del mismo huésped (≥2). */
  refs: string[]
  displayName: string
}

function digitsOnly(s?: string): string {
  return (s ?? '').replace(/\D/g, '')
}

/** Identidad de huésped: email > teléfono (solo dígitos) > nombre normalizado. */
export function guestIdentityKey(r: MigrationReservationDto): string {
  if (r.guestEmail) return `email:${r.guestEmail.trim().toLowerCase()}`
  const phone = digitsOnly(r.guestPhone)
  if (phone.length >= 7) return `phone:${phone}`
  return `name:${(r.guestName ?? '').trim().toLowerCase()}`
}

/**
 * Devuelve los grupos con ≥2 reservas del mismo huésped. `refOf` mapea cada
 * reserva a su identificador estable (rowIndex como string).
 */
export function findDuplicateGuests(
  reservations: MigrationReservationDto[],
  refOf: (r: MigrationReservationDto, index: number) => string,
): DuplicateGuestGroup[] {
  const groups = new Map<string, { refs: string[]; displayName: string }>()
  reservations.forEach((r, i) => {
    const key = guestIdentityKey(r)
    const g = groups.get(key) ?? { refs: [], displayName: r.guestName }
    g.refs.push(refOf(r, i))
    groups.set(key, g)
  })
  return [...groups.entries()]
    .filter(([, g]) => g.refs.length >= 2)
    .map(([key, g]) => ({ key, refs: g.refs, displayName: g.displayName }))
}
