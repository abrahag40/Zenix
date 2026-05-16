/**
 * NotificationPanel — sliding panel connected to the bell icon.
 *
 * Design principles (CLAUDE.md §Principio Rector):
 * - Carga cognitiva: 3 categorías visuales (URGENTE / acción / informativo)
 *   — el recepcionista procesa por color + ícono, no leyendo texto.
 * - Ley de Fitts: botones de acción grandes, en la parte inferior del card.
 * - Kahneman Sistema 2: solo ACTION_REQUIRED/APPROVAL_REQUIRED activan
 *   un segundo paso explícito; INFORMATIONAL se descarta con un tap.
 * - Feedback inmediato: mark-as-read en click, badge actualiza al instante.
 */
import { useRef, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Bell, X, Check, CheckCheck, AlertCircle, Info,
  ShieldAlert, LogOut, UserX, RotateCcw, Wrench,
  CreditCard, Calendar, BellOff, Clock, ClipboardCheck,
  UserCheck, Inbox, PauseCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { AppNotification, AppNotificationCategory } from '@/api/notifications.api'

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  AppNotificationCategory,
  { icon: React.ElementType; label: string; color: string; bg: string; border: string }
> = {
  CHECKIN_UNCONFIRMED:               { icon: Calendar,        label: 'Llegada pendiente',     color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  EARLY_CHECKOUT:                    { icon: LogOut,          label: 'Salida anticipada',     color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
  NO_SHOW:                           { icon: UserX,           label: 'No-show',               color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
  NO_SHOW_REVERTED:                  { icon: RotateCcw,       label: 'No-show revertido',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200'},
  ARRIVAL_RISK:                      { icon: AlertCircle,     label: 'Riesgo de llegada',     color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  CHECKOUT_COMPLETE:                 { icon: Check,           label: 'Checkout completo',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200'},
  TASK_COMPLETED:                    { icon: CheckCheck,      label: 'Tarea completada',      color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200'  },
  MAINTENANCE_REPORTED:              { icon: Wrench,          label: 'Mantenimiento',         color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  PAYMENT_PENDING:                   { icon: CreditCard,      label: 'Pago pendiente',        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
  SYSTEM:                            { icon: Info,            label: 'Sistema',               color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200'  },
  // Sprint Mx-1 — 9 categorías de tickets de mantenimiento
  MAINTENANCE_TICKET_CREATED:        { icon: Wrench,          label: 'Ticket creado',         color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  MAINTENANCE_TICKET_UPDATED:        { icon: Wrench,          label: 'Ticket actualizado',    color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  MAINTENANCE_TICKET_CRITICAL:       { icon: ShieldAlert,     label: 'Mantenimiento crítico', color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
  MAINTENANCE_TICKET_NEEDS_APPROVAL: { icon: AlertCircle,     label: 'Aprobación requerida',  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
  MAINTENANCE_TICKET_ASSIGNED:       { icon: UserCheck,       label: 'Ticket asignado',       color: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  MAINTENANCE_TICKET_RESOLVED:       { icon: ClipboardCheck,  label: 'Por verificar',         color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  MAINTENANCE_TICKET_VERIFIED:       { icon: CheckCheck,      label: 'Trabajo verificado',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200'},
  MAINTENANCE_TICKET_QUEUED:         { icon: Inbox,           label: 'En cola',               color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200'  },
  MAINTENANCE_SLA_BREACH:            { icon: Clock,           label: 'Tiempo excedido',       color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
  // Sprint 9
  TASK_VERIFIED_READY:               { icon: CheckCheck,      label: 'Lista para huésped',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200'},
  LATE_CHECKOUT_PENDING:             { icon: PauseCircle,     label: 'Salida demorada',       color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
  LATE_CHECKOUT_ESCALATED:           { icon: AlertCircle,     label: 'Salida sin confirmar',  color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
}

const PRIORITY_STRIPE: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH:   'bg-orange-400',
  MEDIUM: 'bg-amber-300',
  LOW:    'bg-slate-300',
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  INFORMATIONAL:    { label: 'Info',      color: 'bg-slate-100 text-slate-600' },
  ACTION_REQUIRED:  { label: 'Acción',    color: 'bg-amber-100 text-amber-800' },
  APPROVAL_REQUIRED:{ label: 'Aprobación',color: 'bg-red-100 text-red-800'     },
}

// ─── NotificationCard ─────────────────────────────────────────────────────────

interface CardProps {
  notif:           AppNotification
  onRead:          (id: string) => void
  onApprove?:      (id: string) => void
  onReject?:       (id: string) => void
  onNavigate?:     (url: string) => void
  isActionPending?: boolean
}

function NotificationCard({ notif, onRead, onApprove, onReject, onNavigate, isActionPending }: CardProps) {
  const meta   = CATEGORY_META[notif.category] ?? CATEGORY_META.SYSTEM
  const Icon   = meta.icon
  const stripe = PRIORITY_STRIPE[notif.priority] ?? PRIORITY_STRIPE.MEDIUM

  const handleClick = () => {
    if (!notif.isRead) onRead(notif.id)
    if (notif.actionUrl) onNavigate?.(notif.actionUrl)
  }

  const relativeTime = formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: es })

  /*
   * W3.5 pixel-perfect (debate 2026-05-13):
   *
   * Typography: text-[13px] title + text-xs body — alineado con cards
   *   del sistema (Kanban, BookingDetailSheet). Antes text-sm (14px) era
   *   inconsistente.
   *
   * Chips: solo 1 chip de categoría. Antes había 2 (type + category) que
   *   eran redundantes ("Aprobación" + "Aprobación requerida"). Drop type.
   *
   * Unread dot: movido al far-right del card, vertically centered con
   *   `self-center`. Justificación: pre-attentive Treisman 1980 (scent
   *   independiente del bg sutil). Patrón FB/iOS Mail/Linear.
   *
   * Icono "!": ahora vertically centered via grid template (no flex+mt-0.5)
   *   — Apple HIG composed list items con contenido variable.
   *
   * Meta footer: "Por X" + "hace Yh" mismo baseline (flex con gap, no
   *   bloques separados).
   */
  return (
    <div
      className={cn(
        'group relative grid gap-2.5 px-4 py-3 transition-colors cursor-pointer',
        notif.isRead
          ? 'bg-white hover:bg-slate-50'
          : 'bg-blue-50/40 hover:bg-blue-50',
      )}
      style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}
      onClick={handleClick}
    >
      {/* Priority stripe — accent vertical izquierdo, full height */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-0.5', stripe)} />

      {/* Category icon — vertically centered con todo el contenido (Apple HIG
          composed list) */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border self-center',
          meta.bg, meta.border,
        )}
      >
        <Icon className={cn('h-4 w-4', meta.color)} />
      </div>

      {/* Content column */}
      <div className="min-w-0 flex flex-col gap-1.5">
        {/* Title — alineado pixel-perfect con TicketCard del Kanban
            (text-sm font-semibold tracking-tight). Hierarchy 14/12/10/10
            consistente con cards operacionales del sistema. */}
        <p className={cn(
          'text-sm leading-snug line-clamp-2 tracking-tight',
          notif.isRead ? 'text-slate-600 font-medium' : 'text-slate-900 font-semibold',
        )}>
          {notif.title}
        </p>

        {/* Body */}
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {notif.body}
        </p>

        {/* Single category chip — drop redundant type chip */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
            meta.color, meta.bg,
          )}>
            {meta.label}
          </span>
        </div>

        {/* Footer meta: author + time SAME baseline (was 2 separate blocks) */}
        <div className="flex items-baseline gap-1.5 text-[10px] text-slate-400">
          {notif.triggeredBy && (
            <>
              <span>Por {notif.triggeredBy}</span>
              <span className="text-slate-300">·</span>
            </>
          )}
          <span>{relativeTime}</span>
        </div>

        {/* Approval actions — NOTIF-11: disabled while a mutation is in flight
            to prevent double-click duplicates (NN/g H5 error prevention). */}
        {notif.type === 'APPROVAL_REQUIRED' && !notif.approval && (
          <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              disabled={isActionPending}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { onApprove?.(notif.id); onRead(notif.id) }}
            >
              <Check className="h-3 w-3 mr-1" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isActionPending}
              className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => { onReject?.(notif.id); onRead(notif.id) }}
            >
              <X className="h-3 w-3 mr-1" />
              Rechazar
            </Button>
          </div>
        )}

        {/* Approval result */}
        {notif.approval && (
          <div className={cn(
            'mt-1 text-[10px] font-semibold px-2 py-1 rounded',
            notif.approval.action === 'APPROVED'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700',
          )}>
            {notif.approval.action === 'APPROVED' ? '✓ Aprobado' : '✗ Rechazado'}
            {notif.approval.reason ? ` — ${notif.approval.reason}` : ''}
          </div>
        )}
      </div>

      {/* Side column — X (top) + unread dot (vertical center, far right).
          Patrón FB/iOS Mail: unread dot SIEMPRE en el borde derecho del card,
          vertical-centered con todo el contenido — pre-attentive scent
          independiente del bg sutil (Treisman 1980). */}
      <div className="relative flex flex-col items-end gap-2 self-stretch shrink-0">
        <button
          className="p-0.5 text-slate-300 hover:text-slate-600 rounded transition-colors"
          onClick={(e) => { e.stopPropagation(); onRead(notif.id) }}
          aria-label="Marcar como leída"
          title="Marcar como leída"
        >
          <X className="h-3 w-3" />
        </button>
        {!notif.isRead && (
          <span
            className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500"
            aria-label="Sin leer"
          />
        )}
      </div>
    </div>
  )
}

// ─── NotificationPanel ────────────────────────────────────────────────────────

interface NotificationPanelProps {
  open:            boolean
  onClose:         () => void
  notifications:   AppNotification[]
  unreadCount:     number
  onRead:          (id: string) => void
  onMarkAll:       () => void
  onApprove:       (id: string) => void
  onReject:        (id: string) => void
  onNavigate:      (url: string) => void
  isActionPending?: boolean
}

export function NotificationPanel({
  open, onClose, notifications, unreadCount,
  onRead, onMarkAll, onApprove, onReject, onNavigate,
  isActionPending,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  /*
   * Click-outside close — fix 2026-05-13:
   *   Antes el listener se ejecutaba en `mousedown` con un guard `if (!open)
   *   return`. El bug en React 18 StrictMode (dev) era el siguiente:
   *
   *     1. User mousedown en bell → no hay listener todavía (open=false)
   *     2. click → onClick: setPanelOpen(true)
   *     3. React commit + useEffect en StrictMode: mount → cleanup → mount
   *     4. En el ciclo de StrictMode, el cleanup REMOVE el listener, pero
   *        algunos eventos del navegador entraban entre el mount inicial
   *        y la siguiente acción del usuario, cerrando el panel.
   *
   *   Solución: usar `pointerdown` con guard explícito al bell + delay
   *   `requestAnimationFrame` para que el listener se registre DESPUÉS
   *   del commit del panel (asegura panelRef.current ya está asignado).
   *   Además: ignorar el target si es el botón del bell (clase
   *   aria-label="Notificaciones") para que el toggle natural no compita.
   */
  useEffect(() => {
    if (!open) return
    let cleanup: (() => void) | null = null
    const raf = requestAnimationFrame(() => {
      const handler = (e: MouseEvent) => {
        // No cerrar si el click es en el bell (deja que el onClick toggle naturalmente)
        const target = e.target as HTMLElement | null
        if (target?.closest('[aria-label="Notificaciones"]')) return
        if (panelRef.current && !panelRef.current.contains(target as Node)) {
          onClose()
        }
      }
      document.addEventListener('mousedown', handler)
      cleanup = () => document.removeEventListener('mousedown', handler)
    })
    return () => {
      cancelAnimationFrame(raf)
      cleanup?.()
    }
  }, [open, onClose])

  // W3.5 — FB-style tabs "Todas / Sin leer" sobre las secciones por prioridad.
  // Patrón Facebook/Instagram 2020+: el usuario filtra de un tap (All|Unread),
  // y dentro de cada tab las notificaciones se agrupan por urgencia operativa.
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  // Locally-dismissed IDs — sesión actual del panel. Click X oculta la
  // notif inmediatamente del view (en ambos tabs Todas y Sin leer); el
  // markRead mutation persiste el dismiss en DB. Si el panel se cierra y
  // re-abre, las que tienen isRead=true desaparecerán naturalmente de
  // "Sin leer" pero en "Todas" volverán a aparecer (correcto — el archivo
  // de notifs queda visible). Para purga DB definitiva ver scheduler de
  // limpieza en API (notification-purge.scheduler.ts).
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const base = tab === 'unread' ? notifications.filter((n) => !n.isRead) : notifications
    return base.filter((n) => !dismissedIds.has(n.id))
  }, [tab, notifications, dismissedIds])

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id))
    onRead(id)
  }

  if (!open) return null

  const urgent  = filtered.filter((n) => n.priority === 'URGENT' || n.priority === 'HIGH')
  const actions = filtered.filter((n) => n.type !== 'INFORMATIONAL' && n.priority !== 'URGENT' && n.priority !== 'HIGH')
  const rest    = filtered.filter((n) => n.type === 'INFORMATIONAL' && n.priority !== 'URGENT' && n.priority !== 'HIGH')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-14 right-2 z-50 w-[380px] max-h-[calc(100vh-5rem)]',
          'flex flex-col bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.14)]',
          'border border-slate-200 overflow-hidden',
          'animate-in slide-in-from-top-2 duration-200',
        )}
      >
        {/* Header — patrón FB: título grande arriba, X esquina derecha,
            "Marcar todas leídas" como link sutil. Sin redundar el count
            del bell (ya visible en el botón externo). */}
        <div className="flex items-start justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Notificaciones</h2>
            {unreadCount > 0 && (
              <span className="text-[11px] font-bold bg-red-500 text-white rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 leading-none tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAll}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors px-2 py-1 rounded hover:bg-emerald-50"
                title="Marcar todas como leídas"
              >
                Marcar todas
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* FB-style segmented tabs: All / Unread. Pill activa = bg-blue-100
            text-blue-700, inactiva = solo texto (NN/g 2020 — minimal chrome). */}
        <div className="flex items-center gap-1 px-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <button
            onClick={() => setTab('all')}
            className={cn(
              'text-sm font-semibold rounded-full px-3 py-1 transition-colors',
              tab === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            Todas
          </button>
          <button
            onClick={() => setTab('unread')}
            className={cn(
              'text-sm font-semibold rounded-full px-3 py-1 transition-colors inline-flex items-center gap-1.5',
              tab === 'unread'
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            Sin leer
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Content — secciones con psicología del color aplicada:
            · red    = peligro/urgente (Cialdini 1984 escasez visual)
            · amber  = advertencia/acción (semáforo advisory)
            · slate  = informativo neutral (Mehrabian-Russell 1974)
            Cada section header usa border-l-2 con el color semántico para
            anclar visualmente al usuario sin saturar el chrome. */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <BellOff className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">
                {tab === 'unread' ? 'Sin notificaciones por leer' : 'Sin notificaciones'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {tab === 'unread' ? 'Estás al día.' : 'Todo al día por aquí.'}
              </p>
            </div>
          ) : (
            <>
              {/* URGENT — psicología: red activa Sistema 1 (Kahneman),
                  forcing immediate attention sin necesidad de leer texto */}
              {urgent.length > 0 && (
                <div>
                  <div className="px-5 py-2 bg-gradient-to-r from-red-50 to-red-50/40 border-b border-red-100 border-l-2 border-l-red-500">
                    <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="h-3 w-3" />
                      Urgente · Alta prioridad
                    </span>
                  </div>
                  {urgent.map((n) => (
                    <NotificationCard
                      key={n.id} notif={n}
                      onRead={handleDismiss} onApprove={onApprove} onReject={onReject} onNavigate={onNavigate}
                      isActionPending={isActionPending}
                    />
                  ))}
                </div>
              )}

              {/* ACTION — psicología: amber = advisory (semáforo no-bloqueante).
                  Captura atención pero permite procesar Sistema 2 (deliberado) */}
              {actions.length > 0 && (
                <div>
                  <div className="px-5 py-2 bg-gradient-to-r from-amber-50 to-amber-50/40 border-b border-amber-100 border-l-2 border-l-amber-500">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                      Requieren acción
                    </span>
                  </div>
                  {actions.map((n) => (
                    <NotificationCard
                      key={n.id} notif={n}
                      onRead={handleDismiss} onApprove={onApprove} onReject={onReject} onNavigate={onNavigate}
                      isActionPending={isActionPending}
                    />
                  ))}
                </div>
              )}

              {/* INFO — slate neutro, no compite visualmente con prioridades */}
              {rest.length > 0 && (
                <div>
                  {(urgent.length > 0 || actions.length > 0) && (
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 border-l-2 border-l-slate-300">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Informativas
                      </span>
                    </div>
                  )}
                  {rest.map((n) => (
                    <NotificationCard
                      key={n.id} notif={n}
                      onRead={handleDismiss} onApprove={onApprove} onReject={onReject} onNavigate={onNavigate}
                      isActionPending={isActionPending}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
