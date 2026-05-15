/**
 * TicketDetailDrawer.tsx — Sprint Mx-1B-W1
 *
 * Panel lateral 480px (nivel 2 — §19 CLAUDE.md progressive disclosure).
 * El supervisor ve y actúa sobre un ticket sin perder el contexto del Kanban
 * detrás. Mismo patrón que `BookingDetailSheet` del calendario PMS.
 *
 * Tabs en este sprint W1:
 *   · Detalle — info principal + acciones inline contextuales por estado
 *   · Log — audit trail (append-only, fuente USALI)
 *
 * Tabs aplazados a Mx-1B-W2:
 *   · Fotos (con before/after side-by-side + compresión cliente)
 *   · Comentarios (chat técnico ↔ supervisor)
 *
 * Reglas UX heredadas de Zenix:
 *   · Entrada 360-400ms ease-spring, salida 200-220ms ease-sharp-out (§13b)
 *   · Acciones inline visibles SOLO si aplican al rol+estado actual (H5
 *     prevention — disabled buttons son anti-pattern NN/g 2018)
 *   · Confirmaciones §32 con preview real para verify/reopen/close
 *   · Toast en cada mutación (§33)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  X,
  CheckCircle2,
  XCircle,
  Hand,
  Play,
  RotateCcw,
  CheckSquare,
  Lock,
  History,
  FileText,
  Image as ImageIcon,
  MessageSquare,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useShakeOnInvalid } from '@/hooks/useShakeOnInvalid'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { JwtPayload, MaintenanceTicketLogDto } from '@zenix/shared'
import {
  AGING_PILL_CLASS,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_PILL,
  STATUS_PILL,
  estimateAging,
  formatElapsed,
} from '../utils/maintenance.constants'
import {
  STATUS_LABEL,
  LOG_EVENT_LABEL,
  humanize,
  humanizeLogMetadata,
} from '../utils/humanize'
import {
  useMaintenanceTicket,
  useApproveTicket,
  useRejectTicket,
  useClaimTicket,
  useStartTicket,
  useResolveTicket,
  useVerifyTicket,
  useCloseTicket,
  useReopenTicket,
} from '../hooks/useMaintenanceTickets'
import { PhotoGallery } from './PhotoGallery'
import { CommentsThread } from './CommentsThread'

interface Props {
  ticketId: string | null
  actor: JwtPayload
  onClose: () => void
}

type ConfirmAction =
  | { kind: 'reject'; reason: string }
  | { kind: 'verify-approve' }
  | { kind: 'verify-reject'; reason: string }
  | { kind: 'reopen'; reason: string }
  | { kind: 'close' }
  | { kind: 'resolve'; summary: string }
  | null

export function TicketDetailDrawer({ ticketId, actor, onClose }: Props) {
  const open = !!ticketId
  const { data: ticket, isLoading, error } = useMaintenanceTicket(ticketId)

  // Confirm-step state — todo cambio destructivo pasa por confirmación con
  // preview real (§32). El componente nunca dispara un mutation directo.
  const [confirm, setConfirm] = useState<ConfirmAction>(null)

  // NOTIF-7+13 fix — toast.error cuando la query falla (típicamente 404 porque
  // el ticket fue eliminado o el deep-link expiró). Antes solo se mostraba el
  // banner interno del drawer, que el usuario podía no ver si estaba con foco
  // en otra parte de la pantalla. NN/g H1 (Visibility of system status) +
  // CLAUDE.md §39 (feedback informativo obligatorio). Disparado UNA vez por
  // ticketId para no spamear si el usuario se queda con el drawer abierto.
  const lastErrorToastedTicket = useRef<string | null>(null)
  useEffect(() => {
    if (!error || !ticketId) return
    if (lastErrorToastedTicket.current === ticketId) return
    lastErrorToastedTicket.current = ticketId
    const msg = error instanceof Error ? error.message : 'Ticket no disponible'
    toast.error(`Ticket no se pudo cargar — ${msg}`)
  }, [error, ticketId])

  const isSupervisor = actor.role === 'SUPERVISOR'
  const isAssignee = ticket?.assignedToId === actor.sub
  const isMaintenanceTech =
    actor.department === 'MAINTENANCE' || isSupervisor

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0 h-full max-h-screen"
      >
        <SheetTitle className="sr-only">
          {ticket?.title ?? 'Detalle de ticket'}
        </SheetTitle>

        {/* ── Header — pastel bg + accent bar (mismo lenguaje BookingDetailSheet).
            Color del bg derivado de la prioridad (red-50 / amber-50 / slate-50)
            análogo al verde-pastel del booking IN_HOUSE. Accent bar inferior
            análogo al OTA color del booking. */}
        <header
          className="px-5 pt-5 pb-4 shrink-0"
          style={{
            backgroundColor:
              ticket?.priority === 'CRITICAL' ? 'rgba(239,68,68,0.06)' :
              ticket?.priority === 'HIGH'     ? 'rgba(248,113,113,0.05)' :
              ticket?.priority === 'MEDIUM'   ? 'rgba(245,158,11,0.05)' :
              'rgba(248,250,252,1)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {ticket ? <HeaderContent ticket={ticket} /> : <HeaderSkeleton />}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-slate-500 hover:text-slate-700 p-1 -mr-1 shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Priority accent bar — análogo al OTA stripe del BookingDetailSheet */}
        {ticket && (
          <div
            className="h-[3px] flex-shrink-0"
            style={{ backgroundColor: priorityAccentColor(ticket.priority) }}
          />
        )}

        {/* Error state — antes el drawer se quedaba vacío sin feedback si
            la query fallaba (T-web-1 bug del testing 2026-05-11). */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              No pudimos cargar el ticket
            </h3>
            <p className="text-xs text-slate-600 max-w-xs">
              {error instanceof Error ? error.message : 'Verifica tu conexión y reintenta.'}
            </p>
            <Button size="sm" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )}

        {/* ── Banner Flujo B (esperando aprobación) ───────────────────── */}
        {ticket?.requiresApproval && ticket.pendingApproval && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
            🟡 Esperando aprobación · reportado{' '}
            {ticket.reportedByName ? `por ${ticket.reportedByName} ` : ''}
            hace {formatElapsed(ticket.createdAt)}
          </div>
        )}

        {/* ── Banner CRITICAL bloqueada — icono inline con texto ─ */}
        {ticket?.hasAutoBlock && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800">
            <p className="leading-snug">
              <Lock className="inline-block h-3.5 w-3.5 mr-1.5 -mt-0.5" aria-hidden />
              Habitación fuera de venta · Cerrada en OTAs (Booking, Airbnb, etc.)
              {ticket.estimatedEndAt &&
                (() => {
                  const ag = estimateAging(ticket.estimatedEndAt, ticket.status)
                  return ag ? (
                    <span
                      className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded align-middle ${AGING_PILL_CLASS[ag.color]}`}
                    >
                      {ag.label}
                    </span>
                  ) : null
                })()}
            </p>
          </div>
        )}

        {/* Confirm-step inline (§32 con preview real) — sigue arriba porque
            necesita captura de input antes del flujo de tabs.
            ActionsBar se renderiza al final (sticky footer) — abajo. */}
        {ticket && confirm && (
          <ConfirmPanel
            ticketId={ticket.id}
            roomNumber={ticket.roomNumber}
            confirm={confirm}
            onCancel={() => setConfirm(null)}
            onDone={() => setConfirm(null)}
          />
        )}

        {/* ── Tabs: estilo unificado con BookingDetailSheet.
            Testing T-tab-body-height: cada TabsContent ahora explícitamente
            `flex-1 min-h-0` + el wrapper interno (`<div flex-1 flex-col`)
            permite que el contenido EMPTY-STATE se centre verticalmente y el
            contenido con scroll use todo el espacio.
            ───────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="detail" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-5 pt-4 pb-3 shrink-0">
            <TabsList className="w-full h-10 bg-slate-100 rounded-xl p-1 grid grid-cols-4">
              <DrawerTab value="detail" icon={FileText} label="Detalle" />
              <DrawerTab
                value="photos"
                icon={ImageIcon}
                label="Fotos"
                badge={ticket?.photos.length}
              />
              <DrawerTab
                value="comments"
                icon={MessageSquare}
                label="Chat"
                badge={ticket?.comments.length}
              />
              <DrawerTab value="log" icon={History} label="Audit" />
            </TabsList>
          </div>

          <TabsContent
            value="detail"
            className="flex-1 overflow-y-auto px-5 pb-6 mt-0 min-h-0 data-[state=inactive]:hidden"
          >
            {isLoading ? (
              <DetailSkeleton />
            ) : error ? (
              <div className="py-10 text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-200 mb-3">
                  <XCircle className="h-7 w-7 text-red-500" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">
                  No pudimos cargar el ticket
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                  {(error as Error)?.message ?? 'Error de red. Intenta cerrar y volver a abrir.'}
                </p>
              </div>
            ) : (
              ticket && <DetailBody ticket={ticket} />
            )}
          </TabsContent>

          <TabsContent
            value="photos"
            className="flex-1 overflow-y-auto px-5 pb-6 mt-0 min-h-0 data-[state=inactive]:hidden"
          >
            {ticket && (
              <PhotoGallery
                ticketId={ticket.id}
                photos={ticket.photos}
                suggestAfterPhoto={ticket.status === 'IN_PROGRESS' || ticket.status === 'RESOLVED'}
                actor={actor}
              />
            )}
          </TabsContent>

          <TabsContent
            value="comments"
            className="flex-1 overflow-hidden px-5 pb-6 pt-1 mt-0 flex flex-col min-h-0 data-[state=inactive]:hidden"
          >
            {ticket && (
              <CommentsThread
                ticketId={ticket.id}
                comments={ticket.comments}
                currentUserId={actor.sub}
              />
            )}
          </TabsContent>

          <TabsContent
            value="log"
            className="flex-1 overflow-y-auto px-5 pb-6 mt-0 min-h-0 data-[state=inactive]:hidden"
          >
            {ticket && <LogList logs={ticket.logs} />}
          </TabsContent>
        </Tabs>

        {/* Footer fijo — mismo patrón que BookingDetailSheet ("Mover hab." /
            "Salida anticipada"). Ley de Fitts: acciones primarias en thumb
            zone bottom. Apple HIG 2024: "primary actions live at the bottom
            of side sheets". El ActionsBar genera 0..N botones según el rol
            y estado del ticket; cuando no hay acciones, no renderiza. */}
        {ticket && !confirm && (
          <ActionsBar
            ticket={ticket}
            isSupervisor={isSupervisor}
            isAssignee={isAssignee}
            isMaintenanceTech={isMaintenanceTech}
            onAction={setConfirm}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function HeaderContent({
  ticket,
}: {
  ticket: NonNullable<ReturnType<typeof useMaintenanceTicket>['data']>
}) {
  // Header refactor 2026-05-13 — adopta lenguaje visual del BookingDetailSheet
  // (decisión del usuario: estandarizar slides laterales). Patrón:
  //   · Título grande arriba (text-lg semibold)
  //   · 2 pills inline: status (analog "Alojado") + priority (analog OTA)
  //   · Subtítulo: ubicación · timestamp relativo
  return (
    <>
      {/* Título — text-lg igual que el BookingDetailSheet "Pedro & Carmen Vega" */}
      <h2 className="text-lg font-semibold text-slate-900 leading-tight tracking-tight">
        {ticket.title}
      </h2>

      {/* Subtítulo — ubicación + tiempo, igual que el subtítulo del booking */}
      <p className="mt-1 text-xs text-slate-600">
        {ticket.roomNumber
          ? `Hab. ${ticket.roomNumber}`
          : ticket.assetTag
          ? ticket.assetTag
          : 'Área general'}
        {' · '}
        {format(parseISO(ticket.createdAt), "d MMM yyyy", { locale: es })}
      </p>

      {/* Pills: status + priority. Mismo size/shape que los pills del booking
          ("Alojado" / "Hostelworld"). Status pill es informativo (slate/azul/
          morado/verde según estado). Priority es semántico (rojo/amber/slate). */}
      <div className="flex items-center gap-2 flex-wrap mt-2.5">
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            STATUS_PILL[ticket.status]
          }`}
        >
          {STATUS_LABEL[ticket.status]}
        </span>
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            PRIORITY_PILL[ticket.priority]
          }`}
        >
          {PRIORITY_LABEL[ticket.priority]}
        </span>
      </div>
    </>
  )
}

/**
 * Color del accent bar bajo el header — igual semántica que el OTA color en
 * el BookingDetailSheet. Refleja la prioridad: CRITICAL=red, HIGH=red soft,
 * MEDIUM=amber, LOW=slate. Apple HIG: el accent bar es signal primario
 * pre-attentive (Treisman 1980).
 */
function priorityAccentColor(priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): string {
  switch (priority) {
    case 'CRITICAL': return '#dc2626'  // red-600
    case 'HIGH':     return '#f87171'  // red-400
    case 'MEDIUM':   return '#f59e0b'  // amber-500
    case 'LOW':      return '#cbd5e1'  // slate-300
  }
}

/**
 * DrawerTab — refactor Mx-1B-W2.
 * Antes: cada TabsTrigger repetía el mismo cn() de 4 líneas. Extraer a un
 * componente eliminación duplicación + facilita agregar badge de count.
 * Mismo styling unificado con BookingDetailSheet (§13 CLAUDE.md).
 */
function DrawerTab({
  value,
  icon: Icon,
  label,
  badge,
}: {
  value: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: number
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1',
        'text-slate-500',
        'data-[state=active]:bg-white data-[state=active]:shadow-sm',
        'data-[state=active]:text-slate-900 data-[state=active]:font-semibold',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-0.5 text-[9px] font-semibold bg-slate-300/70 text-slate-700 rounded-full min-w-[16px] px-1 leading-[14px]">
          {badge}
        </span>
      )}
    </TabsTrigger>
  )
}

function HeaderSkeleton() {
  return (
    <>
      <Skeleton className="h-3 w-32 mb-2" />
      <Skeleton className="h-5 w-48 mb-1" />
      <Skeleton className="h-3 w-24" />
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-3 mt-4">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

function DetailBody({
  ticket,
}: {
  ticket: NonNullable<ReturnType<typeof useMaintenanceTicket>['data']>
}) {
  // Apple HIG sections: 24pt gap between groups (was 16pt — felt apretado).
  return (
    <div className="space-y-6 text-sm pt-1">
      {ticket.description && (
        <Section label="Descripción">
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </p>
        </Section>
      )}

      {ticket.guestImpact && (
        <Section label="Impacto al huésped" tone="warning">
          <p className="text-amber-900 text-sm leading-relaxed">{ticket.guestImpact}</p>
        </Section>
      )}

      <Section label="Asignación y tiempo">
        <KeyValue
          label="Reportado por"
          value={ticket.reportedByName ?? '—'}
        />
        <KeyValue
          label="Asignado a"
          value={ticket.assignedToName ?? 'Sin asignar (en cola)'}
        />
        <KeyValue
          label="Inicio"
          value={format(parseISO(ticket.createdAt), "d MMM 'a las' HH:mm", { locale: es })}
        />
        {ticket.estimatedEndAt && (
          <KeyValue
            label="Fin estimado"
            value={format(parseISO(ticket.estimatedEndAt), "d MMM 'a las' HH:mm", { locale: es })}
          />
        )}
        {ticket.estimatedMinutes != null && (
          <KeyValue
            label="Estimación de trabajo"
            value={`${ticket.estimatedMinutes} min`}
          />
        )}
        {ticket.actualMinutes != null && (
          <KeyValue
            label="Tiempo real"
            value={`${ticket.actualMinutes} min`}
          />
        )}
      </Section>

      {ticket.rejectedReason && (
        <Section label="Razón de rechazo" tone="danger">
          <p className="text-red-800 text-sm leading-relaxed">{ticket.rejectedReason}</p>
        </Section>
      )}

      {/* Fotos + Comentarios viven ahora en sus propios tabs (Mx-1B-W2).
          Aquí solo mostramos hint si hay contenido relacionado. */}
      <Section label="Evidencia y conversación">
        <div className="text-xs text-slate-600 space-y-1">
          <p>
            {ticket.photos.length === 0
              ? 'Sin fotos.'
              : `${ticket.photos.length} foto${ticket.photos.length === 1 ? '' : 's'} adjunta${ticket.photos.length === 1 ? '' : 's'}`}
            {' · '}
            {ticket.comments.length === 0
              ? 'sin comentarios'
              : `${ticket.comments.length} comentario${ticket.comments.length === 1 ? '' : 's'}`}
            .
          </p>
          <p className="text-slate-400 text-[10px]">
            Ve a las pestañas <strong>Fotos</strong> o <strong>Chat</strong> para gestionar.
          </p>
        </div>
      </Section>
    </div>
  )
}

function LogList({ logs }: { logs: MaintenanceTicketLogDto[] }) {
  if (logs.length === 0) {
    // Empty state que fills el panel — Apple HIG pattern, consistencia con PhotoGallery
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8 min-h-[200px]">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <History className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">Sin eventos aún</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          Cada cambio en este ticket queda registrado aquí con su autor y momento.
        </p>
      </div>
    )
  }
  return (
    <ol className="space-y-4 pt-3 pb-2 border-l-2 border-slate-200 pl-4">
      {logs.map((l) => {
        const metaLines = humanizeLogMetadata(l.metadata)
        return (
          <li key={l.id} className="text-xs relative">
            <div className="absolute -ml-[21px] mt-0.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white" />
            <div className="font-semibold text-slate-700">{logEventLabel(l.event)}</div>
            <div className="text-[10px] text-slate-500">
              {l.staffName ?? 'Sistema'} ·{' '}
              {format(parseISO(l.createdAt), "d MMM HH:mm:ss", { locale: es })}
            </div>
            {metaLines.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {metaLines.map((line, i) => (
                  <li key={i} className="text-[10px] text-slate-500 leading-snug">
                    <span className="text-slate-400 mr-1">·</span>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const LOG_EMOJI: Partial<Record<MaintenanceTicketLogDto['event'], string>> = {
  CREATED: '🆕',
  APPROVED: '✅',
  REJECTED: '❌',
  QUEUED: '📥',
  CLAIMED: '✋',
  ASSIGNED: '👤',
  AUTO_ASSIGNED: '🤖',
  ACKNOWLEDGED: '👁',
  STARTED: '▶',
  WAITING_PARTS: '⏸',
  RESOLVED: '✅',
  VERIFIED: '✓',
  CLOSED: '🗄',
  REOPENED: '🔄',
  COMMENT_ADDED: '💬',
  PHOTO_ADDED: '📷',
  BLOCK_AUTO_CREATED: '🔒',
  BLOCK_AUTO_RELEASED: '🔓',
  SLA_BREACH: '⏰',
}

function logEventLabel(ev: MaintenanceTicketLogDto['event']): string {
  const map: Partial<Record<MaintenanceTicketLogDto['event'], string>> = {
    CREATED: '🆕 Ticket creado',
    APPROVED: '✅ Aprobado',
    REJECTED: '❌ Rechazado',
    QUEUED: '📥 Entró a cola',
    CLAIMED: '✋ Tomado voluntariamente',
    ASSIGNED: '👤 Asignado',
    AUTO_ASSIGNED: '🤖 Auto-asignado',
    ACKNOWLEDGED: '👁 Visto',
    STARTED: '▶ Trabajo iniciado',
    WAITING_PARTS: '⏸ Esperando refacciones',
    RESOLVED: '✅ Resuelto',
    VERIFIED: '✓ Verificado',
    CLOSED: '🗄 Cerrado',
    REOPENED: '🔄 Reabierto',
    COMMENT_ADDED: '💬 Comentario añadido',
    PHOTO_ADDED: '📷 Foto añadida',
    BLOCK_AUTO_CREATED: '🔒 Habitación bloqueada',
    BLOCK_AUTO_RELEASED: '🔓 Habitación liberada',
    SLA_BREACH: '⏰ Tiempo excedido',
  }
  return map[ev] ?? ev
}

/**
 * Section card — refactor 2026-05-13. Adopta el patrón del BookingDetailSheet:
 *   · Label uppercase tracking-wider (igual que "CHECK-IN", "HABITACIÓN", etc.)
 *   · Contenido dentro de card bg-slate-50/60 rounded-xl con padding generoso
 *   · Apple HIG: agrupación visual por afinidad (Gestalt proximidad)
 */
function Section({
  label,
  children,
  tone = 'default',
}: {
  label: string
  children: React.ReactNode
  /** 'default' = slate · 'warning' = amber (note) · 'danger' = red (rejection) */
  tone?: 'default' | 'warning' | 'danger'
}) {
  const cardClass =
    tone === 'warning'
      ? 'bg-amber-50 border border-amber-200'
      : tone === 'danger'
      ? 'bg-red-50 border border-red-200'
      : 'bg-slate-50 border border-slate-100'
  const labelClass =
    tone === 'warning'
      ? 'text-amber-700'
      : tone === 'danger'
      ? 'text-red-700'
      : 'text-slate-500'
  return (
    <section>
      <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>
        {label}
      </h3>
      <div className={`${cardClass} rounded-xl p-4`}>{children}</div>
    </section>
  )
}

/**
 * KeyValue — variant matching BookingDetailSheet grid de quick-stats.
 * Renderizado como bloque vertical (label arriba pequeño · value abajo grande)
 * para mejor jerarquía visual al escanear (Apple HIG 2024 Typography Hierarchy).
 */
function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2 text-sm border-b border-slate-200/60 last:border-b-0">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value}</span>
    </div>
  )
}

// ─── Action bar — H5 (mostrar SOLO acciones aplicables) ─────────────────
// Idempotentes (claim/start/resume/parts/approve) disparan mutación directa.
// Destructivas (reject/verify-reject/reopen/close/resolve) van al confirm panel §32.

function ActionsBar({
  ticket,
  isSupervisor,
  isAssignee,
  isMaintenanceTech,
  onAction,
}: {
  ticket: NonNullable<ReturnType<typeof useMaintenanceTicket>['data']>
  isSupervisor: boolean
  isAssignee: boolean
  isMaintenanceTech: boolean
  onAction: (a: ConfirmAction) => void
}) {
  const approve = useApproveTicket(ticket.id)
  const claim = useClaimTicket(ticket.id)
  const start = useStartTicket(ticket.id)

  type Action = {
    key: string
    label: string
    icon: any
    primary?: boolean
    tone?: 'destructive' | 'default' | 'positive'
    onClick: () => void
    pending?: boolean
  }
  const actions: Action[] = []

  // Flujo B — supervisor decide. Testing T-approve-flow:
  // Si no hay assignedToId en el ticket aún, el ticket entra a la COLA
  // (cualquier técnico lo puede tomar). Si quieres asignar a alguien
  // específico, usa el botón "Asignar a…" (TODO: dialog en Mx-1B-W3).
  // Label refleja la realidad: "Aprobar y enviar a cola" → claro qué pasa.
  if (isSupervisor && ticket.requiresApproval && ticket.pendingApproval) {
    actions.push({
      key: 'approve',
      label: ticket.assignedToId ? 'Aprobar y asignar' : 'Aprobar · enviar a cola',
      icon: CheckCircle2,
      primary: true,
      tone: 'positive',
      onClick: () => approve.mutate({ assignedToId: ticket.assignedToId ?? undefined }),
      pending: approve.isPending,
    })
    actions.push({
      key: 'reject',
      label: 'Rechazar',
      icon: XCircle,
      tone: 'destructive',
      onClick: () => onAction({ kind: 'reject', reason: '' }),
    })
  }

  // Cola — técnico toma voluntariamente
  if (
    isMaintenanceTech &&
    ticket.status === 'OPEN' &&
    !ticket.assignedToId &&
    !ticket.pendingApproval
  ) {
    actions.push({
      key: 'claim',
      label: 'Tomar este ticket',
      icon: Hand,
      primary: true,
      tone: 'positive',
      onClick: () => claim.mutate(),
      pending: claim.isPending,
    })
  }

  // Técnico asignado avanza estado
  if (isAssignee && ticket.status === 'ACKNOWLEDGED') {
    actions.push({
      key: 'start',
      label: 'Iniciar trabajo',
      icon: Play,
      primary: true,
      tone: 'positive',
      onClick: () => start.mutate(),
      pending: start.isPending,
    })
  }
  if (isAssignee && ticket.status === 'IN_PROGRESS') {
    actions.push({
      key: 'resolve',
      label: 'Marcar resuelto',
      icon: CheckSquare,
      primary: true,
      tone: 'positive',
      onClick: () => onAction({ kind: 'resolve', summary: '' }),
    })
  }

  // Verificación supervisor. Labels cortos para que ambos botones quepan
  // en una sola línea (testing T-buttons-row). La explicación completa
  // vive en el ConfirmPanel description.
  if (isSupervisor && ticket.status === 'RESOLVED') {
    actions.push({
      key: 'verify',
      label: 'Verificar',
      icon: CheckCircle2,
      primary: true,
      tone: 'positive',
      onClick: () => onAction({ kind: 'verify-approve' }),
    })
    actions.push({
      key: 'verify-reject',
      label: 'Rechazar calidad',
      icon: RotateCcw,
      tone: 'destructive',
      onClick: () => onAction({ kind: 'verify-reject', reason: '' }),
    })
  }

  // Cerrar / reabrir
  if (isSupervisor && ticket.status === 'VERIFIED') {
    actions.push({
      key: 'close',
      label: 'Cerrar y archivar',
      icon: CheckSquare,
      primary: true,
      onClick: () => onAction({ kind: 'close' }),
    })
  }
  if (isSupervisor && ['VERIFIED', 'CLOSED'].includes(ticket.status)) {
    actions.push({
      key: 'reopen',
      label: 'Reabrir',
      icon: RotateCcw,
      onClick: () => onAction({ kind: 'reopen', reason: '' }),
    })
  }

  if (actions.length === 0) return null

  // Testing T-buttons-row: 2 actions → grid 50/50 (mismo width, mismo row).
  // 1 action → full width. 3+ actions → flex wrap (raro pero por si acaso).
  const layoutClass =
    actions.length === 2
      ? 'grid grid-cols-2 gap-2'
      : actions.length === 1
      ? 'flex'
      : 'flex flex-wrap gap-2'

  // Footer styling — alineado con BookingDetailSheet:
  //   · border-t en lugar de border-b (ahora vive abajo)
  //   · bg-white para contraste con tabs scrollables
  //   · padding generoso (px-5 py-4) — Apple HIG: primary actions deserve respiración
  //   · shrink-0 para que no colapse cuando el contenido de tabs hace scroll
  return (
    <div className={`px-5 py-4 border-t border-slate-200 bg-white shrink-0 ${layoutClass}`}>
      {actions.map((a) => {
        const Icon = a.icon
        return (
          <Button
            key={a.key}
            type="button"
            size="default"
            variant={a.primary ? 'default' : 'outline'}
            disabled={!!a.pending}
            className={`w-full h-10 ${
              a.tone === 'destructive'
                ? 'border-red-200 text-red-700 hover:bg-red-50'
                : a.tone === 'positive' && a.primary
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : ''
            }`}
            onClick={a.onClick}
          >
            <Icon className="h-4 w-4 mr-1.5" />
            {a.pending ? 'Procesando…' : a.label}
          </Button>
        )
      })}
    </div>
  )
}

// ─── Confirm panel inline (§32 con preview real) ────────────────────────

function ConfirmPanel({
  ticketId,
  roomNumber,
  confirm,
  onCancel,
  onDone,
}: {
  ticketId: string
  roomNumber: string | null
  confirm: NonNullable<ConfirmAction>
  onCancel: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState(
    'reason' in confirm ? confirm.reason : '',
  )
  const [summary, setSummary] = useState(
    'summary' in confirm ? confirm.summary : '',
  )
  const verify = useVerifyTicket(ticketId)
  const reopen = useReopenTicket(ticketId)
  const close = useCloseTicket(ticketId)
  const reject = useRejectTicket(ticketId)
  const resolve = useResolveTicket(ticketId)

  const config = {
    'verify-approve': {
      title: 'Verificar resolución',
      description: roomNumber
        ? `Al verificar, la habitación ${roomNumber} regresa a estar disponible para venta. Channex será notificado para reabrir disponibilidad en OTAs.`
        : 'Al verificar, el ticket pasa a VERIFIED y queda listo para cerrar.',
      action: 'Verificar',
      tone: 'positive' as const,
      requiresReason: false,
      onConfirm: () => verify.mutateAsync({ approved: true }).then(onDone),
      pending: verify.isPending,
    },
    'verify-reject': {
      title: 'Rechazar calidad',
      description:
        'El ticket regresará al técnico para que retome el trabajo. Recibirá una notificación con tu razón. La habitación sigue bloqueada hasta una nueva verificación exitosa.',
      action: 'Rechazar calidad',
      tone: 'destructive' as const,
      requiresReason: true,
      onConfirm: () =>
        verify
          .mutateAsync({ approved: false, rejectionReason: reason })
          .then(onDone),
      pending: verify.isPending,
    },
    reopen: {
      title: 'Reabrir ticket',
      description:
        'El ticket volverá a estar en progreso. Si era de prioridad crítica en una habitación con huésped activo, el sistema bloqueará la operación y tendrás que coordinar reubicación.',
      action: 'Reabrir',
      tone: 'destructive' as const,
      requiresReason: true,
      onConfirm: () => reopen.mutateAsync({ reason }).then(onDone),
      pending: reopen.isPending,
    },
    reject: {
      title: 'Rechazar reporte',
      description:
        'El ticket cerrará con tu razón. El reportador será notificado.',
      action: 'Rechazar',
      tone: 'destructive' as const,
      requiresReason: true,
      onConfirm: () => reject.mutateAsync({ reason }).then(onDone),
      pending: reject.isPending,
    },
    close: {
      title: 'Cerrar y archivar',
      description: 'El ticket pasa a histórico read-only. Podrás reabrirlo si es necesario.',
      action: 'Cerrar',
      tone: 'default' as const,
      requiresReason: false,
      onConfirm: () => close.mutateAsync().then(onDone),
      pending: close.isPending,
    },
    resolve: {
      title: 'Marcar resuelto',
      description:
        'El ticket pasa a RESOLVED. El supervisor verificará la calidad.',
      action: 'Marcar resuelto',
      tone: 'positive' as const,
      requiresReason: false,
      requiresSummary: true,
      onConfirm: () =>
        resolve.mutateAsync({ resolutionSummary: summary }).then(onDone),
      pending: resolve.isPending,
    },
  } as const

  const c = config[confirm.kind as keyof typeof config]
  // §60 D19: NO disabled para validar. Botón siempre activo (excepto isPending).
  // Validate-on-click → shake + error inline.
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const { shakeClass: reasonShake, trigger: triggerReasonShake } = useShakeOnInvalid()
  const { shakeClass: summaryShake, trigger: triggerSummaryShake } = useShakeOnInvalid()

  function handleConfirm() {
    let invalid = false
    if (c.requiresReason && reason.trim().length < 5) {
      setReasonError('Escribe al menos 5 caracteres.')
      triggerReasonShake()
      invalid = true
    }
    if ('requiresSummary' in c && c.requiresSummary && summary.trim().length < 5) {
      setSummaryError('Describe la resolución en al menos 5 caracteres.')
      triggerSummaryShake()
      invalid = true
    }
    if (invalid) return
    setReasonError(null)
    setSummaryError(null)
    c.onConfirm()
  }

  return (
    <div className="px-5 py-4 border-b border-slate-200 bg-amber-50/40 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
        <p className="mt-1 text-xs text-slate-700 leading-relaxed">
          {c.description}
        </p>
      </div>

      {c.requiresReason && (
        <div>
          {/* §60 D19: shake wrapper · sin hint persistente · error solo al submit */}
          <div className={reasonShake}>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(null)
              }}
              placeholder="Razón…"
              className={`w-full text-xs border rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                reasonError ? 'border-red-400' : 'border-slate-300'
              }`}
              rows={3}
              autoFocus
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px]">
            <span className="text-red-600">{reasonError ?? ''}</span>
            <span className="text-slate-400">{reason.length}/300</span>
          </div>
        </div>
      )}
      {'requiresSummary' in c && c.requiresSummary && (
        <div>
          <div className={summaryShake}>
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value)
                if (summaryError) setSummaryError(null)
              }}
              placeholder="Resumen de la resolución…"
              className={`w-full text-xs border rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                summaryError ? 'border-red-400' : 'border-slate-300'
              }`}
              rows={3}
              autoFocus
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px]">
            <span className="text-red-600">{summaryError ?? ''}</span>
            <span className="text-slate-400">{summary.length}/300</span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={c.pending}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={c.pending}
          onClick={handleConfirm}
          className={
            c.tone === 'destructive'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : c.tone === 'positive'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : ''
          }
        >
          {c.pending ? 'Procesando…' : c.action}
        </Button>
      </div>
    </div>
  )
}
