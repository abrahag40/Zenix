/**
 * room-matcher (MIGRATION-CORE Sprint 2) — resuelve la habitación/cama Zenix de
 * una reserva del origen, y construye la clave de recurso para el detector de
 * empalmes. PURO (recibe el inventario de la property como argumento).
 *
 * Estrategia de clave de recurso (resourceKey):
 *   - La etiqueta del origen YA distingue camas en dorms ("Dorm A - Bed 1" vs
 *     "Dorm A - Bed 2"), así que la clave = etiqueta normalizada. Dos reservas
 *     con la MISMA etiqueta compiten por el mismo recurso; con etiquetas
 *     distintas, no. Esto da bed-level "gratis" cuando el origen trae la cama.
 *   - `shared` (cama vs habitación) se deriva de la categoría del Room Zenix
 *     emparejado, o como fallback de la etiqueta (contiene bed/cama/dorm).
 */

export interface ZenixRoomLite {
  id: string
  number: string
  category: 'PRIVATE' | 'SHARED'
  roomTypeName?: string | null
  roomTypeCode?: string | null
}

export interface RoomMatch {
  /** Room Zenix emparejado, o null si no hubo match (→ conflicto NO_ROOM_MATCH). */
  roomId: string | null
  matched: boolean
  /** Clave del recurso físico para el detector (etiqueta normalizada). '' si no hay etiqueta. */
  resourceKey: string
  /** true si es cama de dorm/hostal. */
  shared: boolean
}

export function normalizeLabel(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

const BED_HINT = /\b(bed|cama|dorm|litera|bunk)\b/i

export function matchRoom(
  roomLabel: string | undefined,
  roomTypeLabel: string | undefined,
  rooms: ZenixRoomLite[],
): RoomMatch {
  const label = normalizeLabel(roomLabel)
  const resourceKey = label // la clave del recurso es la etiqueta del origen (distingue camas)

  // Match exacto por número de habitación (case-insensitive).
  let room = label ? rooms.find((r) => normalizeLabel(r.number) === label) : undefined

  // Si la etiqueta trae cama ("Dorm A - Bed 1"), intentar emparejar por el
  // prefijo antes del separador con el número del Room.
  if (!room && label) {
    const base = label.split(/[-–·|]/)[0].trim()
    room = rooms.find((r) => normalizeLabel(r.number) === base)
  }

  const shared = room ? room.category === 'SHARED' : BED_HINT.test(roomLabel ?? '')

  return {
    roomId: room?.id ?? null,
    matched: !!room,
    resourceKey,
    shared,
  }
}
