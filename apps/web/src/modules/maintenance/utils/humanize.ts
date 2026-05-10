/**
 * humanize.ts — Sprint Mx-1B-W1.1
 *
 * Traductores de enums del backend a texto user-friendly en español.
 * Decisión arquitectónica (§13 CLAUDE.md / NN/g H2 "Match between system and
 * real world"): NUNCA mostrar `IN_PROGRESS`, `OUT_OF_ORDER`, `ACKNOWLEDGED`
 * al usuario. Son nombres de implementación, no de operación.
 *
 * Si un enum nuevo no está mapeado aquí, hay un fallback que normaliza
 * el SCREAMING_SNAKE_CASE a Title Case para evitar mostrar el raw value.
 */
import type {
  TicketStatusValue,
  TicketPriorityValue,
  TicketCategoryValue,
  TicketLogEventValue,
} from '@zenix/shared'

// ─── Status ─────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<TicketStatusValue, string> = {
  OPEN: 'Sin asignar',
  ACKNOWLEDGED: 'Recibido',
  IN_PROGRESS: 'En progreso',
  WAITING_PARTS: 'Esperando refacciones',
  RESOLVED: 'Por verificar',
  VERIFIED: 'Verificado',
  CLOSED: 'Archivado',
}

// ─── Priority ───────────────────────────────────────────────────────────

export const PRIORITY_LABEL_ES: Record<TicketPriorityValue, string> = {
  CRITICAL: 'Crítico',
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
}

// ─── Category ───────────────────────────────────────────────────────────

export const CATEGORY_LABEL_ES: Record<TicketCategoryValue, string> = {
  PLUMBING: 'Plomería',
  ELECTRICAL: 'Eléctrico',
  FURNITURE: 'Mobiliario',
  APPLIANCE: 'Electrodoméstico',
  HVAC: 'Climatización',
  STRUCTURAL: 'Estructura',
  COSMETIC: 'Cosmético',
  SAFETY: 'Seguridad',
  PEST: 'Plagas',
  DEEP_CLEANING: 'Limpieza profunda',
  OTHER: 'Otro',
}

// ─── Log events ─────────────────────────────────────────────────────────

export const LOG_EVENT_LABEL: Record<TicketLogEventValue, string> = {
  CREATED: 'Ticket creado',
  ACKNOWLEDGED: 'Recibido por el técnico',
  ASSIGNED: 'Asignado',
  AUTO_ASSIGNED: 'Asignado automáticamente',
  CLAIMED: 'Tomado voluntariamente',
  QUEUED: 'Enviado a cola',
  APPROVED: 'Aprobado por supervisor',
  REJECTED: 'Rechazado',
  STARTED: 'Trabajo iniciado',
  WAITING_PARTS: 'En espera de refacciones',
  RESOLVED: 'Marcado como resuelto',
  VERIFIED: 'Verificado por supervisor',
  CLOSED: 'Archivado',
  REOPENED: 'Reabierto',
  COMMENT_ADDED: 'Comentario añadido',
  PHOTO_ADDED: 'Foto añadida',
  BLOCK_AUTO_CREATED: 'Habitación bloqueada automáticamente',
  BLOCK_AUTO_RELEASED: 'Habitación liberada',
  SLA_BREACH: 'Tiempo de respuesta excedido',
}

// ─── Block semantic (interno — usado en metadata.semantic) ──────────────

export const BLOCK_SEMANTIC_LABEL: Record<string, string> = {
  OUT_OF_ORDER: 'Fuera de servicio',
  OUT_OF_INVENTORY: 'Fuera de inventario',
  HOUSE_USE: 'Uso interno',
}

export const BLOCK_REASON_LABEL: Record<string, string> = {
  MAINTENANCE: 'Mantenimiento',
  CLEANING_DEEP: 'Limpieza profunda',
  RENOVATION: 'Renovación',
  PEST_CONTROL: 'Control de plagas',
  WATER_DAMAGE: 'Daño por agua',
  ELECTRICAL: 'Eléctrico',
  STRUCTURAL: 'Estructural',
  HVAC: 'Climatización',
  PLUMBING: 'Plomería',
  OWNER_STAY: 'Estancia del dueño',
  STAFF_USE: 'Uso del staff',
  OTHER: 'Otro',
}

// ─── Mode (Flow A/B/C de wizard) ────────────────────────────────────────

export const FLOW_LABEL: Record<string, string> = {
  TOP_DOWN: 'Asignación directa',
  BOTTOM_UP_APPROVAL: 'Reporte con aprobación',
  QUEUE: 'En cola',
  MANUAL: 'Manual',
  ON_APPROVAL: 'Al aprobar',
  AT_CREATION: 'Al crear',
  LOAD_BALANCED: 'Carga balanceada',
}

// ─── Fallback general ───────────────────────────────────────────────────

/**
 * Convierte cualquier enum SCREAMING_SNAKE_CASE a "Title Case" legible si no
 * está mapeado. Última línea de defensa contra leaks de strings de sistema.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return ''
  if (typeof value !== 'string') return String(value)
  if (!value.includes('_') && value === value.toLowerCase()) return value
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Render para metadata de logs: convierte `{"roomBlockId": "abc-123", ...}`
 * en líneas legibles tipo "ID del bloque: abc-123" + traduce semantic/reason.
 */
export function humanizeLogMetadata(metadata: Record<string, unknown> | null): string[] {
  if (!metadata || typeof metadata !== 'object') return []
  const lines: string[] = []
  for (const [key, raw] of Object.entries(metadata)) {
    if (raw == null || raw === '') continue
    const label = humanizeKey(key)
    let value: string
    if (typeof raw === 'object') {
      value = JSON.stringify(raw).slice(0, 60)
    } else if (key === 'semantic' && typeof raw === 'string') {
      value = BLOCK_SEMANTIC_LABEL[raw] ?? humanize(raw)
    } else if (key === 'reason' && typeof raw === 'string' && BLOCK_REASON_LABEL[raw]) {
      value = BLOCK_REASON_LABEL[raw]
    } else if ((key === 'priority' || key === 'fromStatus' || key === 'toStatus') && typeof raw === 'string') {
      value = humanize(raw)
    } else if (key === 'flow' && typeof raw === 'string') {
      value = FLOW_LABEL[raw] ?? humanize(raw)
    } else if (typeof raw === 'string' && raw.length > 24 && raw.includes('-')) {
      // UUID — abreviar
      value = `${raw.slice(0, 8)}…`
    } else {
      value = String(raw)
    }
    lines.push(`${label}: ${value}`)
  }
  return lines
}

const KEY_LABEL: Record<string, string> = {
  flow: 'Flujo',
  priority: 'Prioridad',
  category: 'Categoría',
  toStaffId: 'Asignado a',
  fromStaffId: 'Antes asignado a',
  mode: 'Modo',
  reason: 'Razón',
  semantic: 'Tipo de bloqueo',
  roomBlockId: 'Bloqueo',
  byRejection: 'Por rechazo',
  rule: 'Regla',
  activeCount: 'Carga activa',
  autoCreatedCleaningTaskId: 'Tarea de limpieza generada',
  kind: 'Tipo',
  resolutionSummary: 'Resumen',
  actualMinutes: 'Minutos reales',
  elapsedMin: 'Minutos transcurridos',
  thresholdMin: 'Umbral (min)',
  comment: 'Comentario',
  commentId: 'Comentario',
  photoId: 'Foto',
  isAfterPhoto: 'Foto después',
  onClaim: 'Al tomar',
  byVerifyRejection: 'Por rechazo de verificación',
  autoOnCreate: 'Auto al crear',
  estimatedEndAt: 'Fin estimado',
  initialEstimateDays: 'Estimación inicial (días)',
  extendedAt: 'Extendido',
  extendedToAt: 'Extendido hasta',
}

function humanizeKey(key: string): string {
  return KEY_LABEL[key] ?? humanize(key)
}
