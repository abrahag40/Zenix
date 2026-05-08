/**
 * staff-permissions.ts — matriz de permisos cross-departamental (Sprint 9 G1).
 *
 * Define qué acciones puede ejecutar cada combinación (department, level).
 * Los guards consumen este módulo para autorización granular cuando
 * @RequiresLevel solo no es suficiente (acciones cross-dept con visibilidad
 * compartida — ej. ver ocupación).
 *
 * Justificación AHLEI sec. 2.1 *Cross-Departmental Information Flow*:
 * "Leaders of operational departments require visibility into property
 * occupancy to plan staffing, schedule preventive maintenance during
 * low-occupancy windows, and coordinate special events. Restricting this
 * metric impedes operational efficiency without privacy gain."
 *
 * Privacy guard (GDPR/LGPD): info PII (nombres de huéspedes, contactos)
 * solo accesible a RECEPTION. Métricas operativas (counts, ocupación %)
 * compartidas entre leads.
 */
import { Department, StaffLevel, JwtPayload } from '@zenix/shared'

export type Action =
  // Operacional cross-dept — leads pueden ver
  | 'occupancy.read'                    // % ocupación + count, no PII
  | 'guest.list.read'                   // PII, solo RECEPTION
  // Housekeeping
  | 'task.assign'
  | 'task.verify'                       // DONE → VERIFIED
  | 'task.reject'                       // DONE → READY (rechazo de inspección)
  | 'task.read.all'                     // ver tareas de otros (lead) vs propias (collab)
  | 'task.create.adhoc'                 // walk-in, late checkout
  | 'task.force-urgent'
  | 'task.deep-clean'
  // Reception
  | 'checkin.confirm'
  | 'checkout.confirm'
  | 'checkout.cancel'
  | 'noshow.mark'
  | 'noshow.revert'
  // Maintenance
  | 'ticket.create'                     // cualquiera
  | 'ticket.resolve'                    // solo MAINT
  | 'ticket.verify'                     // solo MAINT lead
  | 'block.create'                      // OUT_OF_ORDER/SERVICE
  | 'block.approve'                     // requiere lead
  // Reports
  | 'report.financial.read'             // solo RECEPTION lead (MOD)
  | 'report.housekeeping.read'          // HK lead
  | 'report.maintenance.read'           // MAINT lead
  // Settings
  | 'settings.property.write'           // owner/super-admin only

interface ActorContext {
  department?: Department
  level?: StaffLevel
}

/**
 * Decisión central de permiso. Lee (department, level) del actor y
 * retorna boolean. Las reglas siguen la matriz aprobada en CLAUDE.md.
 */
export function can(actor: ActorContext, action: Action): boolean {
  const isLead = actor.level === StaffLevel.LEAD
  const dept = actor.department

  switch (action) {
    // ── Cross-dept — leads ven ocupación, todos collabs no ─────────────
    case 'occupancy.read':
      return isLead || dept === Department.RECEPTION

    case 'guest.list.read':
      return dept === Department.RECEPTION

    // ── Housekeeping ────────────────────────────────────────────────
    case 'task.assign':
    case 'task.verify':
    case 'task.reject':
    case 'task.create.adhoc':
    case 'task.force-urgent':
    case 'task.deep-clean':
      return isLead && dept === Department.HOUSEKEEPING

    case 'task.read.all':
      // HK lead ve todas las tareas. Otros leads (MAINT, RECEPTION) ven
      // read-only para coordinación (no editan).
      return isLead

    // ── Reception ───────────────────────────────────────────────────
    case 'checkin.confirm':
    case 'checkout.confirm':
    case 'noshow.mark':
      return dept === Department.RECEPTION
    case 'checkout.cancel':
    case 'noshow.revert':
      return isLead && dept === Department.RECEPTION

    // ── Maintenance ─────────────────────────────────────────────────
    case 'ticket.create':
      return true                       // cualquiera puede reportar
    case 'ticket.resolve':
      return dept === Department.MAINTENANCE
    case 'ticket.verify':
      return isLead && dept === Department.MAINTENANCE
    case 'block.create':
      return isLead && dept === Department.MAINTENANCE
    case 'block.approve':
      // OUT_OF_ORDER afecta RevPAR — co-aprobación maint + recepción.
      return isLead && (dept === Department.MAINTENANCE || dept === Department.RECEPTION)

    // ── Reports ─────────────────────────────────────────────────────
    case 'report.financial.read':
      return isLead && dept === Department.RECEPTION
    case 'report.housekeeping.read':
      return isLead && dept === Department.HOUSEKEEPING
    case 'report.maintenance.read':
      return isLead && dept === Department.MAINTENANCE

    // ── Settings — solo property owner via super-admin (futuro) ─────
    case 'settings.property.write':
      return false  // bloquear en API hasta que tengamos owner role

    default:
      return false
  }
}

/** Helper para usar desde controllers/services con JwtPayload directo */
export function canActor(actor: JwtPayload, action: Action): boolean {
  return can({ department: actor.department, level: actor.level }, action)
}
