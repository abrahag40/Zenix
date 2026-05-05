/**
 * groupByRoom — D18 / Sprint 8I.
 *
 * Toma una lista de tareas (de UNA priority section) y las agrupa por habitación.
 * Decide runtime si renderizar como agrupador (≥2 tasks del mismo room) o flat.
 *
 * Reglas (CLAUDE.md §59 — D18):
 *   - Sort dentro del room: por bed/unit label ASC (predictable, matches física)
 *   - Counters AGREGADOS — counts en el header del room reflejan TODO el cuarto,
 *     no solo las tasks de esta priority section. La función recibe tanto la
 *     section como TODAS las tasks del cuarto del día.
 *   - Auto-detect: ≥2 tasks de un room en la section → grupo. <2 → flat.
 */
import type { CleaningTaskDto } from '@zenix/shared'

export interface RoomGroup {
  roomId: string
  roomNumber: string
  /** Tareas de esta priority section que pertenecen a este room */
  sectionTasks: CleaningTaskDto[]
  /** Cuántas camas del cuarto ya salieron físicamente (status no es PENDING) */
  salidasDone: number
  /** Total de tareas del cuarto hoy (across all priority sections) */
  salidasTotal: number
  /** Cuántas camas del cuarto ya están limpias (DONE o VERIFIED) */
  cleaningsDone: number
  /** Total de tareas del cuarto hoy */
  cleaningsTotal: number
  /** True si esta sección tiene ≥2 tasks de este room (renderizar como group) */
  shouldGroup: boolean
}

export interface GroupByRoomResult {
  groups: RoomGroup[]
  /** Tareas que NO se agruparon (rooms con 1 sola task en esta section) */
  flatTasks: CleaningTaskDto[]
}

/**
 * Aggrega contadores per-room a partir de la lista completa del día.
 * Retorna mapa roomId → { salidasDone, salidasTotal, cleaningsDone, cleaningsTotal }
 */
export function buildRoomCounters(
  allDayTasks: CleaningTaskDto[],
): Map<string, Pick<RoomGroup, 'salidasDone' | 'salidasTotal' | 'cleaningsDone' | 'cleaningsTotal'>> {
  const map = new Map<
    string,
    { salidasDone: number; salidasTotal: number; cleaningsDone: number; cleaningsTotal: number }
  >()

  for (const t of allDayTasks) {
    const roomId = t.unit?.room?.id
    if (!roomId) continue
    const cur = map.get(roomId) ?? {
      salidasDone: 0, salidasTotal: 0, cleaningsDone: 0, cleaningsTotal: 0,
    }
    cur.salidasTotal += 1
    cur.cleaningsTotal += 1

    // "Salida" = el huésped ya salió → status no es PENDING/CANCELLED
    if (
      t.status !== 'PENDING' &&
      t.status !== 'CANCELLED'
    ) {
      cur.salidasDone += 1
    }
    // "Limpieza" = housekeeping ya terminó → DONE / VERIFIED
    if (t.status === 'DONE' || t.status === 'VERIFIED') {
      cur.cleaningsDone += 1
    }
    map.set(roomId, cur)
  }
  return map
}

/**
 * Agrupa las tareas de UNA priority section por habitación.
 * Aplica auto-detect: rooms con 1 task → flat (sin overhead).
 *
 * @param sectionTasks  Tareas de esta priority section (ya ordenadas externamente)
 * @param allDayTasks   TODAS las tareas del día (para counters agregados)
 */
export function groupByRoom(
  sectionTasks: CleaningTaskDto[],
  allDayTasks: CleaningTaskDto[],
): GroupByRoomResult {
  const counters = buildRoomCounters(allDayTasks)

  // Group section tasks by roomId, preserving original order within group
  const byRoom = new Map<string, CleaningTaskDto[]>()
  for (const t of sectionTasks) {
    const roomId = t.unit?.room?.id
    if (!roomId) continue
    if (!byRoom.has(roomId)) byRoom.set(roomId, [])
    byRoom.get(roomId)!.push(t)
  }

  const groups: RoomGroup[] = []
  const flatTasks: CleaningTaskDto[] = []

  // Iterate in insertion order (matches input order — most urgent first)
  for (const [roomId, roomTasks] of byRoom.entries()) {
    if (roomTasks.length < 2) {
      // Auto-detect: 1 sola task → flat (sin overhead de room header)
      flatTasks.push(...roomTasks)
      continue
    }

    // Sort within room by bed label ASC (matches physical layout)
    const sortedRoomTasks = [...roomTasks].sort((a, b) => {
      const aLabel = a.unit?.label ?? ''
      const bLabel = b.unit?.label ?? ''
      return aLabel.localeCompare(bLabel)
    })

    const counter = counters.get(roomId) ?? {
      salidasDone: 0, salidasTotal: 0, cleaningsDone: 0, cleaningsTotal: 0,
    }
    const room = sortedRoomTasks[0].unit?.room
    groups.push({
      roomId,
      roomNumber: room?.number ?? '—',
      sectionTasks: sortedRoomTasks,
      shouldGroup: true,
      ...counter,
    })
  }

  return { groups, flatTasks }
}

/**
 * Color de borde determinístico per roomId (Gestalt similarity, D18 regla 4).
 * 8 colores muted que NO compiten con los priority colors (red/amber/emerald).
 * El ojo agrupa visualmente las instancias del mismo room sin chunk extra.
 */
const ROOM_BORDER_PALETTE = [
  '#94A3B8', // slate-400
  '#A78BFA', // violet-400
  '#FB923C', // orange-400
  '#22D3EE', // cyan-400
  '#FB7185', // rose-400
  '#A3E635', // lime-400
  '#FBBF24', // amber-400 (more saturated)
  '#818CF8', // indigo-400
] as const

export function roomBorderColor(roomId: string): string {
  // Simple deterministic hash (sum of char codes)
  let hash = 0
  for (let i = 0; i < roomId.length; i++) {
    hash = (hash + roomId.charCodeAt(i)) % ROOM_BORDER_PALETTE.length
  }
  return ROOM_BORDER_PALETTE[hash]
}
