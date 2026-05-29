/**
 * NovaBillingApprovalsPage — queue de discount approvals pendientes.
 *
 * Sprint DISCOUNT-APPROVAL-UI (2026-05-29). Resuelve el caso reportado
 * en CLAUDE.md §Plan v1.0.0 #2: cuando un consultor aplica un template
 * que excede su tier cap, el backend marca `discountStatus='pending_approval'`
 * y crea AppNotification ACTION_REQUIRED al PARTNER_ADMIN — pero hasta hoy
 * NO existía UI para cerrar el loop. Subscriptions quedaban colgadas.
 *
 * Ruta: /nova/billing/aprobaciones (PARTNER_ADMIN + PLATFORM_ADMIN only —
 * NovaTiersGuard valida en backend; PARTNER_MEMBER → 403).
 *
 * UX:
 *   · Lista en cards verticales — datos del request + contexto comercial
 *     suficiente para decisión informada sin abrir el cliente.
 *   · Botón [Aprobar] dispara approve inmediato (sin confirmación bloqueante).
 *   · Botón [Rechazar] abre dialog con razón ≥10 chars (audit trail).
 *   · Toast feedback inmediato + invalidate queries del bell + lista.
 *   · Empty state celebratorio cuando 0 pendientes.
 *
 * Pattern Salesforce CPQ Approval Inbox + Apple HIG (paritarios + reversible
 * via revert ... aunque revert NO es parte de este sprint).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  Check,
  X,
  ArrowLeft,
  Calendar,
  Mail,
  Building2,
  Percent,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { NovaShell } from '../NovaShell'
import {
  Surface,
  Headline,
  Title,
  Body,
  Caption,
  Eyebrow,
  Chip,
  Button,
} from '../design-system'
import {
  billingClient,
  type DiscountApprovalRequest,
} from '../api/billing-client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────

export function NovaBillingApprovalsPage() {
  const qc = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<DiscountApprovalRequest | null>(null)

  const { data: approvals = [], isLoading, isError } = useQuery<DiscountApprovalRequest[]>({
    queryKey: ['billing', 'approvals'],
    queryFn: billingClient.listPendingApprovals,
    // refresh moderado — el bell ya notifica push de cambios nuevos
    refetchInterval: 60_000,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => billingClient.approveDiscount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'approvals'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Descuento aprobado')
    },
    onError: (err: Error) => toast.error(err.message || 'No se pudo aprobar'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      billingClient.rejectDiscount(id, { rejectionReason: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'approvals'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Descuento rechazado')
      setRejectTarget(null)
    },
    onError: (err: Error) => toast.error(err.message || 'No se pudo rechazar'),
  })

  return (
    <NovaShell title="Aprobaciones pendientes">
      <div className="space-y-5">
        <Link
          to="/nova/billing"
          className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Billing
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <Eyebrow>Discount approvals</Eyebrow>
            <Headline className="mt-1">Aprobaciones pendientes</Headline>
            <Body className="mt-1.5 max-w-2xl">
              Cuando un consultor aplica un código que excede el cap de su tier,
              queda aquí para tu decisión. Aprobar propaga el descuento a Stripe;
              rechazar congela el flujo y notifica al consultor.
            </Body>
          </div>
          {approvals.length > 0 && (
            <Chip variant="warning" className="shrink-0">
              {approvals.length} pendiente{approvals.length !== 1 ? 's' : ''}
            </Chip>
          )}
        </div>

        {/* Content */}
        {isLoading && (
          <Surface variant="raised" radius="lg" padding="lg">
            <Body>Cargando aprobaciones…</Body>
          </Surface>
        )}

        {isError && (
          <Surface variant="raised" radius="lg" padding="lg" tone="warning">
            <Title>No se pudieron cargar las aprobaciones</Title>
            <Body className="mt-1">
              Revisa tu conexión. Si el problema persiste, contacta soporte.
            </Body>
          </Surface>
        )}

        {!isLoading && !isError && approvals.length === 0 && (
          <Surface variant="raised" radius="lg" padding="lg" className="text-center py-10">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <Title>Todo al día</Title>
            <Body className="mt-1 max-w-md mx-auto">
              No hay descuentos esperando tu decisión. Cuando alguno de tus
              consultores escale uno fuera de cap, aparecerá aquí.
            </Body>
          </Surface>
        )}

        {!isLoading && !isError && approvals.length > 0 && (
          <div className="space-y-3">
            {approvals.map((req) => (
              <ApprovalCard
                key={req.id}
                request={req}
                onApprove={() => approveMutation.mutate(req.id)}
                onReject={() => setRejectTarget(req)}
                isApproving={approveMutation.isPending && approveMutation.variables === req.id}
                isRejecting={
                  rejectMutation.isPending && rejectMutation.variables?.id === req.id
                }
              />
            ))}
          </div>
        )}
      </div>

      <RejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={(reason) =>
          rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason })
        }
        isPending={rejectMutation.isPending}
      />
    </NovaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// ApprovalCard — card individual con datos enriquecidos + acciones
// ─────────────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  request: DiscountApprovalRequest
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}

function ApprovalCard({ request, onApprove, onReject, isApproving, isRejecting }: ApprovalCardProps) {
  const created = new Date(request.createdAt)
  const expires = new Date(request.expiresAt)
  const expiresInHours = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3_600_000))
  const isExpiringSoon = expiresInHours <= 24

  const sub = request.subscription
  const monthlyAfterDiscount =
    sub && request.percentOff
      ? sub.baseMonthlyAmount * sub.propertyCount * (1 - request.percentOff / 100)
      : null

  const durationLabel =
    request.duration === 'once'
      ? 'solo primer cobro'
      : request.duration === 'repeating'
        ? `${request.durationInMonths ?? '?'} meses`
        : 'permanente'

  return (
    <Surface variant="raised" radius="lg" padding="lg" className="overflow-hidden">
        {/* Top row — cliente + percentOff destacado */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide">
              <Building2 className="h-3.5 w-3.5" />
              Cliente
            </div>
            <Title className="mt-1 truncate">
              {request.organizationName ?? request.organizationId}
            </Title>
            {request.organizationSlug && (
              <Caption className="mt-0.5 font-mono text-slate-400">
                {request.organizationSlug}
              </Caption>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-amber-900 text-sm font-semibold ring-1 ring-amber-200">
              <Percent className="h-3.5 w-3.5" />
              {request.percentOff}% off
            </div>
            <Caption className="mt-1 text-slate-500">{durationLabel}</Caption>
          </div>
        </div>

        {/* Subscription context */}
        {sub && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <Caption className="text-slate-500 mb-1.5 uppercase tracking-wide">
              Contexto comercial
            </Caption>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="Plan" value={`${sub.planTier} · ${sub.billingCycle === 'annual' ? 'Anual' : 'Mensual'}`} />
              <Field
                label={`Tarifa × ${sub.propertyCount}`}
                value={formatCurrency(sub.baseMonthlyAmount * sub.propertyCount, sub.currency)}
              />
              <Field
                label="Después del desc."
                value={
                  monthlyAfterDiscount != null
                    ? formatCurrency(monthlyAfterDiscount, sub.currency)
                    : '—'
                }
                tone="emerald"
              />
              <Field
                label="Ahorro mensual"
                value={
                  sub && monthlyAfterDiscount != null
                    ? formatCurrency(
                        sub.baseMonthlyAmount * sub.propertyCount - monthlyAfterDiscount,
                        sub.currency,
                      )
                    : '—'
                }
                tone="amber"
              />
            </div>
          </div>
        )}

        {/* Requester + reason */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-700">
              {request.requestedByName ?? request.requestedByEmail ?? 'Consultor desconocido'}
            </span>
            {request.requestedByName && request.requestedByEmail && (
              <span className="text-slate-400 text-xs">· {request.requestedByEmail}</span>
            )}
            <Chip variant="neutral" className="ml-auto">
              {request.requestedByRole}
            </Chip>
          </div>
          <div className="rounded-md border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 italic">
            "{request.reason}"
          </div>
        </div>

        {/* Footer — timestamps + actions */}
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Solicitado {created.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1',
                isExpiringSoon ? 'text-amber-600 font-medium' : '',
              )}
            >
              <Clock className="h-3 w-3" />
              {isExpiringSoon ? `Vence en ${expiresInHours}h` : `Vence en ${Math.round(expiresInHours / 24)}d`}
            </span>
            {isExpiringSoon && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              disabled={isApproving || isRejecting}
              className="text-red-600 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Rechazar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onApprove}
              disabled={isApproving || isRejecting}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {isApproving ? 'Aprobando…' : 'Aprobar'}
            </Button>
          </div>
        </div>
    </Surface>
  )
}

// ─────────────────────────────────────────────────────────────────────
// RejectDialog — captura razón con guard ≥10 chars (backend audit)
// ─────────────────────────────────────────────────────────────────────

interface RejectDialogProps {
  target: DiscountApprovalRequest | null
  onClose: () => void
  onSubmit: (reason: string) => void
  isPending: boolean
}

function RejectDialog({ target, onClose, onSubmit, isPending }: RejectDialogProps) {
  const [reason, setReason] = useState('')

  if (!target) return null

  const isValid = reason.trim().length >= 10
  const charsLeft = 500 - reason.length

  const handleSubmit = () => {
    if (!isValid || isPending) return
    onSubmit(reason.trim())
  }

  const handleClose = () => {
    if (isPending) return
    setReason('')
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px]"
        onClick={handleClose}
      />
      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl ring-1 ring-slate-200/60">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-red-50 p-1.5 text-red-600">
              <X className="h-3.5 w-3.5" />
            </div>
            <Title>Rechazar descuento</Title>
          </div>
          <Caption className="mt-1">
            {target.organizationName ?? target.organizationId} ·{' '}
            <span className="font-semibold text-amber-700">{target.percentOff}% off</span>
          </Caption>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
              Razón del rechazo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              autoFocus
              disabled={isPending}
              placeholder="Ej: el cap del cliente actual no permite descuentos superiores al 10%. Sugerido: aplicar template SILVER15 que sí cabe."
              className={cn(
                'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-slate-800',
                'focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400',
                'resize-none',
                reason.length > 0 && !isValid ? 'border-red-300' : 'border-slate-200',
              )}
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className={cn(reason.length > 0 && !isValid ? 'text-red-600' : 'text-slate-500')}>
                {isValid ? 'OK' : `Mínimo 10 caracteres (audit trail)`}
              </span>
              <span className="text-slate-400 tabular-nums">{charsLeft} restantes</span>
            </div>
          </div>

          <Body className="text-xs text-slate-500">
            La razón quedará en audit log y se notificará al consultor que solicitó el descuento.
            No se podrá editar después.
          </Body>
        </div>

        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleSubmit}
            disabled={!isValid || isPending}
          >
            {isPending ? 'Rechazando…' : 'Rechazar descuento'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  value: string
  tone?: 'emerald' | 'amber'
}

function Field({ label, value, tone }: FieldProps) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}
