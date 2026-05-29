/**
 * ConfirmCheckinDialog — Sprint CHECK-IN-α
 *
 * Single-screen con secciones colapsables (no wizard). NN/g 2024 Wizards:
 * apropiados sólo para tareas >20min ejecutadas <1×/semana. Check-in <2min,
 * >20×/día → wizard es anti-patrón.
 *
 * Decisiones de iteración 2 (feedback usuario 2026-05-17):
 *   - Identidad: foto del documento (data URI base64) en vez de campo "Número".
 *     Más práctico para recepción de hostal LATAM; CFDI 4.0 con RFC genérico
 *     no requiere el número estructurado. Visa CRR 13.1/13.7 acepta foto como
 *     evidencia de presentación física.
 *   - Pago: bloqueo de overpayment con código BALANCE_OVERPAID (paridad
 *     Opera Cloud + RoomRaccoon — los 2 de 5 PMS conservadores).
 *   - Pago: terminal POS reword a "Número de aprobación de la terminal".
 *   - Pago: moneda primaria = propertyCurrency (LegalEntity.baseCurrency).
 *     Conversión secundaria USD/EUR en font menor (estándar 5/5 PMS).
 *   - Llave: sección eliminada — el hotel administra ese flujo aparte.
 *   - "Ya confirmado": NO se renderiza UI. El parent debe prevenir abrir el
 *     dialog (TimelineScheduler guard). Si igual ocurre, mostramos toast no
 *     bloqueante y nada más.
 *
 * Amounts: todos los displays usan formatMoney() con Intl.NumberFormat —
 * respeta decimales por currency (USD/MXN: 2; JPY/CLP/COP: 0).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle, Camera, Check, ChevronDown, CreditCard, Globe,
  IdCard, Loader2, LogIn, ShieldCheck, StickyNote, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogActions } from '../shared/DialogActions'
import { PaymentMethod } from '@zenix/shared'
import {
  guestStaysApi,
  type ConfirmCheckinInput,
  type PaymentEntryInput,
  type CheckinContext,
} from '../../api/guest-stays.api'
import type { GuestStayBlock } from '../../types/timeline.types'
import { useModalDismiss } from '../../hooks/useModalDismiss'

// ── Tipos públicos (preservados — TimelineScheduler no se modifica) ────────
interface Props {
  open:      boolean
  onClose:   () => void
  onConfirm: (data: ConfirmCheckinInput) => void
  isPending: boolean
  stay:      GuestStayBlock
  roomLabel: string
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]:          'Efectivo',
  [PaymentMethod.CARD_TERMINAL]: 'Terminal (tarjeta)',
  [PaymentMethod.BANK_TRANSFER]: 'Transferencia bancaria',
  [PaymentMethod.OTA_PREPAID]:   'OTA prepagado',
  [PaymentMethod.COMP]:          'Cortesía (COMP)',
}

const DOCUMENT_TYPES = [
  { value: '',         label: 'Seleccionar tipo…' },
  { value: 'PASSPORT', label: 'Pasaporte' },
  { value: 'INE',      label: 'INE / Credencial de elector' },
  { value: 'CEDULA',   label: 'Cédula de identidad' },
  { value: 'LICENSE',  label: 'Licencia de conducir' },
  { value: 'OTHER',    label: 'Otro documento oficial' },
]

const OTA_SOURCE_LABELS: Record<string, string> = {
  BOOKING_COM: 'Booking.com',
  EXPEDIA:     'Expedia',
  HOTELS_COM:  'Hotels.com',
  AGODA:       'Agoda',
  AIRBNB:      'Airbnb',
}

// ── Money formatting ───────────────────────────────────────────────────────
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'COP', 'PYG', 'VND', 'IDR'])
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'OMR', 'JOD'])

function decimalsFor(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3
  return 2
}

function formatMoney(amount: number, currency: string): string {
  const dec = decimalsFor(currency)
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(dec)}`
  }
}

function emptyPayment(): PaymentEntryInput {
  return { method: PaymentMethod.CASH, amount: 0 }
}

// ── Componente principal ───────────────────────────────────────────────────
export function ConfirmCheckinDialog({
  open, onClose, onConfirm, isPending, stay, roomLabel,
}: Props) {
  // Journey-extended stays exponen `stay.id` = segment id; el `guestStayId`
  // vive en propiedad aparte. Para queries/mutations sobre el GuestStay
  // parent, preferimos `guestStayId` cuando existe.
  const resolvedStayId = stay.guestStayId ?? stay.id

  const ctxQuery = useQuery({
    queryKey: ['checkin-context', resolvedStayId],
    queryFn:  () => guestStaysApi.getCheckinContext(resolvedStayId),
    enabled:  open,
    staleTime: 0,
  })

  const ctx = ctxQuery.data

  // ── Form state ──────────────────────────────────────────────────────────
  const [documentType,    setDocumentType]   = useState('')
  const [docPhotoDataUrl, setDocPhotoDataUrl] = useState<string | null>(null)
  const [arrivalNotes,    setArrivalNotes]   = useState('')
  const [payments,        setPayments]       = useState<PaymentEntryInput[]>([emptyPayment()])
  // CHECK-IN C1 (2026-05-29) — campos opcionales nacionalidad + género.
  // Diferenciador LATAM hostal: Mews fue criticado por no agregar género
  // en reservas para dorms mixtos. Captura opcional, no bloqueante.
  const [nationality,     setNationality]    = useState('')
  const [guestSex,        setGuestSex]       = useState('')

  const [identityExpanded, setIdentityExpanded] = useState(false)
  const [paymentExpanded,  setPaymentExpanded]  = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hidratar form con context cuando llega.
  // CHECK-IN C1 (Sprint 2026-05-29) — Bug fix #2: pre-fillear amount del
  // primer PaymentRow con el balance. Sin esto el recepcionista debía
  // tipear el monto manualmente cada vez (friction). Pattern Stripe /
  // RoomRaccoon: amount default = balance, recepcionista lo overrride
  // solo si está cobrando parcial.
  useEffect(() => {
    if (!ctx) return
    setDocumentType(ctx.stay.documentType ?? '')
    setDocPhotoDataUrl(ctx.stay.documentPhotoUrl ?? null)
    setArrivalNotes(ctx.stay.arrivalNotes ?? '')
    setNationality(ctx.stay.nationality ?? '')
    setGuestSex((ctx.stay as { guestSex?: string }).guestSex ?? '')
    setIdentityExpanded(!ctx.identityCaptured)
    const needsPaymentCalc =
      ctx.paymentModel === 'HOTEL_COLLECT' && ctx.balanceProjection.balance > 0
    setPaymentExpanded(needsPaymentCalc)
    // Bug fix #2: pre-fill amount cuando hay balance pendiente.
    if (needsPaymentCalc) {
      setPayments((prev) => {
        // Solo pre-fill si el form sigue en su estado inicial (1 row con amount=0).
        // No sobrescribimos si el recepcionista ya empezó a editar.
        if (prev.length === 1 && prev[0].amount === 0) {
          return [{ ...prev[0], amount: ctx.balanceProjection.balance }]
        }
        return prev
      })
    }
  }, [ctx])

  // ── Derived flags ───────────────────────────────────────────────────────
  // Moneda primaria = propertyCurrency (decisión iteración 2, 5/5 PMS).
  const propertyCurrency = ctx?.propertyCurrency ?? ctx?.balanceProjection.currency ?? stay.currency
  const balance       = ctx?.balanceProjection.balance ?? 0
  const isOtaCollect  = ctx?.paymentModel === 'OTA_COLLECT'
  const isAlreadyPaid = !isOtaCollect && balance <= 0
  const needsPayment  = !isOtaCollect && balance > 0

  const paymentSum       = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const projectedBalance = balance - paymentSum
  // Overpayment guard frontend (paridad backend BALANCE_OVERPAID, tolerancia 0.01).
  const isOverpayment = needsPayment && projectedBalance < -0.01

  const paymentErrors = payments.map((p) => {
    if (
      (p.method === PaymentMethod.CARD_TERMINAL || p.method === PaymentMethod.BANK_TRANSFER) &&
      !p.reference?.trim()
    ) return 'Referencia requerida para este método'
    if (
      (p.method === PaymentMethod.COMP || p.amount === 0) &&
      (!p.approvedById?.trim() || !p.approvalReason?.trim())
    ) return 'Código y razón de aprobación requeridos'
    return null
  })
  const hasPaymentErrors = paymentErrors.some(Boolean)

  const paymentValid = useMemo(() => {
    if (!needsPayment) return true
    if (hasPaymentErrors) return false
    if (isOverpayment) return false
    const hasOverride = payments.some(
      (p) => p.method === PaymentMethod.OTA_PREPAID || p.method === PaymentMethod.COMP,
    )
    return hasOverride || projectedBalance <= 0.01
  }, [needsPayment, hasPaymentErrors, isOverpayment, payments, projectedBalance])

  // Identidad válida — Sprint 2026-05-17 refactor (sin checkbox).
  //
  // CHECK-IN C1 (2026-05-29) — Bug fix #1: alineación cliente↔servidor.
  // Anteriormente el cliente exigía SIEMPRE foto del documento, pero el
  // server marca `identityCaptured=true` cuando hay `documentType + documentNumber`
  // pre-cargados de OTA (sin foto). El badge mostraba "Documento en reserva"
  // (verde) pero el CTA quedaba bloqueado sin pista — UX bug confirmado.
  //
  // Nueva lógica: si el server dice "ya capturado" (documentType + número
  // pre-OTA), confiamos en eso. Si el server dice "falta", exigimos foto
  // + tipo (path normal). Esto mantiene Visa CRR §5.9.2 (audit trail OTA
  // ya tiene el ID en su backend) sin bloquear walk-ups con OTA pre-fill.
  const identityValid =
    !!ctx?.identityCaptured ||
    (!!documentType && !!docPhotoDataUrl)

  const canConfirm =
    !!ctx &&
    ctx.canCheckIn.ok &&
    identityValid &&
    paymentValid &&
    !isPending

  // ── Dirty detection + dismiss ───────────────────────────────────────────
  const isDirty =
    !!docPhotoDataUrl ||
    arrivalNotes.trim() !== '' ||
    payments.some((p) => p.amount > 0 || (p.reference?.trim() ?? '') !== '') ||
    documentType !== (ctx?.stay.documentType ?? '') ||
    nationality !== (ctx?.stay.nationality ?? '') ||
    guestSex !== ((ctx?.stay as { guestSex?: string } | undefined)?.guestSex ?? '')

  const { requestClose, onBackdropClick, dialogElement: discardPrompt } = useModalDismiss({
    isDirty,
    onClose,
    disabled: isPending,
    confirmTitle: 'Descartar check-in',
    confirmMessage: 'Los datos capturados (foto, pagos, notas) se perderán. El check-in no se confirmará.',
    confirmLabel: 'Descartar',
  })

  // Cmd/Ctrl+Enter → confirm si CTA enabled.
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canConfirm) {
        e.preventDefault()
        handleConfirm()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canConfirm])

  // ── Photo upload ────────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Límite blando 5MB para evitar payloads excesivos en data URI base64.
    if (file.size > 5 * 1024 * 1024) {
      alert('La foto excede 5 MB. Toma una nueva foto de menor calidad.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setDocPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!canConfirm) return
    onConfirm({
      documentVerified: true,
      documentType:     documentType || undefined,
      documentPhotoUrl: docPhotoDataUrl ?? undefined,
      arrivalNotes:     arrivalNotes.trim() || undefined,
      // CHECK-IN C1 (2026-05-29) — opcionales analytics-LATAM
      nationality:      nationality.trim() || undefined,
      guestSex:         guestSex || undefined,
      payments:         isOtaCollect || isAlreadyPaid ? [] : payments,
    })
  }

  // ── Payment helpers ─────────────────────────────────────────────────────
  const updatePayment = (idx: number, patch: Partial<PaymentEntryInput>) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  const addPayment    = () => setPayments((prev) => [...prev, emptyPayment()])
  const removePayment = (idx: number) => setPayments((prev) => prev.filter((_, i) => i !== idx))

  // ── Header info ─────────────────────────────────────────────────────────
  const header = ctx?.stay ?? {
    guestName:  stay.guestName,
    paxCount:   stay.paxCount,
    bookingRef: stay.bookingRef ?? null,
    source:     null,
  }
  const checkInDate  = ctx ? new Date(ctx.stay.checkinAt)         : stay.checkIn
  const checkOutDate = ctx ? new Date(ctx.stay.scheduledCheckout) : stay.checkOut

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-dialog-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Brand stripe */}
        <div className="h-1 bg-emerald-500/80 shrink-0" />

        {/* ── Header sticky ─────────────────────────────────────────────── */}
        <header className="px-6 pt-4 pb-4 flex items-start justify-between shrink-0 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <LogIn className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="checkin-dialog-title" className="text-lg font-semibold text-slate-900 leading-tight">
                Confirmar check-in
              </h2>
              <p className="text-xs text-slate-500 mt-1 truncate">
                <span className="font-medium text-slate-700">{header.guestName}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                {roomLabel}
                <span className="mx-1.5 text-slate-300">·</span>
                {format(checkInDate, 'EEE d MMM', { locale: es })} →{' '}
                {format(checkOutDate, 'EEE d MMM', { locale: es })}
                <span className="mx-1.5 text-slate-300">·</span>
                {header.paxCount} pax
              </p>
              {/* Balance badge — adaptive según paymentModel */}
              {ctx && (
                <BalanceBadge
                  paymentModel={ctx.paymentModel}
                  balance={balance}
                  totalAmount={ctx.balanceProjection.totalAmount}
                  propertyCurrency={propertyCurrency}
                  secondaryRates={ctx.secondaryRates}
                  source={ctx.stay.source}
                />
              )}
              {header.bookingRef && (
                <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                  {header.bookingRef}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isPending}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        {/* ── Body scrollable ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {ctxQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Cargando datos de la reserva…</span>
            </div>
          )}

          {ctxQuery.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold mb-1">No se pudieron cargar los datos</p>
              <p className="text-xs text-rose-700">
                {(ctxQuery.error as Error)?.message ?? 'Error desconocido'}
              </p>
            </div>
          )}

          {ctx && (
            <>
              {/* ── SECCIÓN: IDENTIDAD ──────────────────────────────────── */}
              <Section
                icon={<IdCard className="h-4 w-4" />}
                title="Identidad"
                badge={
                  ctx.identityCaptured || docPhotoDataUrl
                    ? { label: docPhotoDataUrl ? 'Foto capturada' : 'Documento en reserva', tone: 'success' }
                    : { label: 'Requerido', tone: 'warning' }
                }
                expanded={identityExpanded}
                onToggle={() => setIdentityExpanded((v) => !v)}
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Tipo de documento *
                    </label>
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                                 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    >
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>{dt.label}</option>
                      ))}
                    </select>
                  </div>

                  <PhotoCapture
                    photoDataUrl={docPhotoDataUrl}
                    fileInputRef={fileInputRef}
                    onChange={handlePhotoChange}
                    onRemove={() => {
                      setDocPhotoDataUrl(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  />

                  {/* CHECK-IN C1 (2026-05-29) — opcionales analytics-LATAM.
                      Diferenciador vs Mews: campo género visible para dorms
                      mixtos. NN/g 2024 minimalismo: ambos opcionales y en
                      grid 2-col para no agregar altura excesiva al modal. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Nacionalidad <span className="text-slate-400 normal-case font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        placeholder="Ej: Mexicana, US, EU…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                                   text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        maxLength={50}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Género <span className="text-slate-400 normal-case font-normal">(opcional)</span>
                      </label>
                      <select
                        value={guestSex}
                        onChange={(e) => setGuestSex(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                                   text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <option value="">— No especificado —</option>
                        <option value="F">Femenino</option>
                        <option value="M">Masculino</option>
                        <option value="O">Otro / No binario</option>
                        <option value="N">Prefiere no decir</option>
                      </select>
                    </div>
                  </div>

                </div>
              </Section>

              {/* ── SECCIÓN: PAGO ───────────────────────────────────────── */}
              <Section
                icon={<CreditCard className="h-4 w-4" />}
                title="Pago"
                badge={
                  isOtaCollect
                    ? { label: `Pagado vía ${(header.source && OTA_SOURCE_LABELS[header.source]) || 'OTA'}`, tone: 'success' }
                    : isAlreadyPaid
                      ? { label: 'Liquidado ✓', tone: 'success' }
                      : { label: `Saldo ${formatMoney(balance, propertyCurrency)}`, tone: 'warning' }
                }
                expanded={paymentExpanded}
                onToggle={() => setPaymentExpanded((v) => !v)}
                collapsedSummary={
                  isOtaCollect
                    ? 'Sin acción requerida — la OTA ya cobró al huésped.'
                    : isAlreadyPaid
                      ? 'Saldo cubierto por pagos previos.'
                      : `Faltan ${formatMoney(Math.max(0, projectedBalance), propertyCurrency)} por cubrir.`
                }
              >
                {isOtaCollect ? (
                  <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-3">
                    <Globe className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-900 leading-relaxed">
                      <p className="font-semibold mb-0.5">
                        Cobrado por {(header.source && OTA_SOURCE_LABELS[header.source]) || 'la OTA'}
                      </p>
                      <p className="text-emerald-700">
                        El folio se marca pagado contra la virtual card. Reconciliación
                        del payout queda al módulo de pagos.
                      </p>
                    </div>
                  </div>
                ) : isAlreadyPaid ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <Check className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold text-emerald-800">Saldo liquidado</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatMoney(ctx.balanceProjection.totalAmount, propertyCurrency)} ya registrados.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Saldo a cubrir — primary propertyCurrency, secondary USD/EUR */}
                    <BalanceCard
                      label="Saldo a cubrir"
                      amount={balance}
                      currency={propertyCurrency}
                      secondaryRates={ctx.secondaryRates}
                      tone="warning"
                    />

                    {payments.map((p, idx) => (
                      <PaymentRow
                        key={idx}
                        payment={p}
                        idx={idx}
                        canRemove={payments.length > 1}
                        currency={propertyCurrency}
                        secondaryRates={ctx.secondaryRates}
                        error={paymentErrors[idx]}
                        onChange={(patch) => updatePayment(idx, patch)}
                        onRemove={() => removePayment(idx)}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={addPayment}
                      className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs
                                 text-slate-500 hover:text-slate-700 hover:border-slate-400 transition-colors"
                    >
                      + Agregar otro método de pago
                    </button>

                    {/* Status del balance proyectado */}
                    {isOverpayment ? (
                      <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 flex items-start gap-2 text-xs text-rose-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold mb-0.5">El pago excede el saldo</p>
                          <p className="text-rose-700">
                            Sobran {formatMoney(Math.abs(projectedBalance), propertyCurrency)}.
                            Ajusta el monto al saldo exacto — los depósitos por incidentales
                            se registran después del check-in.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        'rounded-lg border px-3.5 py-2.5 flex items-center justify-between text-xs',
                        projectedBalance <= 0.01
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700',
                      )}>
                        <span>Saldo tras este pago</span>
                        <span className="font-bold tabular-nums">
                          {formatMoney(Math.max(0, projectedBalance), propertyCurrency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* ── SECCIÓN: NOTAS DE LLEGADA (opcional, no colapsable) ── */}
              <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <StickyNote className="h-3.5 w-3.5" />
                  Notas de llegada
                  <span className="font-normal normal-case text-slate-400 ml-1">(opcional)</span>
                </label>
                <textarea
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  rows={2}
                  placeholder="Llegó tarde, taxi del aeropuerto, equipaje en consigna…"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                             text-slate-800 placeholder:text-slate-400 resize-none
                             focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/40">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Auditado: USALI 12 ed · CFDI 4.0 · Visa CRR 13.1/13.7
          </div>
          <DialogActions
            onCancel={requestClose}
            onConfirm={handleConfirm}
            confirmLabel="Confirmar check-in"
            confirmIcon={LogIn}
            isPending={isPending}
            confirmDisabled={!canConfirm}
            widthMode="auto"
          />
        </footer>
      </div>
      {/* Discard confirm modal — Zenix ConfirmDialog en lugar de window.confirm
          nativo. Nesting nativo Radix sobre este dialog (§116). */}
      {discardPrompt}
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function Section({
  icon, title, badge, expanded, onToggle, collapsedSummary, children,
}: {
  icon:    React.ReactNode
  title:   string
  badge?:  { label: string; tone: 'success' | 'warning' | 'neutral' }
  expanded: boolean
  onToggle: () => void
  collapsedSummary?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="text-slate-500">{icon}</span>
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge && (
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
              badge.tone === 'success' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
              badge.tone === 'warning' && 'bg-amber-50 text-amber-700 border border-amber-200',
              badge.tone === 'neutral' && 'bg-slate-100 text-slate-600 border border-slate-200',
            )}>
              {badge.label}
            </span>
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-slate-400 transition-transform duration-200',
            expanded && 'rotate-180',
            'motion-reduce:transition-none',
          )} />
        </span>
      </button>
      {expanded ? (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
          {children}
        </div>
      ) : collapsedSummary ? (
        <p className="px-4 pb-3 text-xs text-slate-500 border-t border-slate-100 pt-2.5">
          {collapsedSummary}
        </p>
      ) : null}
    </section>
  )
}

/**
 * PhotoCapture — Webcam-first capture del documento del huésped.
 *
 * Sprint 2026-05-17 refactor: el flow primario ahora es CÁMARA EN VIVO de la
 * PC vía getUserMedia (la app corre en la laptop de recepción que tiene
 * webcam frontal). Pattern industria: Avenger Booking, Mews PMS Kiosk,
 * Cloudbeds Operator app.
 *
 * Justificación vs el flow anterior (file upload):
 *   - 0 steps adicionales (no abrir Finder/Explorer, no buscar archivo)
 *   - El recepcionista apunta la webcam al documento físico en el counter
 *     → click → captura en <2s vs ~15s del flow upload
 *   - Foto siempre fresca (no se sube de un álbum con foto vieja)
 *   - Visa CRR §5.9.2 evidence requirement: timestamp + foto tomada en el
 *     act of check-in (auditable)
 *
 * Fallback: si el browser/usuario rechaza el permiso de cámara, mostramos
 * el botón "Subir archivo" como alternativa. Algunos hostales sin webcam
 * o setups remotos pueden necesitarlo.
 */
function PhotoCapture({
  photoDataUrl, fileInputRef, onChange, onRemove,
}: {
  photoDataUrl: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onChange:     (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove:     () => void
}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Cleanup del stream al desmontar o al guardar foto (libera la webcam LED)
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  async function startCamera() {
    setCameraError(null)
    try {
      // facingMode 'environment' = cámara trasera (mobile); en laptop usa
      // la única disponible (frontal). Resolución preferida 1280x720 — balance
      // entre calidad y tamaño base64 (~150-250KB JPEG comprimido).
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      setStream(mediaStream)
      // requestAnimationFrame asegura que el <video> está mounted antes de srcObject
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          void videoRef.current.play().catch(() => { /* autoplay bloqueado raro en laptop */ })
        }
      })
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Permiso de cámara denegado. Usa "Subir archivo" como alternativa.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No se detectó cámara. Usa "Subir archivo".')
      } else {
        setCameraError('No se pudo iniciar la cámara. Usa "Subir archivo".')
      }
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
  }

  function captureFrame() {
    if (!videoRef.current || !canvasRef.current || !stream) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    // JPEG 0.85 quality — balance calidad/tamaño. PNG sería ~3-5x más grande.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    // Inject como si fuera un file event para reusar el onChange handler.
    // Creamos un evento sintético compatible: el handler solo lee file.size
    // y crea un data URL, pero aquí ya tenemos el dataUrl directamente.
    // Atajo: pasar el dataUrl directo al state vía un mecanismo paralelo.
    // Simulamos un fileInput change con un File real construido desde el blob.
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `documento-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        const syntheticEvent = {
          target: fileInputRef.current,
        } as unknown as React.ChangeEvent<HTMLInputElement>
        onChange(syntheticEvent)
      }
      stopCamera()
    }, 'image/jpeg', 0.85)
    // dataUrl no usado directo — sirve si queremos preview instantáneo antes del blob callback
    void dataUrl
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
        Foto del documento
        <span className="font-normal normal-case text-slate-400 ml-1.5">
          — requerido (Visa CRR evidence)
        </span>
      </label>

      {/* Estado 1: ya hay foto capturada */}
      {photoDataUrl ? (
        <div className="relative">
          <img
            src={photoDataUrl}
            alt="Documento del huésped"
            className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 bg-white/90 hover:bg-white text-slate-700 rounded-full p-1.5 shadow-sm border border-slate-200"
            aria-label="Quitar foto"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : stream ? (
        /* Estado 2: cámara activa con preview en vivo */
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-300">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-64 object-contain bg-black"
            />
            <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              REC
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={captureFrame}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium h-9 rounded-md flex items-center justify-center gap-1.5 transition-colors"
            >
              <Camera className="h-4 w-4" />
              Capturar
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium h-9 rounded-md transition-colors"
            >
              Cancelar
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      ) : (
        /* Estado 3: idle — grid 2-col compacto cámara + upload.
           Sprint CHECK-IN C1 user feedback (2026-05-29): el botón vertical
           ocupaba ~140px en el modal. Grid 2-col reduce a ~50px sin perder
           discoverability — ambas opciones visibles al mismo nivel
           (Apple HIG paritarios para acciones equivalentes). */
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startCamera}
              className="rounded-lg border-2 border-dashed border-emerald-300 hover:border-emerald-500
                         bg-emerald-50/40 hover:bg-emerald-50 px-3 py-2.5 flex items-center justify-center gap-2
                         transition-colors text-emerald-700 text-xs font-semibold"
            >
              <Camera className="h-4 w-4" />
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-300 hover:border-slate-400
                         bg-white hover:bg-slate-50 px-3 py-2.5 flex items-center justify-center gap-2
                         transition-colors text-slate-600 text-xs font-medium"
            >
              <Upload className="h-3.5 w-3.5" />
              Subir archivo
            </button>
          </div>
          {cameraError && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
              {cameraError}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />
    </div>
  )
}

function BalanceBadge({
  paymentModel, balance, totalAmount, propertyCurrency, secondaryRates, source,
}: {
  paymentModel: 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'
  balance: number
  totalAmount: number
  propertyCurrency: string
  secondaryRates?: Record<string, number | null> | null
  source: string | null
}) {
  const isOta = paymentModel === 'OTA_COLLECT'
  const liquidado = !isOta && balance <= 0
  const amount = liquidado ? totalAmount : balance

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums',
        isOta
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : liquidado
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200',
      )}>
        {isOta ? (
          <>
            <Globe className="h-3 w-3" />
            Pagado vía {(source && OTA_SOURCE_LABELS[source]) || 'OTA'}
          </>
        ) : liquidado ? (
          <>
            <Check className="h-3 w-3" />
            Liquidado · {formatMoney(totalAmount, propertyCurrency)}
          </>
        ) : (
          <>
            <CreditCard className="h-3 w-3" />
            Saldo: {formatMoney(balance, propertyCurrency)}
          </>
        )}
      </span>
      {!isOta && amount > 0 && (
        <ConversionLine amount={amount} rates={secondaryRates} />
      )}
    </div>
  )
}

function BalanceCard({
  label, amount, currency, secondaryRates, tone,
}: {
  label: string
  amount: number
  currency: string
  secondaryRates?: Record<string, number | null> | null
  tone: 'warning' | 'neutral'
}) {
  return (
    <div className={cn(
      'rounded-lg border px-3.5 py-2.5',
      tone === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200',
    )}>
      <div className="flex items-center justify-between">
        <span className={cn(
          'text-[11px] font-bold uppercase tracking-wider',
          tone === 'warning' ? 'text-amber-700' : 'text-slate-600',
        )}>
          {label}
        </span>
        <span className={cn(
          'text-xl font-bold tabular-nums',
          tone === 'warning' ? 'text-amber-800' : 'text-slate-800',
        )}>
          {formatMoney(amount, currency)}
        </span>
      </div>
      <ConversionLine amount={amount} rates={secondaryRates} align="end" />
    </div>
  )
}

function ConversionLine({
  amount, rates, align = 'start',
}: {
  amount: number
  /** Map currency-code → rate ("1 propertyCurrency = rate target"). Null/undefined → omit. */
  rates?: Record<string, number | null> | null
  align?: 'start' | 'end'
}) {
  if (!rates) return null
  const parts = Object.entries(rates)
    .filter(([, rate]) => typeof rate === 'number' && rate > 0)
    .map(([currency, rate]) => `≈ ${formatMoney(amount * (rate as number), currency)}`)
  if (parts.length === 0) return null
  return (
    <p className={cn(
      'text-[10px] text-slate-400 tabular-nums mt-0.5',
      align === 'end' && 'text-right',
    )}>
      {parts.join(' · ')}
    </p>
  )
}

function PaymentRow({
  payment, idx, canRemove, currency, secondaryRates, error, onChange, onRemove,
}: {
  payment:   PaymentEntryInput
  idx:       number
  canRemove: boolean
  currency:  string
  secondaryRates?: Record<string, number | null> | null
  error:     string | null
  onChange:  (patch: Partial<PaymentEntryInput>) => void
  onRemove:  () => void
}) {
  const isTerminal = payment.method === PaymentMethod.CARD_TERMINAL
  const isTransfer = payment.method === PaymentMethod.BANK_TRANSFER
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Pago {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-slate-400 hover:text-rose-600"
          >
            Eliminar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Método</label>
          <select
            value={payment.method}
            onChange={(e) => onChange({
              method: e.target.value as PaymentMethod,
              reference: '',
              approvedById: '',
              approvalReason: '',
            })}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Monto ({currency})
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={payment.amount || ''}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-emerald-300 tabular-nums"
          />
          {payment.amount > 0 && (
            <ConversionLine amount={payment.amount} rates={secondaryRates} />
          )}
        </div>
      </div>

      {(isTerminal || isTransfer) && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {isTerminal
              ? 'Número de aprobación de la terminal *'
              : 'Referencia de la transferencia *'}
          </label>
          <input
            type="text"
            value={payment.reference ?? ''}
            onChange={(e) => onChange({ reference: e.target.value })}
            placeholder={
              isTerminal
                ? 'Lo imprime el ticket de la terminal (ej. 123456)'
                : 'Folio o número de operación'
            }
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
      )}

      {(payment.method === PaymentMethod.COMP || payment.amount === 0) && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Autorización del manager
            <span className="font-normal normal-case text-slate-400 ml-1.5">
              — cortesía y monto cero requieren aprobación para auditoría
            </span>
          </p>
          <input
            type="text"
            value={payment.approvedById ?? ''}
            onChange={(e) => onChange({ approvedById: e.target.value })}
            placeholder="Código del manager"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <input
            type="text"
            value={payment.approvalReason ?? ''}
            onChange={(e) => onChange({ approvalReason: e.target.value })}
            placeholder="Motivo (cortesía VIP, compensación por servicio…)"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
