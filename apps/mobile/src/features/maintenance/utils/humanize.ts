/**
 * humanize.ts (mobile) — Sprint Mx-1B-W2 audit fix T-5.
 *
 * Versión mobile del humanize.ts web. Traduce enums del backend a strings
 * user-friendly en español. Decisión §13 CLAUDE.md / NN/g H2: nunca mostrar
 * `COMMENT_ADDED`, `BLOCK_AUTO_RELEASED`, `ACKNOWLEDGED` al usuario.
 *
 * Mantener sincronizado con `apps/web/src/modules/maintenance/utils/humanize.ts`.
 * Si v1.2 introduce i18n, ambos archivos delegan a `@nestjs/i18n` + Accept-Language.
 */
import type { TicketLogEventValue } from '@zenix/shared'

const EMOJI: Partial<Record<TicketLogEventValue, string>> = {
  CREATED: '🆕',
  ACKNOWLEDGED: '👁',
  ASSIGNED: '👤',
  AUTO_ASSIGNED: '🤖',
  CLAIMED: '✋',
  QUEUED: '📥',
  APPROVED: '✅',
  REJECTED: '❌',
  STARTED: '▶',
  WAITING_PARTS: '⏸',
  RESOLVED: '✅',
  VERIFIED: '✓',
  CLOSED: '🗄',
  REOPENED: '🔄',
  COMMENT_ADDED: '💬',
  PHOTO_ADDED: '📷',
  PHOTO_DELETED: '🗑',
  BLOCK_AUTO_CREATED: '🔒',
  BLOCK_AUTO_RELEASED: '🔓',
  SLA_BREACH: '⏰',
}

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
  PHOTO_DELETED: 'Foto eliminada',
  BLOCK_AUTO_CREATED: 'Habitación bloqueada',
  BLOCK_AUTO_RELEASED: 'Habitación liberada',
  SLA_BREACH: 'Tiempo de respuesta excedido',
}

/** "🔒 Habitación bloqueada" o "• Algo desconocido" como fallback. */
export function humanizeLogEvent(event: TicketLogEventValue): string {
  const emoji = EMOJI[event] ?? '•'
  const label = LOG_EVENT_LABEL[event] ?? event
  return `${emoji} ${label}`
}
