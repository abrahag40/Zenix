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
import { useMemo, useState } from 'react'
import {
  X,
  CheckCircle2,
  XCircle,
  Hand,
  Play,
  PauseCircle,
  RotateCcw,
  CheckSquare,
  Lock,
  ExternalLink,
  History,
  FileText,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import type { JwtPayload, MaintenanceTicketLogDto } from '@zenix/shared'
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_PILL,
  formatElapsed,
} from '../utils/maintenance.constants'
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
  const { data: ticket, isLoading } = useMaintenanceTicket(ticketId)

  // Confirm-step state — todo cambio destructivo pasa por confirmación con
  // preview real (§32). El componente nunca dispara un mutation directo.
  const [confirm, setConfirm] = useState<ConfirmAction>(null)

  const isSupervisor = actor.role === 'SUPERVISOR'
  const isAssignee = ticket?.assignedToId === actor.sub
  const isMaintenanceTech =
    actor.department === 'MAINTENANCE' || isSupervisor

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0"
      >
        <SheetTitle className="sr-only">
          {ticket?.title ?? 'Detalle de ticket'}
        </SheetTitle>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="px-5 pt-4 pb-3 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {ticket ? <HeaderContent ticket={ticket} /> : <HeaderSkeleton />}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-slate-500 hover:text-slate-700 p-1 -mr-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ── Banner Flujo B (esperando aprobación) ───────────────────── */}
        {ticket?.requiresApproval && ticket.pendingApproval && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
            🟡 Esperando aprobación · reportado{' '}
            {ticket.reportedByName ? `por ${ticket.reportedByName} ` : ''}
            hace {formatElapsed(ticket.createdAt)}
          </div>
        )}

        {/* ── Banner CRITICAL bloqueada ───────────────────────────────── */}
        {ticket?.hasAutoBlock && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800 inline-flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Habitación bloqueada automáticamente · Channex notificado
          </div>
        )}

        {/* ── Acciones inline contextuales (H5 prevention) ────────────── */}
        {ticket && !confirm && (
          <ActionsBar
            ticket={ticket}
            isSupervisor={isSupervisor}
            isAssignee={isAssignee}
            isMaintenanceTech={isMaintenanceTech}
            onAction={setConfirm}
          />
        )}

        {/* ── Confirm-step inline (§32 con preview real) ──────────────── */}
        {ticket && confirm && (
          <ConfirmPanel
            ticketId={ticket.id}
            roomNumber={ticket.roomNumber}
            confirm={confirm}
            onCancel={() => setConfirm(null)}
            onDone={() => setConfirm(null)}
          />
        )}

        {/* ── Tabs: Detalle | Log ──────────────────────────────────────── */}
        <Tabs defaultValue="detail" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-5 my-3 grid grid-cols-2 w-fit">
            <TabsTrigger value="detail" className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Detalle
            </TabsTrigger>
            <TabsTrigger value="log" className="text-xs">
              <History className="h-3.5 w-3.5 mr-1.5" /> Log
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="detail"
            className="flex-1 overflow-y-auto px-5 pb-5 mt-0"
          >
            {isLoading ? <DetailSkeleton /> : ticket && <DetailBody ticket={ticket} />}
          </TabsContent>

          <TabsContent
            value="log"
            className="flex-1 overflow-y-auto px-5 pb-5 mt-0"
          >
            {ticket && <LogList logs={ticket.logs} />}
          </TabsContent>
        </Tabs>
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
  const Icon = CATEGORY_ICON[ticket.category]
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            PRIORITY_PILL[ticket.priority]
          }`}
        >
          {PRIORITY_LABEL[ticket.priority]}
        </span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
          <Icon className="h-3 w-3" aria-hidden />
          {CATEGORY_LABEL[ticket.category]}
        </span>
      </div>
      <h2 className="mt-1 text-base font-semibold text-slate-900 leading-snug">
        {ticket.title}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {ticket.roomNumber
          ? `Hab. ${ticket.roomNumber}`
          : ticket.assetTag
          ? `🔧 ${ticket.assetTag}`
          : '📍 Área general'}
        {' · '}
        {format(parseISO(ticket.createdAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
      </p>
    </>
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
  return (
    <div className="space-y-4 text-sm">
      {ticket.description && (
        <Section label="Descripción">
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </p>
        </Section>
      )}

      {ticket.guestImpact && (
        <Section label="Impacto al huésped">
          <p className="text-slate-700">{ticket.guestImpact}</p>
        </Section>
      )}

      <Section label="Asignación">
        <KeyValue
          label="Reportado por"
          value={ticket.reportedByName ?? '—'}
        />
        <KeyValue
          label="Asignado a"
          value={ticket.assignedToName ?? 'Sin asignar (en cola)'}
        />
        {ticket.estimatedMinutes != null && (
          <KeyValue
            label="Estimación"
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
        <Section label="Razón de rechazo">
          <p className="text-red-700">{ticket.rejectedReason}</p>
        </Section>
      )}

      <Section label="Fotos">
        {ticket.photos.length === 0 ? (
          <p className="text-xs text-slate-400">
            Sin fotos. (Disponible al subir en Mx-1B-W2)
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {ticket.photos.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-slate-200 hover:opacity-80"
              >
                <img
                  src={p.url}
                  alt={p.caption ?? ''}
                  className="w-full h-28 object-cover"
                />
                <div className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50">
                  {p.isAfterPhoto ? '✓ Después' : 'Antes'}
                </div>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section label="Comentarios">
        {ticket.comments.length === 0 ? (
          <p className="text-xs text-slate-400">
            Sin comentarios. (Composer en Mx-1B-W2)
          </p>
        ) : (
          <ul className="space-y-2">
            {ticket.comments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"
              >
                <div className="text-[10px] text-slate-400 mb-0.5">
                  {c.authorName} ·{' '}
                  {format(parseISO(c.createdAt), 'd MMM HH:mm', { locale: es })}
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.content}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function LogList({ logs }: { logs: MaintenanceTicketLogDto[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-slate-400 mt-3">Sin eventos.</p>
  }
  return (
    <ol className="space-y-3 mt-3 border-l-2 border-slate-200 pl-4">
      {logs.map((l) => (
        <li key={l.id} className="text-xs">
          <div className="absolute -ml-[21px] mt-0.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-2 ring-white" />
          <div className="font-semibold text-slate-700">{logEventLabel(l.event)}</div>
          <div className="text-[10px] text-slate-500">
            {l.staffName ?? 'Sistema'} ·{' '}
            {format(parseISO(l.createdAt), "d MMM HH:mm:ss", { locale: es })}
          </div>
          {l.metadata && Object.keys(l.metadata).length > 0 && (
            <pre className="mt-0.5 text-[10px] text-slate-400 whitespace-pre-wrap font-mono">
              {JSON.stringify(l.metadata, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  )
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
    SLA_BREACH: '⏰ SLA vencido',
  }
  return map[ev] ?? ev
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </h3>
      <div>{children}</div>
    </section>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs border-b border-slate-100 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value}</span>
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

  // Flujo B — supervisor decide
  if (isSupervisor && ticket.requiresApproval && ticket.pendingApproval) {
    actions.push({
      key: 'approve',
      label: 'Aprobar y asignar',
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

  // Verificación supervisor
  if (isSupervisor && ticket.status === 'RESOLVED') {
    actions.push({
      key: 'verify',
      label: 'Verificar — habitación a venta',
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

  return (
    <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap gap-2">
      {actions.map((a) => {
        const Icon = a.icon
        return (
          <Button
            key={a.key}
            type="button"
            size="sm"
            variant={a.primary ? 'default' : 'outline'}
            disabled={!!a.pending}
            className={
              a.tone === 'destructive'
                ? 'border-red-200 text-red-700 hover:bg-red-50'
                : a.tone === 'positive' && a.primary
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : ''
            }
            onClick={a.onClick}
          >
            <Icon className="h-3.5 w-3.5 mr-1.5" />
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
        'El ticket regresará a IN_PROGRESS. El técnico recibirá una notificación con la razón. La habitación sigue bloqueada hasta una nueva verificación exitosa.',
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
        'El ticket regresará a IN_PROGRESS. Si era CRITICAL en habitación con huésped activo, el sistema bloqueará la operación y deberás coordinar reubicación.',
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
  const reasonOk = !c.requiresReason || reason.trim().length >= 5
  const summaryOk = !('requiresSummary' in c && c.requiresSummary) || summary.trim().length >= 5
  const canConfirm = reasonOk && summaryOk && !c.pending

  return (
    <div className="px-5 py-4 border-b border-slate-200 bg-amber-50/40 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
        <p className="mt-1 text-xs text-slate-700 leading-relaxed">
          {c.description}
        </p>
      </div>

      {c.requiresReason && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Razón (mínimo 5 caracteres)…"
          className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={3}
          autoFocus
        />
      )}
      {'requiresSummary' in c && c.requiresSummary && (
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Resumen de la resolución…"
          className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={3}
          autoFocus
        />
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
          disabled={!canConfirm}
          onClick={c.onConfirm}
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
