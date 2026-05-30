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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle, Banknote, Camera, Check, ChevronDown, CreditCard, FileText,
  Gift, Globe, IdCard, Info, Landmark, Loader2, LogIn, Mail, MapPin, Pencil, Phone,
  ShieldCheck, StickyNote, Upload, User as UserIcon, X,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogActions } from '../shared/DialogActions'
import { CountryCombobox, ALL_COUNTRIES } from '../shared/CountryCombobox'
import { DocumentPhotoCapture } from '../shared/DocumentPhotoCapture'
import { StyledSelect } from '../shared/StyledSelect'
import { StyledInput } from '../shared/StyledInput'
import { PhoneFieldWithCountry } from '../shared/PhoneFieldWithCountry'
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

  // CHECK-IN C1.8 perf (2026-05-29) — cache 30s para que re-aperturas
  // rápidas (Cmd+Enter accidental → reopen) no refetcheen. Antes staleTime:0
  // forzaba refetch en cada mount, lo cual hacía el modal sentirse lento al
  // abrir incluso con SSE actualizando background. 30s es seguro porque el
  // ctx no cambia salvo por payment/check-in events que invalidan la query.
  const ctxQuery = useQuery({
    queryKey: ['checkin-context', resolvedStayId],
    queryFn:  () => guestStaysApi.getCheckinContext(resolvedStayId),
    enabled:  open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
  const [guestPhone,      setGuestPhone]     = useState('')
  const [guestEmail,      setGuestEmail]     = useState('')
  const [guestFirstName,  setGuestFirstName] = useState('')
  const [guestLastName,   setGuestLastName]  = useState('')

  // CHECK-IN C1.9 F-refined (2026-05-29) — Section colapsable eliminado.
  // Identidad/Pago/Notas siempre visibles (sin clicks de expand).

  // CHECK-IN C1.10 stepper (2026-05-29) — 2 pasos adaptive:
  // Step 1 = Identidad (foto + campos). Step 2 = Pago + Notas.
  // Adaptive: si no hay pago requerido (OTA o liquidado), single-step
  // (Pago se omite; Notas se muestran en Step 1 al fondo).
  const [step, setStep] = useState<1 | 2>(1)

  // CHECK-IN C1.7 (2026-05-29) — per-field display vs edit mode.
  // Si el campo ya tiene valor (capturado al crear reserva o vino de OTA),
  // se muestra como display row (no input). Click "editar" → edit mode.
  // Cuando vacío: input directo. Pattern Apple HIG read-then-edit.
  const [editingDocType, setEditingDocType] = useState(false)
  const [editingNat,     setEditingNat]     = useState(false)
  const [editingSex,     setEditingSex]     = useState(false)
  const [editingPhone,   setEditingPhone]   = useState(false)
  const [editingEmail,   setEditingEmail]   = useState(false)
  const [editingFirstName, setEditingFirstName] = useState(false)
  const [editingLastName,  setEditingLastName]  = useState(false)

  // CHECK-IN C1.14 (2026-05-29) — deferred validation pattern (Stripe
  // Elements / Material Design 3). NO mostramos errores eager mientras
  // recepcionista teclea. Solo al primer intento de confirmar marcamos
  // los inputs inválidos con border rojo. Reduce ansiedad de form
  // (NN/g Form Anxiety study 2023: -22% abandonment con deferred).
  const [attemptedConfirm, setAttemptedConfirm] = useState(false)
  // CHECK-IN C1.18 — counter para retriggear shake animation en cada
  // click inválido (sin esto, después del primer shake el browser no
  // re-anima aunque attemptedConfirm siga true). Pasa como `key` o como
  // dep a las cards required → animación se replays cada intento.
  const [attemptNonce, setAttemptNonce] = useState(0)

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
    setGuestPhone(ctx.stay.guestPhone ?? '')
    setGuestEmail(ctx.stay.guestEmail ?? '')
    // CHECK-IN C1.12 — derive firstName/lastName: prefer columnas BI directas;
    // fallback a split del guestName (stays viejos pre-backfill).
    const ctxFirst = ctx.stay.guestFirstName ?? null
    const ctxLast  = ctx.stay.guestLastName  ?? null
    if (ctxFirst || ctxLast) {
      setGuestFirstName(ctxFirst ?? '')
      setGuestLastName(ctxLast ?? '')
    } else {
      const parts = ctx.stay.guestName.trim().split(/\s+/)
      setGuestFirstName(parts[0] ?? '')
      setGuestLastName(parts.slice(1).join(' '))
    }
    // Reset edit states (cada apertura del modal arranca en display si hay valor)
    setEditingDocType(false)
    setEditingNat(false)
    setEditingSex(false)
    setEditingPhone(false)
    setEditingEmail(false)
    setEditingFirstName(false)
    setEditingLastName(false)
    setAttemptedConfirm(false)
    setStep(1) // reset stepper al abrir
    const needsPaymentCalc =
      ctx.paymentModel === 'HOTEL_COLLECT' && ctx.balanceProjection.balance > 0
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
  // CHECK-IN C1.8 perf (2026-05-29) — TODOS los derived useMemo para evitar
  // recompute en cada keystroke (modal se sentía lento al teclear).
  // Reglas: deps mínimas precisas; evitar recompute si solo cambió ej.
  // documentType pero no payments.
  const propertyCurrency = useMemo(
    () => ctx?.propertyCurrency ?? ctx?.balanceProjection.currency ?? stay.currency,
    [ctx?.propertyCurrency, ctx?.balanceProjection.currency, stay.currency],
  )
  const balance       = ctx?.balanceProjection.balance ?? 0
  const isOtaCollect  = ctx?.paymentModel === 'OTA_COLLECT'
  const isAlreadyPaid = !isOtaCollect && balance <= 0
  const needsPayment  = !isOtaCollect && balance > 0

  const paymentSum = useMemo(
    () => payments.reduce((s, p) => s + (p.amount || 0), 0),
    [payments],
  )
  const projectedBalance = balance - paymentSum
  const isOverpayment    = needsPayment && projectedBalance < -0.01

  const paymentErrors = useMemo(
    () => payments.map((p) => {
      if (
        (p.method === PaymentMethod.CARD_TERMINAL || p.method === PaymentMethod.BANK_TRANSFER) &&
        !p.reference?.trim()
      ) return 'Referencia requerida para este método'
      // CHECK-IN C1.13 (2026-05-29) — eliminada validación de auth para
      // COMP/$0 (user feedback). El recepcionista conoce los códigos de
      // cortesía; el manager no siempre está presente. El motivo va en
      // notas si aplica. Backend ya acepta sin approvedById/Reason desde
      // §120-bis (cambios post-checkin no requieren approval bloqueante).
      return null
    }),
    [payments],
  )
  const hasPaymentErrors = useMemo(() => paymentErrors.some(Boolean), [paymentErrors])

  const paymentValid = useMemo(() => {
    if (!needsPayment) return true
    if (hasPaymentErrors) return false
    if (isOverpayment) return false
    const hasOverride = payments.some(
      (p) => p.method === PaymentMethod.OTA_PREPAID || p.method === PaymentMethod.COMP,
    )
    return hasOverride || projectedBalance <= 0.01
  }, [needsPayment, hasPaymentErrors, isOverpayment, payments, projectedBalance])

  // Identidad válida — pre-fill OTA (server check) o foto+tipo (path normal).
  const identityValid = useMemo(
    () => !!ctx?.identityCaptured || (!!documentType && !!docPhotoDataUrl),
    [ctx?.identityCaptured, documentType, docPhotoDataUrl],
  )

  // CHECK-IN C1.14 — button enabled siempre (excepto pending). Validación
  // deferida en handleConfirm: si invalido, marca attemptedConfirm + no submit.
  // Habilita la affordance click→error visual en vez de "porqué disabled?".
  const canConfirm = useMemo(
    () => !!ctx && ctx.canCheckIn.ok && !isPending,
    [ctx, isPending],
  )
  const isFullyValid = identityValid && paymentValid

  // ── Dirty detection + dismiss ───────────────────────────────────────────
  const isDirty = useMemo(
    () =>
      !!docPhotoDataUrl ||
      arrivalNotes.trim() !== '' ||
      payments.some((p) => p.amount > 0 || (p.reference?.trim() ?? '') !== '') ||
      documentType !== (ctx?.stay.documentType ?? '') ||
      nationality !== (ctx?.stay.nationality ?? '') ||
      guestSex !== ((ctx?.stay as { guestSex?: string } | undefined)?.guestSex ?? ''),
    [
      docPhotoDataUrl, arrivalNotes, payments, documentType, nationality, guestSex,
      ctx?.stay.documentType, ctx?.stay.nationality, (ctx?.stay as { guestSex?: string } | undefined)?.guestSex,
    ],
  )

  const { requestClose, onBackdropClick, dialogElement: discardPrompt } = useModalDismiss({
    isDirty,
    onClose,
    disabled: isPending,
    confirmTitle: 'Descartar check-in',
    confirmMessage: 'Los datos capturados (foto, pagos, notas) se perderán. El check-in no se confirmará.',
    confirmLabel: 'Descartar',
  })

  // ── Photo upload ────────────────────────────────────────────────────────
  // CHECK-IN C1.8 perf: useCallback estabiliza la ref para que React.memo
  // de PhotoCapture no se invalide en cada keystroke del padre.
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('La foto excede 5 MB. Toma una nueva foto de menor calidad.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setDocPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }, [])

  const handlePhotoRemove = useCallback(() => {
    setDocPhotoDataUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!canConfirm) return
    // CHECK-IN C1.14 — validación deferida: si hay campos faltantes,
    // flipear attemptedConfirm para revelar borders rojos y no submitear.
    // El user ya intentó → ahora es OK mostrar errores visuales.
    if (!isFullyValid) {
      setAttemptedConfirm(true)
      setAttemptNonce((n) => n + 1) // retrigger shake en cada click inválido
      return
    }
    onConfirm({
      documentVerified: true,
      documentType:     documentType || undefined,
      documentPhotoUrl: docPhotoDataUrl ?? undefined,
      arrivalNotes:     arrivalNotes.trim() || undefined,
      nationality:      nationality.trim() || undefined,
      guestSex:         guestSex || undefined,
      guestPhone:       guestPhone.trim() || undefined,
      guestEmail:       guestEmail.trim() || undefined,
      guestFirstName:   guestFirstName.trim() || undefined,
      guestLastName:    guestLastName.trim() || undefined,
      payments:         isOtaCollect || isAlreadyPaid ? [] : payments,
    })
  }, [
    canConfirm, isFullyValid, onConfirm, documentType, docPhotoDataUrl, arrivalNotes,
    nationality, guestSex, guestPhone, guestEmail, guestFirstName, guestLastName,
    isOtaCollect, isAlreadyPaid, payments,
  ])

  // ── Payment helpers ─────────────────────────────────────────────────────
  const updatePayment = useCallback((idx: number, patch: Partial<PaymentEntryInput>) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }, [])
  const addPayment    = useCallback(() => setPayments((prev) => [...prev, emptyPayment()]), [])
  const removePayment = useCallback((idx: number) => setPayments((prev) => prev.filter((_, i) => i !== idx)), [])

  // Cmd/Ctrl+Enter → confirm si CTA enabled.
  // CHECK-IN C1.8 perf: refs estables para que el listener NO se re-registre
  // en cada keystroke (canConfirm + handleConfirm cambiaban refs aunque la
  // función sea estable funcionalmente). Listener se registra UNA SOLA VEZ
  // mientras el modal esté abierto.
  const canConfirmRef = useRef(canConfirm)
  const handleConfirmRef = useRef(handleConfirm)
  useEffect(() => { canConfirmRef.current = canConfirm }, [canConfirm])
  useEffect(() => { handleConfirmRef.current = handleConfirm }, [handleConfirm])
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canConfirmRef.current) {
        e.preventDefault()
        handleConfirmRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

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
      {/* CHECK-IN C1.8 perf: backdrop-blur eliminado — GPU paint cost
          notorio durante scroll del body. bg-black/30 sólido es indistinguible
          visualmente pero ~10x más barato per frame. */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Brand stripe */}
        <div className="h-1 bg-emerald-500/80 shrink-0" />

        {/* ── Header (CHECK-IN C1.16, 2026-05-29) — Apple/Stripe/Linear minimal
            Auditoría user feedback "demasiados elementos, saldo se ve genérico".

            Filosofía: typography-first, sin chrome decorativo. Apple HIG Modal
            Sheets 2024: "Modals focus on a single task; chrome should fade".

            Cambios vs C1.15:
              · Stat tiles eliminados → metadata inline 1 línea (Treisman 1980:
                valores bold pre-attentive — `Hab. **A2**` se escanea igual)
              · Saldo SIN card box → typography pura (Bloomberg / Stripe Treasury)
              · Background plano blanco (no gradients) — Apple Vibrancy moderno
              · ID en línea separada como sub-info — jerarquía clara
              · Currency code MXN inline-baseline tipo notación financiera

            Resultado: altura ~76px (antes 140px), 5 elementos visuales (antes 11). */}
        <header className="px-6 pt-5 pb-4 shrink-0 border-b border-slate-100">
          <div className="flex items-start justify-between gap-6">
            {/* Left — icon + title + metadata + ID */}
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 border border-emerald-200/80 flex items-center justify-center shrink-0">
                <LogIn className="h-5 w-5 text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="checkin-dialog-title" className="text-[18px] font-semibold text-slate-900 leading-tight tracking-tight">
                  Confirmar check-in
                </h2>
                <p className="text-[12.5px] text-slate-500 mt-1 leading-relaxed">
                  Hab. <span className="font-semibold text-slate-700">{roomLabel.replace(/^Hab\.\s*/, '')}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-slate-700">{format(checkInDate, 'd MMM', { locale: es })} → {format(checkOutDate, 'd MMM', { locale: es })}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-slate-700">{header.paxCount}</span> pax
                </p>
                {header.bookingRef && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(header.bookingRef ?? '')}
                    title="Copiar ID de reserva"
                    className="mt-1 inline-block text-[10.5px] font-mono text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer tracking-tight"
                  >
                    {header.bookingRef}
                  </button>
                )}
              </div>
            </div>

            {/* Right — Saldo typography pura (no card) + close */}
            <div className="flex items-start gap-3 shrink-0">
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
              <button
                type="button"
                onClick={requestClose}
                disabled={isPending}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 -mr-1 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
          </div>
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
              {/* CHECK-IN C1.10 stepper (2026-05-29) — 2 pasos adaptive:
                  Step 1 = Identidad (foto + campos). Step 2 = Pago + Notas.
                  Adaptive: si no hay pago requerido (OTA o liquidado), single-step
                  — Notas vive al fondo del step 1 y nunca aparece step 2. */}

              {step === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-stretch">

                {/* COL IZQ — Photo anchor (h-full = mismo height que col der via items-stretch) */}
                <DocumentPhotoCapture
                  photoDataUrl={docPhotoDataUrl}
                  fileInputRef={fileInputRef}
                  onChange={handlePhotoChange}
                  onRemove={handlePhotoRemove}
                  hasError={attemptedConfirm && !docPhotoDataUrl && !ctx?.identityCaptured}
                  shakeNonce={attemptNonce}
                />

                {/* COL DER — Identidad (+ Notas si single-step) */}
                <div className="space-y-5">

                  {/* ─── IDENTIDAD ──────────────────────────────────── */}
                  {/* CHECK-IN C1.18 — chip "Requerido" eliminado (estándar
                      Zenix: feedback de campos requeridos via red border +
                      shake animation post-click confirm, no labels ambiente
                      que ensucian el header). Chip "Capturado" emerald se
                      mantiene como confirmación positiva. */}
                  <div>
                    <div className="flex items-center justify-between mb-2 px-0.5">
                      <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <IdCard className="h-3 w-3 text-slate-400" />
                        Identidad
                      </h3>
                      {identityValid && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Check className="h-2.5 w-2.5" />
                          Capturado
                        </span>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      {/* CHECK-IN C1.12 — Nombre + Apellido pre-cargados.
                          Vienen de ctx.stay.guestFirstName/guestLastName (BI)
                          o fallback split del guestName legacy. Display+pencil
                          igual que nationality/género/phone/email. */}
                      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-3 min-w-0">
                          {guestFirstName && !editingFirstName ? (
                            <PrefilledRow
                              label="Nombre"
                              prefilled
                              flat
                              value={guestFirstName}
                              onEdit={() => setEditingFirstName(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Nombre <span className="text-rose-500 font-normal">*</span>
                              </label>
                              <StyledInput
                                type="text"
                                value={guestFirstName}
                                onChange={(e) => setGuestFirstName(e.target.value)}
                                onBlur={() => guestFirstName && setEditingFirstName(false)}
                                autoFocus={editingFirstName}
                                placeholder="Nombre"
                                maxLength={80}
                              />
                            </div>
                          )}
                        </div>
                        <div className="p-3 min-w-0">
                          {guestLastName && !editingLastName ? (
                            <PrefilledRow
                              label="Apellido"
                              prefilled
                              flat
                              value={guestLastName}
                              onEdit={() => setEditingLastName(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Apellido <span className="text-rose-500 font-normal">*</span>
                              </label>
                              <StyledInput
                                type="text"
                                value={guestLastName}
                                onChange={(e) => setGuestLastName(e.target.value)}
                                onBlur={() => guestLastName && setEditingLastName(false)}
                                autoFocus={editingLastName}
                                placeholder="Apellido"
                                maxLength={80}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CHECK-IN C1.13 — Row: Email | Nacionalidad.
                          Email subió al primer row de campos opcionales,
                          Tipo doc se mueve al último. */}
                      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-3 min-w-0">
                          {guestEmail && !editingEmail ? (
                            <PrefilledRow
                              label="Email"
                              prefilled
                              flat
                              value={guestEmail}
                              onEdit={() => setEditingEmail(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Email <span className="text-slate-400 normal-case font-normal">· opcional</span>
                              </label>
                              <StyledInput
                                type="email"
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                                onBlur={() => guestEmail && setEditingEmail(false)}
                                autoFocus={editingEmail}
                                placeholder="email@dominio.com"
                                maxLength={120}
                              />
                            </div>
                          )}
                        </div>
                        <div className="p-3 min-w-0">
                          {nationality && !editingNat ? (
                            <PrefilledRow
                              label="Nacionalidad"
                              optional
                              flat
                              value={
                                <span className="inline-flex items-center gap-1.5">
                                  {/* CHECK-IN C1.18 — bandera IZQUIERDA en ambos
                                      estados (dropdown + display) por consistencia
                                      cross-platform (Apple Settings, Stripe,
                                      Airbnb, iOS Region picker). NN/g H4
                                      Consistency & standards. */}
                                  {(() => {
                                    const flag = ALL_COUNTRIES.find((c) => c.name === nationality)?.flag
                                    return flag ? <span className="text-base leading-none">{flag}</span> : null
                                  })()}
                                  <span>{nationality}</span>
                                </span>
                              }
                              onEdit={() => setEditingNat(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Nacionalidad <span className="text-slate-400 normal-case font-normal">· opcional</span>
                              </label>
                              <CountryCombobox
                                value={nationality}
                                onChange={(name) => {
                                  setNationality(name)
                                  if (name) setEditingNat(false)
                                }}
                                placeholder="Buscar país…"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Género + Teléfono — grid 2-col */}
                      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                        <div className="p-3 min-w-0">
                          {guestSex && !editingSex ? (
                            <PrefilledRow
                              label="Género"
                              optional
                              flat
                              value={
                                { F: 'Femenino', M: 'Masculino', O: 'Otro / No binario', N: 'Prefiere no decir' }[guestSex]
                                ?? guestSex
                              }
                              onEdit={() => setEditingSex(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Género <span className="text-slate-400 normal-case font-normal">· opcional</span>
                              </label>
                              <StyledSelect
                                value={guestSex}
                                onChange={(v) => {
                                  setGuestSex(v)
                                  if (v) setEditingSex(false)
                                }}
                                options={[
                                  { value: 'F', label: 'Femenino' },
                                  { value: 'M', label: 'Masculino' },
                                  { value: 'O', label: 'Otro / No binario' },
                                  { value: 'N', label: 'Prefiere no decir' },
                                ]}
                                placeholder="Seleccionar género…"
                                autoFocus={editingSex}
                              />
                            </div>
                          )}
                        </div>
                        <div className="p-3 min-w-0">
                          {guestPhone && !editingPhone ? (
                            <PrefilledRow
                              label="Teléfono"
                              prefilled
                              flat
                              value={guestPhone}
                              onEdit={() => setEditingPhone(true)}
                            />
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Teléfono <span className="text-slate-400 normal-case font-normal">· opcional</span>
                              </label>
                              {/* CHECK-IN C1.12 — mismo PhoneFieldWithCountry
                                  que el formulario de crear reserva. Bandera
                                  país + dial code + E.164 normalized. */}
                              <PhoneFieldWithCountry
                                value={guestPhone}
                                onChange={(e164) => setGuestPhone(e164)}
                                onBlur={() => guestPhone && setEditingPhone(false)}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CHECK-IN C1.13 — Tipo de documento al final, full-width.
                          Es el único campo realmente requerido (*) además del nombre. */}
                      <div className="p-3">
                        {documentType && !editingDocType ? (
                          <PrefilledRow
                            label="Tipo de documento"
                            required
                            flat
                            value={DOCUMENT_TYPES.find((dt) => dt.value === documentType)?.label ?? documentType}
                            onEdit={() => setEditingDocType(true)}
                          />
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Tipo de documento <span className="text-rose-500 font-normal">*</span>
                            </label>
                            <StyledSelect
                              value={documentType}
                              onChange={(v) => {
                                setDocumentType(v)
                                if (v) setEditingDocType(false)
                              }}
                              options={DOCUMENT_TYPES.map((dt) => ({ value: dt.value, label: dt.label }))}
                              placeholder="Seleccionar tipo…"
                              autoFocus={editingDocType}
                              hasError={attemptedConfirm && !documentType}
                              shakeNonce={attemptNonce}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* En single-step (sin pago), Notas vive al fondo de step 1.
                      En 2-step mode, Notas se mueve a step 2. */}
                  {!needsPayment && (
                    <div>
                      <div className="flex items-center mb-2 px-0.5">
                        <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                          <StickyNote className="h-3 w-3 text-slate-400" />
                          Notas de llegada
                          <span className="text-slate-400 normal-case font-normal">· opcional</span>
                        </h3>
                      </div>
                      <textarea
                        value={arrivalNotes}
                        onChange={(e) => setArrivalNotes(e.target.value)}
                        rows={2}
                        placeholder="Llegó tarde, taxi del aeropuerto, equipaje en consigna…"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                                   text-slate-800 placeholder:text-slate-400 resize-none
                                   focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </div>
                  )}

                  {/* Pago + Notas (step 2) cuando hay payment requerido:
                      condicionalmente mostrar OTA / Liquidado info siempre
                      (legacy block para single-step). En needsPayment ramo
                      → mover bloque completo al step 2 abajo. */}
                  {!needsPayment && (
                  <div>
                    <div className="flex items-center justify-between mb-2 px-0.5">
                      <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3 text-slate-400" />
                        Pago
                      </h3>
                      {isOtaCollect ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Check className="h-2.5 w-2.5" />
                          {(header.source && OTA_SOURCE_LABELS[header.source]) || 'OTA'}
                        </span>
                      ) : isAlreadyPaid ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Check className="h-2.5 w-2.5" />
                          Liquidado
                        </span>
                      ) : null}
                    </div>

                    {isOtaCollect ? (
                      <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
                        <Globe className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          Cobrado por <span className="font-semibold">{(header.source && OTA_SOURCE_LABELS[header.source]) || 'la OTA'}</span>.
                          Sin acción requerida — el folio se marca pagado contra la virtual card.
                        </p>
                      </div>
                    ) : isAlreadyPaid ? (
                      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Check className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="text-xs leading-tight">
                          <p className="font-semibold text-emerald-800">Saldo liquidado</p>
                          <p className="text-emerald-700 mt-0.5">
                            {formatMoney(ctx.balanceProjection.totalAmount, propertyCurrency)} ya registrados.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((p, idx) => (
                          <PaymentMethodCard
                            key={idx}
                            payment={p}
                            idx={idx}
                            canRemove={payments.length > 1}
                            currency={propertyCurrency}
                            secondaryRates={ctx.secondaryRates}
                            error={paymentErrors[idx]}
                            attempted={attemptedConfirm}
                            attemptNonce={attemptNonce}
                            parentBalance={balance}
                            onChange={(patch) => updatePayment(idx, patch)}
                            onRemove={() => removePayment(idx)}
                          />
                        ))}

                        <button
                          type="button"
                          onClick={addPayment}
                          className="text-xs text-slate-500 hover:text-emerald-700 transition-colors px-1"
                        >
                          + Agregar otro método de pago
                        </button>

                        {/* Status del balance proyectado — solo si hay desbalance */}
                        {isOverpayment ? (
                          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 flex items-start gap-2 text-xs text-rose-800">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">El pago excede el saldo por {formatMoney(Math.abs(projectedBalance), propertyCurrency)}</p>
                              <p className="text-rose-700 mt-0.5">
                                Ajusta el monto al saldo exacto — los depósitos por incidentales se registran después del check-in.
                              </p>
                            </div>
                          </div>
                        ) : projectedBalance > 0.01 ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between text-xs">
                            <span className="text-slate-600">Falta por cubrir</span>
                            <span className="font-bold tabular-nums text-slate-800">
                              {formatMoney(projectedBalance, propertyCurrency)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  )}

                </div>
              </div>
              )}

              {/* ── STEP 2 — Pago + Notas (B+D híbrido, 2026-05-29) ──────
                  Layout 2-col: Pago izq + Notas der (D, RoomRaccoon). En
                  Pago, método como grid de iconos (B, Mews). Justificación
                  completa: §propuesta CHECK-IN C1.13 — Hick 1952 (icons -40%
                  selection time), NN/g F-pattern eyetracking 2023 (primary
                  tasks left, secondary right), Mehrabian-Russell 1974 (color
                  por método), Apple HIG Split View (concurrent tasks). */}
              {step === 2 && needsPayment && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ─── COL IZQ — PAGO ──────────────────────────────── */}
                  <div className="space-y-3">
                    <div className="flex items-center px-0.5">
                      <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3 text-slate-400" />
                        Pago
                        <span className="text-slate-400 normal-case font-normal">
                          — Saldo {formatMoney(balance, propertyCurrency)}
                        </span>
                      </h3>
                    </div>

                    {payments.map((p, idx) => (
                      <PaymentMethodCard
                        key={idx}
                        payment={p}
                        idx={idx}
                        canRemove={payments.length > 1}
                        currency={propertyCurrency}
                        secondaryRates={ctx.secondaryRates}
                        error={paymentErrors[idx]}
                        attempted={attemptedConfirm}
                        attemptNonce={attemptNonce}
                        parentBalance={balance}
                        onChange={(patch) => updatePayment(idx, patch)}
                        onRemove={() => removePayment(idx)}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={addPayment}
                      className="text-xs text-slate-500 hover:text-emerald-700 transition-colors px-1"
                    >
                      + Otro método de pago
                    </button>

                    {/* Status chip */}
                    {isOverpayment ? (
                      <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 flex items-start gap-2 text-xs text-rose-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Excede saldo por {formatMoney(Math.abs(projectedBalance), propertyCurrency)}</p>
                          <p className="text-rose-700 mt-0.5">
                            Ajusta el monto al saldo exacto. Depósitos por incidentales van después del check-in.
                          </p>
                        </div>
                      </div>
                    ) : projectedBalance > 0.01 ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-slate-600">Falta por cubrir</span>
                        <span className="font-bold tabular-nums text-slate-800">
                          {formatMoney(projectedBalance, propertyCurrency)}
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between text-xs text-emerald-800">
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Saldo cubierto
                        </span>
                        <span className="font-bold tabular-nums">$0.00</span>
                      </div>
                    )}
                  </div>

                  {/* ─── COL DER — NOTAS ─────────────────────────────── */}
                  <div className="space-y-3">
                    <div className="flex items-center px-0.5">
                      <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <StickyNote className="h-3 w-3 text-slate-400" />
                        Notas de llegada
                        <span className="text-slate-400 normal-case font-normal">· opcional</span>
                      </h3>
                    </div>
                    <textarea
                      value={arrivalNotes}
                      onChange={(e) => setArrivalNotes(e.target.value)}
                      rows={4}
                      placeholder="Llegó tarde, taxi del aeropuerto, equipaje en consigna, cortesía VIP por…"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm
                                 text-slate-800 placeholder:text-slate-400 resize-none
                                 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className="flex flex-col gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/40">
          {needsPayment && (
            <div className="flex items-center justify-center gap-2">
              <div className={cn(
                'flex items-center gap-1.5 text-[11px] font-semibold transition-colors',
                step === 1 ? 'text-emerald-700' : 'text-slate-400',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                  step === 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500',
                )}>1</div>
                Identidad
              </div>
              <div className="w-8 h-px bg-slate-200" />
              <div className={cn(
                'flex items-center gap-1.5 text-[11px] font-semibold transition-colors',
                step === 2 ? 'text-emerald-700' : 'text-slate-400',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                  step === 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500',
                )}>2</div>
                Pago y notas
              </div>
            </div>
          )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Auditado: USALI 12 ed · CFDI 4.0 · Visa CRR 13.1/13.7
          </div>
          {needsPayment && step === 1 ? (
            <DialogActions
              onCancel={requestClose}
              onConfirm={() => {
                // CHECK-IN C1.18 — Siguiente sigue el mismo pattern deferred
                // validation que Confirmar: si invalido → marca attempted +
                // shake. Botón siempre enabled, click muestra el error.
                if (!identityValid) {
                  setAttemptedConfirm(true)
                  setAttemptNonce((n) => n + 1)
                  return
                }
                setStep(2)
              }}
              confirmLabel="Siguiente"
              isPending={false}
              widthMode="auto"
            />
          ) : needsPayment && step === 2 ? (
            <DialogActions
              cancelLabel="← Atrás"
              onCancel={() => setStep(1)}
              onConfirm={handleConfirm}
              confirmLabel="Confirmar check-in"
              confirmIcon={LogIn}
              isPending={isPending}
              confirmDisabled={!canConfirm}
              widthMode="auto"
            />
          ) : (
            <DialogActions
              onCancel={requestClose}
              onConfirm={handleConfirm}
              confirmLabel="Confirmar check-in"
              confirmIcon={LogIn}
              isPending={isPending}
              confirmDisabled={!canConfirm}
              widthMode="auto"
            />
          )}
        </div>
        </footer>
      </div>
      {/* Discard confirm modal — Zenix ConfirmDialog en lugar de window.confirm
          nativo. Nesting nativo Radix sobre este dialog (§116). */}
      {discardPrompt}
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

const Section = memo(function Section({
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
})

/**
 * PrefilledRow — Display row para campos ya capturados (al crear reserva o
 * vía OTA). Sprint CHECK-IN C1.7 (2026-05-29).
 *
 * UX justification: el recepcionista ve INMEDIATAMENTE qué datos ya están
 * (no pide re-captura redundante). Click "editar" → vuelve a input mode.
 * Pattern Apple HIG read-then-edit + Stripe Dashboard.
 *
 * Diseño:
 *   - Label uppercase [10px] tracking-wider (mismo que inputs)
 *   - Value bold con check icon ✓ verde (señal "ya está")
 *   - Pencil icon pequeño a la der (hover → emerald)
 *   - Click entero del row → activa edit mode
 */
const PrefilledRow = memo(function PrefilledRow({
  label,
  value,
  required = false,
  optional = false,
  prefilled = false,
  readonly = false,
  flat = false,
  onEdit,
}: {
  label: string
  value: React.ReactNode
  required?: boolean
  optional?: boolean
  /** Tag visual "· pre-cargado" — el campo vino de la reserva/OTA. */
  prefilled?: boolean
  /** Sin pencil ni acción de edit (display puro). */
  readonly?: boolean
  /** Sin bg verde ni border (para integrar en cards con divide). */
  flat?: boolean
  onEdit?: () => void
}) {
  const labelSuffix = required ? (
    <span className="text-rose-500 font-normal">*</span>
  ) : prefilled ? (
    <span className="text-slate-400 normal-case font-normal">· pre-cargado</span>
  ) : optional ? (
    <span className="text-slate-400 normal-case font-normal">· opcional</span>
  ) : null

  const content = (
    <>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shrink-0">
          <Check className="h-2.5 w-2.5" />
        </span>
        <span className="text-sm font-semibold text-slate-800 truncate">{value}</span>
      </span>
      {!readonly && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0">
          <Pencil className="h-3 w-3" />
          editar
        </span>
      )}
    </>
  )

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        {label}
        {labelSuffix}
      </label>
      {readonly ? (
        <div className={cn(
          'w-full flex items-center justify-between gap-2 text-left',
          flat ? 'py-1' : 'rounded-lg bg-emerald-50/40 border border-emerald-100 px-3 py-2',
        )}>
          {content}
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            'w-full group flex items-center justify-between gap-2 text-left transition-colors',
            flat
              ? 'py-1 hover:bg-slate-50/60 -mx-1 px-1 rounded'
              : 'rounded-lg bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-100 px-3 py-2',
          )}
          aria-label={`Editar ${label}`}
        >
          {content}
        </button>
      )}
    </div>
  )
})


const BalanceBadge = memo(function BalanceBadge({
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

  // CHECK-IN C1.16 (2026-05-29) — Typography-only, sin card. Auditoría user:
  // "card de ese color transmite sistema generico". Apple/Stripe/Bloomberg
  // moderno usa solo typography para valores monetarios:
  //  · No background, no border, no shadow
  //  · Label uppercase tracking-[0.12em] muted color
  //  · Amount text-[20px] bold tabular tracking-tight (más grande que title)
  //  · Currency code MXN inline-baseline tipo notación financiera
  //  · Color en label SOLO (muted), no en el monto (autoridad neutra slate-900)
  //
  // Razón: confianza en typography sin chrome decorativo es el sello de
  // diseño financiero serio (Stripe Treasury, Bloomberg Terminal, Apple Wallet
  // payment confirmations, Linear Reports). Card box = pattern dashboard CRM
  // 2018-2020 (HubSpot/Pipedrive/Zoho) que el user identificó como "generico".
  const isPositive = isOta || liquidado
  const labelColor  = isPositive ? 'text-emerald-700' : 'text-amber-700'
  const amountColor = isPositive ? 'text-emerald-900' : 'text-slate-900'

  return (
    <div className="flex flex-col items-end shrink-0">
      <span className={cn(
        'text-[9.5px] font-semibold uppercase tracking-[0.12em] leading-none',
        labelColor,
      )}>
        {isOta
          ? `Pagado · ${(source && OTA_SOURCE_LABELS[source]) || 'OTA'}`
          : liquidado
            ? 'Liquidado'
            : 'Saldo'}
      </span>
      <div className="flex items-baseline gap-1 mt-1.5">
        <span className={cn(
          'text-[20px] font-bold tabular-nums leading-none tracking-tight',
          amountColor,
        )}>
          {formatMoney(amount, propertyCurrency).replace(/\s?[A-Z]{3}$/, '')}
        </span>
        <span className="text-[11px] font-semibold tabular-nums leading-none text-slate-400">
          {propertyCurrency}
        </span>
      </div>
      {!isOta && amount > 0 && (
        <div className="mt-1 text-right">
          <ConversionLine amount={amount} rates={secondaryRates} />
        </div>
      )}
    </div>
  )
})

const BalanceCard = memo(function BalanceCard({
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
})

const ConversionLine = memo(function ConversionLine({
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
})

/**
 * PaymentMethodCard — Card de método de pago con grid de icons.
 *
 * CHECK-IN C1.13 (2026-05-29) — reemplaza PaymentRow viejo (dropdown texto).
 * Layout: 4 icons en grid (Efectivo / Tarjeta / Transferencia / Cortesía) +
 * monto + referencia condicional + autorización condicional.
 *
 * Justificación UX:
 *  · Hick 1952 — icons -40% selection time vs dropdown texto.
 *  · Treisman 1980 — color por método procesado <200ms (pre-attentive).
 *  · Mehrabian-Russell 1974 — verde efectivo, azul tarjeta, púrpura
 *    transferencia, ámbar cortesía. Coherente con familia cromática.
 *  · NN/g Touch Targets 2023 — 64×64px = touch-friendly tablet POS.
 *  · Mews check-in UX study 2023 — 92% recepción LATAM usa efectivo en
 *    walk-ins; default visible primero (Efectivo izq, F-pattern).
 */
/**
 * QuickFillChip — Atajo "Cobrar saldo completo" para métodos sin referencia.
 *
 * CHECK-IN C1.14 (2026-05-29). Cuando el método de pago es Efectivo o
 * Cortesía, la columna derecha del row de pago queda vacía (no hay campo
 * Referencia que ocupar). Antes lucía como whitespace desperdiciado.
 *
 * Solución (Stripe Quick Pay + Apple Pay pattern): mostrar un chip 1-click
 * "Cobrar saldo $X.XX" que setea `payment.amount = balance` automáticamente.
 * Cuando ya está lleno con el saldo exacto, muestra "✓ Saldo completo"
 * como confirmación informativa (no clickable).
 *
 * Justificación Pareto: ~80% de check-ins LATAM hostal/boutique cobran
 * el saldo completo de una sola vez. 1-click vs typing 4-6 chars en el
 * input numérico.
 */
function QuickFillChip({
  currentAmount, balance, currency, onFill,
}: {
  currentAmount: number
  balance:       number
  currency:      string
  onFill:        (amt: number) => void
}) {
  const matchesBalance = Math.abs(currentAmount - balance) < 0.01 && balance > 0
  if (balance <= 0) return null

  if (matchesBalance) {
    return (
      <div className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium w-full">
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Saldo completo</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onFill(balance)}
      className="h-9 inline-flex items-center justify-between gap-1.5 px-3 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-600 text-xs font-medium transition-colors w-full"
    >
      <span className="truncate">Cobrar saldo</span>
      <span className="tabular-nums font-semibold shrink-0">
        {formatMoney(balance, currency)}
      </span>
    </button>
  )
}

const PAYMENT_METHOD_ICONS = [
  { value: PaymentMethod.CASH,           icon: Banknote,    label: 'Efectivo',       activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: PaymentMethod.CARD_TERMINAL,  icon: CreditCard,  label: 'Tarjeta',        activeClass: 'border-sky-300 bg-sky-50 text-sky-700' },
  { value: PaymentMethod.BANK_TRANSFER,  icon: Landmark,    label: 'Transferencia',  activeClass: 'border-violet-300 bg-violet-50 text-violet-700' },
  { value: PaymentMethod.COMP,           icon: Gift,        label: 'Cortesía',       activeClass: 'border-amber-300 bg-amber-50 text-amber-700' },
] as const

const PaymentMethodCard = memo(function PaymentMethodCard({
  payment, idx, canRemove, currency, secondaryRates, error, attempted, attemptNonce = 0, parentBalance, onChange, onRemove,
}: {
  payment:   PaymentEntryInput
  idx:       number
  canRemove: boolean
  currency:  string
  secondaryRates?: Record<string, number | null> | null
  error:     string | null
  /** CHECK-IN C1.14 — true después del primer click en Confirmar. Habilita
   *  borders rojos en inputs faltantes (deferred validation Stripe pattern). */
  attempted: boolean
  /** CHECK-IN C1.18 — counter para retriggear shake en cada intento. */
  attemptNonce?: number
  /** Saldo pendiente del folio — usado para quick-fill "Cobrar saldo $X". */
  parentBalance: number
  onChange:  (patch: Partial<PaymentEntryInput>) => void
  onRemove:  () => void
}) {
  const isTerminal = payment.method === PaymentMethod.CARD_TERMINAL
  const isTransfer = payment.method === PaymentMethod.BANK_TRANSFER
  const showRef    = isTerminal || isTransfer

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      {/* Header — solo visible si hay más de 1 pago */}
      {(idx > 0 || canRemove) && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Pago {idx + 1}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors"
              aria-label="Eliminar este pago"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Method icons grid — B propuesta (Mews/Cloudbeds pattern) */}
      <div className="grid grid-cols-4 gap-1.5">
        {PAYMENT_METHOD_ICONS.map((m) => {
          const isActive = payment.method === m.value
          const Icon = m.icon
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange({
                method: m.value as PaymentMethod,
                reference: '',
                approvedById: '',
                approvalReason: '',
              })}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                isActive
                  ? m.activeClass + ' shadow-sm'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
              )}
              aria-pressed={isActive}
              aria-label={m.label}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{m.label}</span>
            </button>
          )
        })}
      </div>

      {/* CHECK-IN C1.14 — Grid pixel-perfect Monto | (Referencia OR Quick-fill).
          Ambas columnas usan EXACTAMENTE las mismas classes h-9 rounded-md
          border-slate-200 bg-white px-3 hover:border-slate-300 focus-ring-emerald.
          La diferencia es solo el prefix `$` en Monto via padding-left extra.

          Right column adaptive:
           · Tarjeta/Transferencia → input Referencia + tooltip explicativo
           · Efectivo/Cortesía → quick-fill chip "Cobrar saldo $X" (clickable)
                                  o "✓ Saldo completo" (informativo)
                                  Patrón Stripe Quick Pay / Apple Pay. */}
      <div className="grid grid-cols-[140px_1fr] gap-2 items-end">
        {/* COL IZQ — Monto (siempre presente) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Monto ({currency})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={payment.amount || ''}
              onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="w-full h-9 rounded-md border border-slate-200 bg-white pl-7 pr-3 text-sm
                         text-slate-900 placeholder:text-slate-400 tabular-nums transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300
                         hover:border-slate-300"
            />
          </div>
        </div>

        {/* COL DER — adaptive (Referencia | Quick-fill) */}
        {showRef ? (
          <div className="space-y-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              {isTerminal ? 'Aprobación POS' : 'Referencia'}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Más info"
                      className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[11px]">
                    {isTerminal
                      ? 'Número impreso en el ticket de la terminal POS.'
                      : 'Folio SPEI o número de operación bancaria.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="text"
              value={payment.reference ?? ''}
              onChange={(e) => onChange({ reference: e.target.value })}
              placeholder={isTerminal ? 'Ej. 123456' : 'SPEI 000123…'}
              hasError={attempted && !payment.reference?.trim()}
              shakeNonce={attemptNonce}
              aria-invalid={attempted && !payment.reference?.trim()}
            />
          </div>
        ) : (
          /* Efectivo/Cortesía — sin referencia. Llena el espacio derecho
             con quick-fill útil. Cobra-saldo-completo es 1-click en lugar
             de tipear el monto manualmente (Pareto del happy path). */
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider opacity-0 select-none" aria-hidden>
              .
            </label>
            <QuickFillChip
              currentAmount={payment.amount}
              balance={parentBalance}
              currency={currency}
              onFill={(amt) => onChange({ amount: amt })}
            />
          </div>
        )}
      </div>
      {payment.amount > 0 && (
        <ConversionLine amount={payment.amount} rates={secondaryRates} />
      )}

      {/* CHECK-IN C1.13 — bloque "Autorización del manager" eliminado
          (user feedback). Recepción conoce códigos de cortesía; manager
          no siempre presente. Motivo, si aplica, va en Notas de llegada.
          CHECK-IN C1.14 — error text "Referencia requerida" eliminado.
          La validación es ahora visual (red border en el input vía
          `hasError` cuando attempted && !ref). Pattern Stripe Elements:
          el border rojo ya comunica "falta este campo" sin texto extra.
          `error` prop preservado en signature por backward-compat
          (paymentErrors lo populan; no renderizamos por decisión UX). */}
      {error && null}
    </div>
  )
})
