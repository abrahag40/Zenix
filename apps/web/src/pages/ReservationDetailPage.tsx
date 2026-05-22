import React, { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, differenceInDays, differenceInHours } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Moon,
  Users,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  LogOut,
  LogIn,
  RotateCcw,
  Calendar,
  CreditCard,
  HandCoins,
  Tag,
  Hash,
  Clock,
  AlertTriangle,
  KeyRound,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Camera,
  Upload,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { guestStaysApi } from '../modules/rooms/api/guest-stays.api'
import {
  OTA_ACCENT_COLORS,
  STAY_STATUS_COLORS,
} from '../modules/rooms/utils/timeline.constants'
import { getStayStatus } from '../modules/rooms/utils/timeline.utils'
import { PaymentStatusBadge } from '../modules/rooms/components/shared/PaymentStatusBadge'
import { OTA_OPTIONS } from '../modules/rooms/components/dialogs/CheckInDialog'
import { EarlyCheckoutDialog } from '../modules/rooms/components/dialogs/EarlyCheckoutDialog'
import { useCheckout, useRevertNoShow, useEarlyCheckout, useStayPayments, useRegisterPayment, useVoidPayment, useUpdateGuestStay } from '../modules/rooms/hooks/useGuestStays'
import { PaymentHeroCard } from '../modules/rooms/components/shared/PaymentHeroCard'
import { PaymentMovementsList } from '../modules/rooms/components/shared/PaymentMovementsList'
import { ReservationNotesThread } from '../modules/rooms/components/shared/ReservationNotesThread'
import { RegisterPaymentDialog } from '../modules/rooms/components/shared/RegisterPaymentDialog'
import { VoidPaymentDialog } from '../modules/rooms/components/shared/VoidPaymentDialog'
import type { PaymentLogDto } from '../modules/rooms/api/guest-stays.api'
import { KeyDeliveryType } from '@zenix/shared'
import type { GuestStayDto } from '@zenix/shared'
import type { PaymentStatus } from '../modules/rooms/types/timeline.types'

// ─── Timeline (audit history) ─────────────────────────────────────────────────

interface TimelineEntry {
  id: string
  source: 'STAY' | 'JOURNEY'
  eventType: string
  occurredAt: string
  actorName: string | null
  metadata: Record<string, unknown> | null
}

/** Writing canónico por evento — Sprint 2026-05-19.
 *
 *  Análisis: cada operación del PMS escribe un audit event con payload
 *  específico. El label genérico ("Cambio de habitación") esconde el QUÉ y
 *  el DÓNDE: en una reserva con 3 cambios, todas las líneas se ven idénticas.
 *  Cumplimos NN/g H1 (visibility of system status) + H3 (user control) +
 *  AHLEI Front Office Standards §8 (audit trail granularity): cada evento
 *  debe ser auto-suficiente para reconstruir el qué/dónde/cuándo/quién.
 *
 *  Convención de writing:
 *   - Verbo en pasado, voz activa breve ("Check-in registrado", no "Se realizó el check-in")
 *   - Cuando hay transición A→B, mostrarla siempre ("Hab. A1 → Hab. A2")
 *   - Cuando hay solo "destino" (creación/llegada), mostrar destino ("en Hab. A1")
 *   - Subtítulo lleva actor + contexto suplementario, nunca duplica info del título
 */
type Meta = Record<string, unknown> | null
type Entry = TimelineEntry

function s(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function room(n: unknown): string | null {
  const num = s(n)
  return num ? `Hab. ${num}` : null
}

interface RenderedEvent {
  label: string
  subtitle?: string
  color: string
}

function renderEvent(entry: Entry): RenderedEvent {
  const m: Meta = entry.metadata ?? null
  const actorSuffix = entry.actorName ? `por ${entry.actorName}` : null

  // Helper para concatenar subtítulo: actor + extras (sin duplicar comas).
  const sub = (...parts: Array<string | null | undefined>): string | undefined => {
    const list = parts.filter((p): p is string => !!p && p.length > 0)
    if (actorSuffix) list.push(actorSuffix)
    return list.length > 0 ? list.join(' · ') : undefined
  }

  switch (entry.eventType) {
    // ── Stay-level ────────────────────────────────────────────────────────
    case 'CREATED':
    case 'STAY_CREATED':
    case 'JOURNEY_CREATED': {
      const r = room(m?.roomNumber ?? m?.toRoomNumber)
      return {
        color: 'bg-slate-300',
        label: r ? `Reserva creada en ${r}` : 'Reserva creada',
        subtitle: sub(),
      }
    }
    case 'EDITED':
    case 'STAY_UPDATED': {
      const fields = Array.isArray(m?.fields) ? (m!.fields as string[]).join(', ') : null
      return {
        color: 'bg-slate-300',
        label: 'Datos editados',
        subtitle: sub(fields ? `Campos: ${fields}` : null),
      }
    }
    case 'CANCELLED': {
      const initiator = s(m?.cancelInitiator) ?? s(m?.initiator)
      const reason = s(m?.cancelReason) ?? s(m?.reason)
      const initLabel = initiator === 'GUEST'
        ? 'cancelada por el huésped'
        : initiator === 'OTA'
          ? 'cancelada por la OTA'
          : initiator === 'HOTEL'
            ? 'cancelada por el hotel'
            : initiator === 'ADMIN_ERROR'
              ? 'cancelada por corrección administrativa'
              : null
      return {
        color: 'bg-red-400',
        label: initLabel ? `Reserva ${initLabel}` : 'Reserva cancelada',
        subtitle: sub(reason),
      }
    }
    case 'RESTORED': {
      return {
        color: 'bg-emerald-400',
        label: 'Reserva restaurada',
        subtitle: sub(),
      }
    }

    // ── Check-in / Check-out ──────────────────────────────────────────────
    case 'CHECKED_IN': {
      const r = room(m?.roomNumber ?? m?.toRoomNumber)
      return {
        color: 'bg-emerald-400',
        label: r ? `Check-in registrado en ${r}` : 'Check-in registrado',
        subtitle: sub(),
      }
    }
    case 'CHECKED_OUT': {
      const early = m?.early === true || m?.isEarly === true
      return {
        color: early ? 'bg-amber-400' : 'bg-emerald-400',
        label: early ? 'Checkout anticipado realizado' : 'Checkout realizado',
        subtitle: sub(s(m?.notes)),
      }
    }
    case 'EARLY_CHECKOUT': {
      return {
        color: 'bg-amber-400',
        label: 'Checkout anticipado realizado',
        subtitle: sub(s(m?.notes)),
      }
    }

    // ── Room moves (3 sub-cases) ──────────────────────────────────────────
    case 'ROOM_MOVE_EXECUTED': {
      const from = room(m?.fromRoomNumber)
      const to = room(m?.toRoomNumber)
      const sub2 = s(m?.subType)
      const mode = s(m?.mode)

      if (sub2 === 'MOVE_CONFIRMED') {
        const r = room(m?.roomNumber)
        const prev = room(m?.previousRoomNumber)
        return {
          color: 'bg-blue-500',
          label: r ? `Mudanza confirmada — llave entregada en ${r}` : 'Mudanza confirmada',
          subtitle: sub(prev ? `Cuarto previo: ${prev}` : null),
        }
      }
      if (mode === 'EXTENSION_REASSIGN') {
        return {
          color: 'bg-blue-400',
          label: from && to
            ? `Reasignación de habitación: ${from} → ${to}`
            : to
              ? `Reasignación de habitación a ${to}`
              : 'Reasignación de habitación',
          subtitle: sub('Segmento futuro re-asignado'),
        }
      }
      // Default: mid-stay room move via executeMidStayRoomMove
      const eff = s(m?.effectiveDate)
      const effLabel = eff ? format(new Date(eff), "d 'de' MMM", { locale: es }) : null
      return {
        color: 'bg-blue-400',
        label: from && to
          ? `Cambio de habitación: ${from} → ${to}`
          : to
            ? `Cambio de habitación a ${to}`
            : 'Cambio de habitación',
        subtitle: sub(effLabel ? `Efectivo desde ${effLabel}` : null),
      }
    }

    // ── Extensions ────────────────────────────────────────────────────────
    case 'EXTENSION_APPROVED': {
      const newCheckOut = s(m?.newCheckOut) ?? s(m?.checkOut)
      const r = room(m?.toRoomNumber ?? m?.roomNumber)
      const dateLabel = newCheckOut
        ? format(new Date(newCheckOut), "d 'de' MMM", { locale: es })
        : null
      const where = r ? ` en ${r}` : ''
      return {
        color: 'bg-indigo-400',
        label: dateLabel
          ? `Extensión aprobada hasta ${dateLabel}${where}`
          : `Extensión aprobada${where}`,
        subtitle: sub(),
      }
    }
    case 'EXTENSION_CANCELLED': {
      return {
        color: 'bg-amber-400',
        label: 'Extensión cancelada',
        subtitle: sub(s(m?.reason) ?? 'Fecha de salida revertida'),
      }
    }

    // ── Split ─────────────────────────────────────────────────────────────
    case 'JOURNEY_SPLIT': {
      const n = typeof m?.partsCount === 'number'
        ? m.partsCount
        : Array.isArray(m?.parts) ? (m!.parts as unknown[]).length : null
      return {
        color: 'bg-indigo-400',
        label: n ? `Reserva dividida en ${n} habitaciones` : 'Reserva dividida',
        subtitle: sub(),
      }
    }

    // ── No-show ───────────────────────────────────────────────────────────
    case 'NO_SHOW_MARKED': {
      const source = s(m?.source)
      const sourceLabel = source === 'NIGHT_AUDIT' ? 'corte nocturno automático' : null
      return {
        color: 'bg-red-400',
        label: 'Marcado como no-show',
        subtitle: sub(sourceLabel ?? s(m?.reason)),
      }
    }
    case 'NO_SHOW_REVERTED': {
      return {
        color: 'bg-amber-400',
        label: 'No-show revertido',
        subtitle: sub(),
      }
    }

    // ── Segments (raros — info interna de journey) ────────────────────────
    case 'SEGMENT_ADDED': {
      const r = room(m?.roomNumber)
      return {
        color: 'bg-indigo-300',
        label: r ? `Segmento agregado en ${r}` : 'Segmento agregado',
        subtitle: sub(),
      }
    }
    case 'SEGMENT_LOCKED': {
      const r = room(m?.roomNumber)
      return {
        color: 'bg-slate-300',
        label: r ? `Segmento finalizado en ${r}` : 'Segmento finalizado',
        subtitle: sub(),
      }
    }

    // ── Payments ──────────────────────────────────────────────────────────
    case 'PAYMENT_REGISTERED': {
      const amount = typeof m?.amount === 'number' ? m.amount : null
      const currency = s(m?.currency) ?? ''
      const method = s(m?.method)
      const amountLabel = amount !== null
        ? `${currency} ${amount.toFixed(2)}`.trim()
        : null
      return {
        color: 'bg-emerald-400',
        label: amountLabel ? `Pago registrado · ${amountLabel}` : 'Pago registrado',
        subtitle: sub(method),
      }
    }
    case 'PAYMENT_VOIDED': {
      return {
        color: 'bg-amber-400',
        label: 'Pago anulado',
        subtitle: sub(s(m?.reason)),
      }
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    default: {
      return {
        color: 'bg-slate-300',
        label: entry.eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        subtitle: sub(),
      }
    }
  }
}

// ─── Key delivery helpers ─────────────────────────────────────────────────────

const KEY_LABELS: Record<KeyDeliveryType, string> = {
  [KeyDeliveryType.PHYSICAL]: 'Llave física',
  [KeyDeliveryType.CARD]:     'Tarjeta magnética',
  [KeyDeliveryType.CODE]:     'Código PIN',
  [KeyDeliveryType.MOBILE]:   'Acceso móvil',
}

// ─── Helper components ────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  mono?: boolean
  copyable?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        <div
          className={cn(
            'text-sm text-slate-800 font-medium mt-0.5',
            mono && 'font-mono',
            copyable && 'select-all cursor-text',
          )}
        >
          {value ?? <span className="text-slate-300">—</span>}
        </div>
      </div>
    </div>
  )
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 overflow-hidden', className)}>
      {children}
    </div>
  )
}

// ─── Currency display Fase 1 (Sprint 2026-05-20) ─────────────────────────────
// Toggle LOCAL al detail page (no global) — ver análisis completo en
// la respuesta del agente al feature request. Patrón Apple HIG paired-content:
// primary = display currency seleccionada, secondary = property currency
// para transparencia fiscal (siempre visible explícitamente).
//
// Rates source = Banxico FIX oficial (vía `checkinContext.secondaryRates`).
// CFDI compliance: este toggle es DISPLAY ONLY — formularios de cobro siguen
// operando en property currency, reportes/CFDI en oficial.

const DISPLAY_CURRENCY_KEY = 'zenix.detail.displayCurrency'

function useDisplayCurrency(propertyCurrency: string): [string, (c: string) => void] {
  // 'auto' = usar property currency. Otra string = ISO code de display.
  const [stored, setStored] = useState<string>(() => {
    if (typeof window === 'undefined') return propertyCurrency
    return window.localStorage.getItem(DISPLAY_CURRENCY_KEY) || propertyCurrency
  })
  const setter = useCallback((next: string) => {
    setStored(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, next)
    }
  }, [])
  return [stored, setter]
}

function CurrencySwitcher({
  propertyCurrency,
  secondaryRates,
  value,
  onChange,
}: {
  propertyCurrency: string
  secondaryRates?: Record<string, number | null> | null
  value: string
  onChange: (c: string) => void
}) {
  // Lista de opciones: property currency primero + secondaries con rate válido.
  const options = [propertyCurrency]
  if (secondaryRates) {
    for (const [code, rate] of Object.entries(secondaryRates)) {
      if (rate && rate > 0 && code !== propertyCurrency) options.push(code)
    }
  }
  if (options.length <= 1) return null // Sin secondary rates: hide

  return (
    <div className="flex items-center gap-1.5 bg-slate-100/80 border border-slate-200 rounded-full px-2 py-1">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
        Mostrar en
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
        aria-label="Cambiar moneda de visualización"
      >
        {options.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Convierte amount desde su moneda origen → display currency usando secondaryRates.
 * Bug fix 2026-05-20: aceptar `fromCurrency` per-call (no asumir siempre property
 * currency). El backend de tax-breakdown devuelve montos en `stay.currency` que
 * puede diferir del propertyCurrency. Sin este parámetro, el toggle "Mostrar en
 * MXN" no convertía valores que ya vienen en USD del taxBreakdown.
 *
 * secondaryRates es un mapa rates RELATIVE A propertyCurrency:
 *   secondaryRates[X] = "1 unidad propertyCurrency = X unidades de moneda X"
 *
 * Para convertir A→B pasamos por propertyCurrency:
 *   amount_in_B = amount_in_A × (rate[A→property] × rate[property→B])
 *               = amount_in_A × (1/rate[A]) × rate[B]
 *               = amount_in_A × (rate[B] / rate[A])
 *
 * Donde rate[propertyCurrency] ≡ 1.
 */
function useMoneyDisplay(
  propertyCurrency: string,
  displayCurrency: string,
  secondaryRates?: Record<string, number | null> | null,
) {
  return useCallback((amount: number, fromCurrency?: string) => {
    const source = fromCurrency ?? propertyCurrency

    const decimalsFor = (c: string): number =>
      ['JPY', 'KRW', 'CLP', 'COP', 'PYG', 'VND', 'IDR'].includes(c) ? 0
        : ['KWD', 'BHD', 'OMR', 'JOD'].includes(c) ? 3 : 2

    const fmt = (val: number, currency: string) => {
      const d = decimalsFor(currency)
      return `${currency} ${val.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`
    }

    const sourceFmt = fmt(amount, source)

    // Si display === source, no hay conversión necesaria (caso común).
    if (displayCurrency === source) {
      return { primary: sourceFmt, secondary: null as string | null }
    }

    // Resolver rates: propertyCurrency tiene rate implícito = 1.
    const rateOf = (c: string): number | null => {
      if (c === propertyCurrency) return 1
      const r = secondaryRates?.[c]
      return r && r > 0 ? r : null
    }

    const fromRate = rateOf(source)
    const toRate = rateOf(displayCurrency)
    if (!fromRate || !toRate) {
      // No rate disponible — devuelve en moneda origen sin conversión.
      return { primary: sourceFmt, secondary: null }
    }

    const converted = amount * (toRate / fromRate)
    return { primary: fmt(converted, displayCurrency), secondary: sourceFmt }
  }, [propertyCurrency, displayCurrency, secondaryRates])
}

// MoneyDisplay — render helper. Cuando hay conversión activa muestra
// `[DISPLAY GRANDE]` + `≈ [PROPERTY pequeño]` debajo. Apple HIG paired-info.
function MoneyDisplay({
  primary, secondary, className,
}: {
  primary: string
  secondary: string | null
  className?: string
}) {
  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <span className="font-mono tabular-nums">{primary}</span>
      {secondary && (
        <span className="text-[10px] text-slate-400 font-mono tabular-nums leading-tight">
          ≈ {secondary}
        </span>
      )}
    </span>
  )
}

// ─── WhatsApp brand icon (SVG inline — Lucide no lo trae) ────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.099-.473-.15-.673.15-.197.297-.771.964-.945 1.162-.175.195-.349.225-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.777 0-3.555-.477-5.116-1.378l-.366-.22-3.788.997.999-3.7-.249-.378C2.526 15.401 1.998 13.589 1.998 11.71c.003-5.45 4.437-9.884 9.95-9.884c2.654.001 5.151 1.034 7.025 2.91c1.877 1.876 2.909 4.374 2.909 7.027c-.003 5.45-4.437 9.884-9.93 9.884M20.52 3.449C18.24 1.245 15.24 0 12.045 0C5.463 0 .105 5.334.10 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.746.943 3.71 1.444 5.71 1.447h.006c6.585 0 11.944-5.336 11.949-11.896 0-3.18-1.24-6.165-3.495-8.4"/>
    </svg>
  )
}

// ─── GuestInfoLine — Apple Mail row pattern ──────────────────────────────────
// Layout: [avatar tinted] [label / value] [inline actions]
// Actions soportadas: copy (clipboard), href (tel/mailto/wa.me), custom button.
// Value en text-base font-semibold para legibilidad (NN/g typography: cuerpo
// principal min 14px, idealmente 15-16px en cards densos como este).
type LineAction =
  | { kind: 'copy'; tooltip?: string }
  | { kind: 'link'; href: string; target?: '_blank'; icon: React.ReactNode; tooltip: string; tone?: 'emerald' | 'blue' | 'slate' }

function GuestInfoLine({
  icon: Icon,
  iconBg,
  label,
  value,
  rawValue,
  actions,
}: {
  icon: React.ElementType
  iconBg: string
  label: string
  value: React.ReactNode
  rawValue?: string | null
  actions?: LineAction[]
}) {
  const [copied, setCopied] = useState(false)
  const doCopy = useCallback(() => {
    if (!rawValue) return
    void navigator.clipboard?.writeText(rawValue).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [rawValue])

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0">
      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="text-base font-semibold text-slate-800 mt-0.5 truncate">{value}</div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((a, i) => {
            if (a.kind === 'copy') {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={doCopy}
                  className="h-7 w-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors"
                  title={a.tooltip ?? 'Copiar'}
                  aria-label={a.tooltip ?? 'Copiar al portapapeles'}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )
            }
            const toneClass = {
              emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
              blue:    'bg-blue-50 text-blue-700 hover:bg-blue-100',
              slate:   'bg-slate-50 text-slate-600 hover:bg-slate-100',
            }[a.tone ?? 'slate']
            return (
              <a
                key={i}
                href={a.href}
                target={a.target}
                rel={a.target === '_blank' ? 'noopener noreferrer' : undefined}
                className={cn('h-7 w-7 rounded-full flex items-center justify-center transition-colors', toneClass)}
                title={a.tooltip}
                aria-label={a.tooltip}
              >
                {a.icon}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── WebcamCaptureModal — Apple Photos-style live capture ─────────────────────
// getUserMedia + <video> live preview + canvas snapshot. Sin extras: solo
// captura, retorna dataURL. Stream se libera en cleanup (CRÍTICO para no
// dejar la webcam encendida — security/privacy).
function WebcamCaptureModal({
  open, onClose, onCapture,
}: {
  open: boolean
  onClose: () => void
  onCapture: (dataUrl: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    let localStream: MediaStream | null = null

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta acceso a cámara. Usa el botón "Cargar archivo".')
      return
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
        localStream = s
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Error de cámara'
        setError(msg.includes('Permission') ? 'Permiso de cámara denegado. Revisa los ajustes del navegador.' : 'No se pudo acceder a la cámara.')
      })

    return () => {
      cancelled = true
      localStream?.getTracks().forEach((t) => t.stop())
      setStream(null)
      setSnapshot(null)
      setError(null)
    }
  }, [open])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setSnapshot(canvas.toDataURL('image/jpeg', 0.85))
  }, [])

  const handleConfirm = useCallback(() => {
    if (!snapshot) return
    onCapture(snapshot)
    onClose()
  }, [snapshot, onCapture, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Captura de documento con cámara"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Capturar foto del documento</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="bg-slate-900 aspect-[4/3] flex items-center justify-center relative">
          {error ? (
            <p className="text-white/80 text-sm text-center p-6">{error}</p>
          ) : snapshot ? (
            <img src={snapshot} alt="Captura" className="w-full h-full object-contain" />
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-contain" autoPlay muted playsInline />
              {!stream && (
                <p className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                  Iniciando cámara…
                </p>
              )}
            </>
          )}
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2 bg-slate-50">
          {snapshot ? (
            <>
              <button
                type="button"
                onClick={() => setSnapshot(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Tomar de nuevo
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full"
              >
                Usar esta foto
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!stream || !!error}
              onClick={handleCapture}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 inline-block mr-1" />
              Capturar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ContactRow — variante de CategoryCard sin borde propio (vive dentro del
// card padre "Contacto"). Click en el valor copia al portapapeles.
function ContactRow({
  icon: Icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ElementType
  iconBg: string
  label: string
  value: string | null | undefined
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    if (!value) return
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <div className="flex items-start gap-2.5">
      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        {value ? (
          <button
            type="button"
            onClick={handleCopy}
            className="text-sm font-bold text-slate-800 mt-0.5 truncate text-left hover:text-emerald-700 transition-colors flex items-center gap-1.5 w-full"
            title="Click para copiar"
          >
            <span className="truncate">{value}</span>
            {copied
              ? <Check className="h-3 w-3 text-emerald-600 shrink-0" />
              : <Copy className="h-3 w-3 text-slate-300 shrink-0 opacity-0 group-hover:opacity-100" />}
          </button>
        ) : (
          <div className="text-sm text-slate-400 font-normal mt-0.5">—</div>
        )}
      </div>
    </div>
  )
}

// QuickActionButton — Apple HIG action pill. Soporta href para handlers
// nativos (tel:, mailto:, https://wa.me/*). El browser/OS decide app destino.
function QuickActionButton({
  href,
  target,
  icon,
  label,
  tone,
}: {
  href: string
  target?: '_blank'
  icon: string
  label: string
  tone: 'emerald' | 'blue' | 'slate'
}) {
  const toneClass = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    blue:    'bg-blue-600 hover:bg-blue-700 text-white',
    slate:   'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200',
  }[tone]
  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
        'shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95',
        toneClass,
      )}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </a>
  )
}

// ─── Country helpers ─────────────────────────────────────────────────────────
// ISO 3166-1 alpha-2 → emoji flag. Unicode trick: cada letra A-Z = U+1F1E6..F.
// Funciona universalmente sin necesidad de mantener imagen-set por país.
function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return ''
  const upper = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return ''
  const base = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1))
}

// ISO code → nombre localizado en español. Intl.DisplayNames es nativo del
// browser desde 2021 — no requiere librería externa. Cuando código no resuelve
// (p.ej. "MX-DF" legacy), retorna el código mismo como fallback honesto.
function countryFullName(code: string | null | undefined): string {
  if (!code) return ''
  try {
    const dn = new Intl.DisplayNames(['es'], { type: 'region' })
    return dn.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

// MetaRow — Apple Settings list pattern. Avatar circular tinted + label
// uppercase pequeño + valor bold. Divider 1px slate-100 entre filas.
function MetaRow({
  icon: Icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ElementType
  iconBg: string
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0">
      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="text-sm font-bold text-slate-800 mt-0.5 truncate">{value}</div>
      </div>
    </div>
  )
}

// GuestDocumentPhotoCardWithUpload — variante con upload affordances.
// Vive en columna izq del Huésped tab (40%). Estados:
//   - Con foto: thumbnail clickeable lightbox + meta abajo + opción "Reemplazar"
//   - Sin foto: empty state grande con 2 CTAs (Cargar archivo + Tomar con cámara)
// Visa CRR §5.9.2 verification anchor.
function GuestDocumentPhotoCardWithUpload({
  photoUrl,
  documentType,
  guestName,
  actualCheckin,
  onUploadFile,
  onCaptureWebcam,
  isSaving,
}: {
  photoUrl: string | null
  documentType: string | null | undefined
  guestName: string
  actualCheckin: string | null
  onUploadFile: () => void
  onCaptureWebcam: () => void
  isSaving: boolean
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (!photoUrl) {
    // Empty state — Apple HIG card vacía con CTAs claros.
    return (
      <div className="h-full min-h-[260px] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 flex flex-col items-center justify-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          <Camera className="h-6 w-6 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700">Sin foto del documento</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            Capturada al check-in como evidencia (Visa §5.9.2). Cárgala ahora.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-[180px]">
          <button
            type="button"
            disabled={isSaving}
            onClick={onCaptureWebcam}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 shadow-sm disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            Tomar con cámara
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onUploadFile}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Cargar archivo
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden h-full flex flex-col">
        {/* Photo thumbnail clickeable, ocupa lo disponible */}
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={`Ver foto del documento de ${guestName} en tamaño completo`}
          className="relative w-full aspect-[4/3] bg-slate-100 group overflow-hidden"
        >
          <img
            src={photoUrl}
            alt={`Documento de ${guestName}`}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <div className="h-9 w-9 rounded-full bg-white/0 group-hover:bg-white/95 transition-all flex items-center justify-center shadow-sm">
              <ExternalLink className="h-4 w-4 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </button>

        {/* Meta info + reemplazar — content centrado verticalmente para
            absorber whitespace cuando el right column es más alto (e.g.,
            solicitudes especiales largas). 2026-05-20: "Identificación"
            removido — redundante con "Documento capturado". */}
        <div className="p-3 flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
            <Check className="h-3 w-3" />
            Documento capturado
          </div>
          {actualCheckin && (
            <div className="text-[11px] text-slate-500 leading-snug">
              {format(new Date(actualCheckin), "d MMM 'a las' HH:mm", { locale: es })}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mt-1 pt-2 border-t border-slate-100 w-full">
            <button
              type="button"
              disabled={isSaving}
              onClick={onCaptureWebcam}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 transition-colors disabled:opacity-50"
            >
              <Camera className="h-3 w-3" />
              Reemplazar
            </button>
            <span className="text-slate-300 text-[10px]">·</span>
            <button
              type="button"
              disabled={isSaving}
              onClick={onUploadFile}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              Subir archivo
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox fullscreen */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Vista ampliada del documento"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
            className="absolute top-6 right-6 h-9 w-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur"
            aria-label="Cerrar"
          >
            ✕
          </button>
          <img
            src={photoUrl}
            alt={`Documento de ${guestName}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// GuestDocumentPhotoCard — Apple Photos lightbox pattern para detail page.
// Display + click-to-zoom. Upload no se ofrece aquí (vive en el slide); el
// detail page es vista de auditoría. CFDI/Visa CRR §5.9.2: foto es evidencia
// del check-in, por eso prominente como hero secundario.
function GuestDocumentPhotoCard({
  photoUrl,
  documentType,
  documentNumber,
  guestName,
  actualCheckin,
}: {
  photoUrl: string | null
  documentType: string | null | undefined
  documentNumber: string | null | undefined
  guestName: string
  actualCheckin: string | null
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const masked = documentNumber ? `····${documentNumber.slice(-4)}` : null

  if (!photoUrl) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200 mb-2">
          <FileText className="h-5 w-5 text-slate-300" />
        </div>
        <p className="text-xs font-medium text-slate-600">Sin foto del documento</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {actualCheckin
            ? 'No se capturó durante el check-in.'
            : 'Se capturará al confirmar el check-in.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-stretch">
          {/* Photo thumbnail clickeable */}
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Ver foto del documento de ${guestName} en tamaño completo`}
            className="relative w-28 shrink-0 bg-slate-100 group overflow-hidden border-r border-slate-200/80"
          >
            <img
              src={photoUrl}
              alt={`Documento de ${guestName}`}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
              <div className="h-8 w-8 rounded-full bg-white/0 group-hover:bg-white/95 transition-all flex items-center justify-center shadow-sm">
                <ExternalLink className="h-3.5 w-3.5 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </button>

          {/* Detalle */}
          <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
              <Check className="h-3 w-3" />
              Documento capturado
            </div>
            <div className="text-sm font-bold text-slate-800 mt-1 truncate">
              {documentType ? documentType.toUpperCase() : 'Identificación'}
              {masked && <span className="text-slate-400 font-mono font-normal ml-2">{masked}</span>}
            </div>
            {actualCheckin && (
              <div className="text-[11px] text-slate-500 mt-1">
                Capturado al check-in del {format(new Date(actualCheckin), "d 'de' MMM 'a las' HH:mm", { locale: es })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="self-start mt-1.5 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
            >
              Ver en tamaño real →
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox fullscreen — Apple Photos pattern */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxOpen(false)}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Vista ampliada del documento"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
            className="absolute top-6 right-6 h-9 w-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur"
            aria-label="Cerrar"
          >
            ✕
          </button>
          <img
            src={photoUrl}
            alt={`Documento de ${guestName}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// CategoryCard — variante para grid. Apple "context tile" pattern (App Store,
// Maps quick info). Vertical stack: icon avatar + label + value + optional
// secondary line. Permite distribución horizontal eficiente (Gestalt proximity)
// sin perder la jerarquía iconográfica de MetaRow.
function CategoryCard({
  icon: Icon,
  iconBg,
  label,
  value,
  hint,
}: {
  icon: React.ElementType
  iconBg: string
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-2.5">
        <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
          <div className="text-sm font-bold text-slate-800 mt-0.5 truncate leading-tight">{value}</div>
          {hint && <div className="text-[10.5px] text-slate-500 mt-0.5 truncate">{hint}</div>}
        </div>
      </div>
    </div>
  )
}

// ReferenceRow — fila compacta label/value para identifiers. Apple Files
// info-inspector pattern.
function ReferenceRow({
  label,
  value,
  dim = false,
}: {
  label: string
  value: string
  dim?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          'font-mono tabular-nums select-all',
          dim ? 'text-slate-500' : 'text-slate-800 font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  )
}

// PaymentSummaryCard — stats agregadas en el right card del grid Pago.
// Resuelve el "vacío" cuando no hay 2+ métodos: SIEMPRE muestra info útil
// (count, último pago, método principal). Apple Calendar event-detail
// pattern: paired info card que complementa Detalles del cálculo.
function PaymentSummaryCard({
  payments, currency,
}: {
  payments: PaymentLogDto[]
  currency: string
}) {
  const active = payments.filter((p) => !p.voidedAt)
  const totalCollected = active.reduce((sum, p) => sum + Number(p.amount), 0)
  const lastPayment = active[0] // backend returns DESC, so first is latest
  const voidedCount = payments.length - active.length

  const METHOD_LABEL: Record<string, string> = {
    CASH:          'Efectivo',
    CARD_TERMINAL: 'Tarjeta',
    BANK_TRANSFER: 'Transferencia',
    OTA_PREPAID:   'OTA prepago',
    COMP:          'Cortesía',
  }
  const METHOD_TINT: Record<string, string> = {
    CASH:          'bg-emerald-50 text-emerald-700',
    CARD_TERMINAL: 'bg-blue-50 text-blue-700',
    BANK_TRANSFER: 'bg-violet-50 text-violet-700',
    OTA_PREPAID:   'bg-slate-100 text-slate-700',
    COMP:          'bg-amber-50 text-amber-700',
  }

  // Métodos únicos usados (Set)
  const methodsUsed = [...new Set(active.map((p) => p.method))]

  // 2026-05-20 — Layout flex column con justify-between para que cuando el
  // card hermano (Detalles del cálculo) sea más alto (caso QR con líneas
  // IVA+ISH+DSA), este card distribuya su contenido proporcionalmente arriba
  // y abajo, evitando whitespace muerto al pie. Apple HIG paired-panel pattern.
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        <HandCoins className="h-3 w-3" />
        Resumen de cobros
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2 flex-1 flex items-center justify-center">Sin pagos registrados aún.</p>
      ) : (
        <div className="space-y-2.5 text-xs flex-1 flex flex-col justify-center">
          {/* Total cobrado (matches PaymentHeroCard amountPaid) */}
          <div className="flex justify-between items-baseline">
            <span className="text-slate-500">Total cobrado</span>
            <span className="font-mono font-bold text-slate-800 tabular-nums">
              {currency} {totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Conteo */}
          <div className="flex justify-between items-baseline">
            <span className="text-slate-500">{active.length === 1 ? 'Pago registrado' : 'Pagos registrados'}</span>
            <span className="font-semibold text-slate-700 tabular-nums">
              {active.length}
              {voidedCount > 0 && (
                <span className="text-slate-400 font-normal ml-1">
                  · {voidedCount} anulado{voidedCount !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>

          {/* Último cobro */}
          {lastPayment && (
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500">Último cobro</span>
              <span className="text-slate-700 tabular-nums">
                {format(new Date(lastPayment.createdAt), 'dd MMM HH:mm', { locale: es })}
              </span>
            </div>
          )}

          {/* Métodos usados — chips compactos */}
          {methodsUsed.length > 0 && (
            <div className="pt-1 border-t border-slate-100">
              <div className="text-[10px] text-slate-500 mb-1.5">Métodos</div>
              <div className="flex flex-wrap gap-1.5">
                {methodsUsed.map((method) => (
                  <span
                    key={method}
                    className={cn(
                      'inline-flex items-center text-[10px] font-semibold rounded-md px-1.5 py-0.5',
                      METHOD_TINT[method] ?? 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {METHOD_LABEL[method] ?? method}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// PaymentMethodSummary removido 2026-05-20 — reemplazado por
// PaymentSummaryCard (right card del grid 2-col) que cubre el mismo caso de
// uso (visualizar métodos usados) además de stats agregadas.


// StatCard — matches BookingDetailSheet's grid card pattern (Apple HIG: uniform
// card hierarchy across surfaces). Used in detail-page tabs to align visual
// language with the right-side slide.
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ElementType
  tone?: 'neutral' | 'success' | 'warning' | 'info'
}) {
  const toneRing = {
    neutral: 'bg-slate-50',
    success: 'bg-emerald-50/60 border border-emerald-100',
    warning: 'bg-amber-50/60 border border-amber-100',
    info:    'bg-blue-50/60 border border-blue-100',
  }[tone]
  return (
    <div className={cn('rounded-lg p-4', toneRing)}>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {value}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

// ─── CopyableRef — chip de identificador con icono de copia ──────────────────
// Pegado al nombre del huésped en el hero: el ID único de reserva (bookingRef
// cuando existe, GuestStay.id en fallback) acompañado de un click-to-copy. NN/g
// H7 (flexibility): recepcionistas leen este ID en mails y llamadas con OTAs,
// por eso vive arriba a un solo clic en vez de oculto dentro del tab Estadía.

function CopyableRef({ id, accentColor }: { id: string; accentColor: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      toast.success('ID copiado')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar ID de reserva"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold transition-colors group"
      style={{
        backgroundColor: `${accentColor}15`,
        color: accentColor,
        border: `1px solid ${accentColor}30`,
      }}
    >
      <Hash className="h-3 w-3 opacity-60" />
      <span className="select-all">{id}</span>
      {copied
        ? <Check className="h-3 w-3 text-emerald-600" />
        : <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)
  const [showEarlyCheckout, setShowEarlyCheckout] = useState(false)

  const { data, isLoading, isError } = useQuery<GuestStayDto>({
    queryKey: ['guest-stay', id],
    queryFn: () => guestStaysApi.get(id!) as unknown as Promise<GuestStayDto>,
    enabled: !!id,
  })

  const { data: timeline } = useQuery<TimelineEntry[]>({
    queryKey: ['guest-stay-timeline', id],
    queryFn: () => api.get(`/v1/guest-stays/${id}/timeline`),
    enabled: !!id,
    // 2026-05-19 — bug: cache mostraba evento stale tras 3 room moves seguidos.
    // El historial DEBE reflejar cada operación inmediatamente; el costo de
    // re-fetch es bajo (1 query, payload pequeño). Sin staleTime, React Query
    // refetcha en cada montaje + focus.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const checkoutMutation  = useCheckout(data?.propertyId ?? '')
  const revertMutation    = useRevertNoShow(data?.propertyId ?? '')
  const earlyCheckoutMut  = useEarlyCheckout(data?.propertyId ?? '')

  // Payment data — paridad con el slide. Misma queryKey ('payments', stayId)
  // así que si el slide ya las cargó el cache las comparte.
  const paymentsQuery     = useStayPayments(id ?? null)
  const registerPaymentMut = useRegisterPayment(id ?? '', data?.propertyId ?? '')
  const voidPaymentMut    = useVoidPayment(id ?? '', data?.propertyId ?? '')
  const [registerPaymentOpen, setRegisterPaymentOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<PaymentLogDto | null>(null)
  // Current user para distinguir "my messages" vs otros en el chat.
  const currentUser = useAuthStore((s) => s.user)
  const currentUserId = currentUser?.id ?? currentUser?.email ?? ''

  // Upload de foto del documento (file picker + webcam capture).
  const updateMut = useUpdateGuestStay(data?.propertyId ?? '')
  const [webcamOpen, setWebcamOpen] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const handlePhotoSave = useCallback(async (dataUrl: string) => {
    if (!id) return
    try {
      await updateMut.mutateAsync({ stayId: id, patch: { documentPhotoUrl: dataUrl } })
      toast.success('Foto del documento guardada')
      // Invalidar context para refrescar foto en este tab
      qc.invalidateQueries({ queryKey: ['checkin-context', id] })
    } catch {
      // toast.error ya emitido por hook
    }
  }, [id, updateMut, qc])
  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La foto excede 5 MB.')
      e.target.value = ''
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (JPG, PNG, HEIC).')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (result) void handlePhotoSave(result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [handlePhotoSave])

  // Display currency toggle Fase 1 (local al detail page, no global).
  // El default se setea tras cargar checkinContext en useEffect abajo.
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency('MXN')

  // ── Bulk edit mode — Estadía tab (§120 CLAUDE.md pattern, mirror del slide).
  //   Chips editables: Huéspedes (paxCount), Tarifa/noche (ratePerNight).
  //   Chips no editables vía esta ruta: Habitación (MoveRoomDialog aparte),
  //   Canal de venta (no soportado por updateStay), Saldo/Estado (derivados).
  const [stayEditMode, setStayEditMode] = useState(false)
  const [paxDraft, setPaxDraft] = useState<string>('')
  const [rateDraft, setRateDraft] = useState<string>('')
  const enterStayEdit = useCallback(() => {
    setPaxDraft(String(data?.paxCount ?? ''))
    setRateDraft(data?.ratePerNight ? String(data.ratePerNight) : '')
    setStayEditMode(true)
  }, [data?.paxCount, data?.ratePerNight])
  const cancelStayEdit = useCallback(() => {
    setStayEditMode(false)
  }, [])
  const saveStayEdit = useCallback(async () => {
    if (!id || !data) return
    const patch: { paxCount?: number; ratePerNight?: number } = {}
    const paxNum = Number.parseInt(paxDraft, 10)
    if (Number.isFinite(paxNum) && paxNum > 0 && paxNum !== data.paxCount) {
      patch.paxCount = paxNum
    }
    const rateNum = Number.parseFloat(rateDraft)
    const currentRate = data.ratePerNight ? Number.parseFloat(data.ratePerNight) : 0
    if (Number.isFinite(rateNum) && rateNum >= 0 && Math.abs(rateNum - currentRate) > 0.001) {
      patch.ratePerNight = rateNum
    }
    if (Object.keys(patch).length === 0) {
      setStayEditMode(false)
      return
    }
    try {
      await updateMut.mutateAsync({ stayId: id, patch })
      setStayEditMode(false)
    } catch {
      // toast.error ya emitido por el hook
    }
  }, [id, data, paxDraft, rateDraft, updateMut])

  // Guest stats — repeat-guest indicator (Mews + Opera top request).
  const { data: guestStats } = useQuery<{
    previousStaysCount: number
    firstVisitAt: string | null
    lastVisitAt: string | null
    totalNightsHistorical: number
  }>({
    queryKey: ['guest-stats', id],
    queryFn: () => api.get(`/v1/guest-stays/${id}/guest-stats`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })

  // Tax breakdown — jurisdicción-aware. El backend computa según country+state.
  // Frontend NO hardcodea impuestos; sólo renderiza lo que el servicio devuelve.
  const { data: taxBreakdown } = useQuery<{
    jurisdiction: {
      country: string
      countryName: string
      state: string | null
      stateName: string | null
      city: string | null
    }
    currency: string
    base: number
    lineItems: Array<{
      code: string
      label: string
      calculation: string
      rate: number
      amount: number
      detail?: string
    }>
    totalTaxes: number
    total: number
    configured: boolean
    note?: string
  }>({
    queryKey: ['tax-breakdown', id],
    queryFn: () => api.get(`/v1/guest-stays/${id}/tax-breakdown`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })

  // checkin-context contiene paymentModel + secondaryRates + propertyCurrency
  // + stay (con documentPhotoUrl capturada al check-in). Mismo endpoint que
  // el slide. Nota: el GuestStay es ÚNICO por reserva — extensiones y
  // segmentos comparten la misma fila → documentPhotoUrl/guestName/etc
  // se trasladan automáticamente al nuevo bloque sin lógica adicional.
  const { data: checkinContext } = useQuery<{
    paymentModel: 'HOTEL_COLLECT' | 'OTA_COLLECT' | 'HYBRID_DEPOSIT'
    propertyCurrency: string
    secondaryRates?: Record<string, number | null> | null
    stay?: {
      documentPhotoUrl?: string | null
      documentType?: string | null
      documentNumber?: string | null
    }
  }>({
    queryKey: ['checkin-context', id],
    queryFn: () => api.get(`/v1/guest-stays/${id}/checkin-context`),
    enabled: !!id,
    staleTime: 60_000,
  })

  // ── Hooks que dependen de data deben ir ANTES de early returns
  // (React Hooks Rule: orden estable entre renders). useMoneyDisplay
  // se llama con fallback safe cuando data aún no está disponible.
  // Bug fix 2026-05-20: el hook estaba después del early return, lo cual
  // disparaba "Rendered more hooks than during the previous render" cuando
  // pasaba de loading → loaded.
  const propertyCurrency = checkinContext?.propertyCurrency ?? data?.currency ?? 'MXN'
  const formatMoney = useMoneyDisplay(propertyCurrency, displayCurrency, checkinContext?.secondaryRates)

  // Conversor numérico genérico A→B (sin formato). Útil para normalizar
  // amounts a propertyCurrency antes de pasarlos a componentes shared.
  // Bug fix 2026-05-20: balance/totalAmount viven en data.currency (puede
  // ser USD), pero PaymentHeroCard esperaba currency=propertyCurrency → si
  // las monedas diferían, el card mostraba el valor numérico crudo con el
  // label equivocado ($358 etiquetado MXN cuando son 358 USD).
  const convertAmount = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string): number => {
      if (fromCurrency === toCurrency) return amount
      const rateOf = (c: string): number | null => {
        if (c === propertyCurrency) return 1
        const r = checkinContext?.secondaryRates?.[c]
        return r && r > 0 ? r : null
      }
      const fromRate = rateOf(fromCurrency)
      const toRate = rateOf(toCurrency)
      if (!fromRate || !toRate) return amount
      return amount * (toRate / fromRate)
    },
    [propertyCurrency, checkinContext?.secondaryRates],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Cargando reserva…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-sm">No se encontró la reserva.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Volver
        </Button>
      </div>
    )
  }

  const checkIn   = new Date(data.checkinAt)
  const checkOut  = new Date(data.scheduledCheckout)
  const nights    = Math.max(1, differenceInDays(checkOut, checkIn))

  const ratePerNight  = parseFloat(data.ratePerNight)
  const totalAmount   = parseFloat(data.totalAmount)
  const amountPaid    = parseFloat(data.amountPaid)
  const balance       = totalAmount - amountPaid
  const paidPercent   = totalAmount > 0 ? Math.round((amountPaid / totalAmount) * 100) : 0

  const status       = getStayStatus(checkIn, checkOut, data.actualCheckout ? new Date(data.actualCheckout) : undefined)
  const statusColors = STAY_STATUS_COLORS[status]
  const source       = data.source ?? 'other'
  const otaColor     = OTA_ACCENT_COLORS[source] ?? OTA_ACCENT_COLORS.other
  const otaOption    = OTA_OPTIONS.find(o => o.value === source)
  const otaName      = otaOption?.label ?? source

  const isNoShow  = !!data.noShowAt
  const canRevert = isNoShow && differenceInHours(new Date(), new Date(data.noShowAt!)) < 48

  const statusLabel = isNoShow ? 'No-show' : statusColors.label
  const roomNumber  = data.room?.number

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Top bar: Back + Currency toggle ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <CurrencySwitcher
          propertyCurrency={checkinContext?.propertyCurrency ?? data.currency}
          secondaryRates={checkinContext?.secondaryRates}
          value={displayCurrency}
          onChange={setDisplayCurrency}
        />
      </div>

      {/* ── Body: main content + right sidebar (notes + bitácora) ────────
          Apple Mail inspector + Notion right-rail pattern. Sidebar visible
          lg+; en mobile/tablet se colapsa (notes/chat van debajo). */}
      <div className="flex gap-5">
        <div className="flex-1 min-w-0 space-y-5">

      {/* ── Hero card ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: `${otaColor}40` }}
      >
        {/* OTA accent stripe */}
        <div className="h-1" style={{ backgroundColor: otaColor }} />

        {/* Header area — audit 2026-05-20:
            - Avatar User silhouette (Apple Contacts pattern) — identity anchor
              visual instantáneo. Mews/Opera/Cloudbeds consenso.
            - Status pill (stay phase) prominente; source pill mini brand-tinted
              al lado del nombre — diferenciación semántica (NN/g H4).
            - BookingRef compacto sin "#" prefix, secondary metadata.  */}
        <div className="px-6 py-5" style={{ backgroundColor: statusColors.bg }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 flex items-start gap-3">
              {/* Avatar silhouette — User icon lucide en círculo tinted.
                  Lucide User icon es bottom-heavy (head cy=7, hombros y=21 dentro
                  de viewBox 24×24). Para centrarlo ópticamente: icon más pequeño
                  (h-5 w-5) deja padding equilibrado arriba+abajo. */}
              <div
                className="h-12 w-12 rounded-full bg-white/95 border shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center shrink-0"
                style={{ borderColor: `${otaColor}40`, color: statusColors.text }}
                aria-label={data.guestName}
              >
                <User className="h-5 w-5" strokeWidth={1.75} />
              </div>

              <div className="flex-1 min-w-0">
                {/* Status pill (stay phase) — solo, sin source. Prominente. */}
                <div className="mb-1">
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isNoShow ? '#FEE2E2' : `${otaColor}20`,
                      color: isNoShow ? '#B91C1C' : otaColor,
                      border: `1px solid ${isNoShow ? '#FCA5A5' : `${otaColor}40`}`,
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>

                <h1 className="text-2xl font-bold truncate" style={{ color: statusColors.text }}>
                  {data.guestName}
                </h1>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {roomNumber && (
                    <span className="text-sm" style={{ color: `${statusColors.text}99` }}>
                      Habitación {roomNumber}
                    </span>
                  )}
                  {roomNumber && <span className="text-slate-300">·</span>}
                  {/* Source mini-pill — brand-tinted, secondary metadata
                      (Mews/Cloudbeds pattern). Diferente del status pill
                      arriba: este es booking source, no stay phase. */}
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: otaColor }}
                  >
                    {otaName}
                  </span>
                  <span className="text-slate-300">·</span>
                  <CopyableRef id={data.bookingRef ?? data.id} accentColor={otaColor} />
                </div>
              </div>
            </div>

            {/* RIGHT — Panel unificado (Apple Wallet pass style):
                white/glass bg que NO compite con el statusColors del hero,
                semantic accent stripe a la izquierda, balance arriba y CTA
                integrada al pie del MISMO card → un solo "objeto" visual. */}
            {(() => {
              const balanceLabel = balance > 0.01 ? 'Saldo pendiente' : balance < -0.01 ? 'Crédito a favor' : 'Liquidado'
              const balanceTone = balance > 0.01 ? '#B45309' : balance < -0.01 ? '#B45309' : '#047857'
              const accentColor = balance > 0.01 ? '#F59E0B' : balance < -0.01 ? '#F59E0B' : '#10B981'
              const m = formatMoney(Math.abs(balance), data.currency)
              return (
                <div className="flex-shrink-0 w-[230px] rounded-2xl bg-white/95 backdrop-blur shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden relative">
                  {/* Accent stripe top — semantic */}
                  <div className="h-[3px]" style={{ backgroundColor: accentColor }} />

                  {/* Balance section — sin conversion secundaria.
                      Audit 2026-05-20: el Pago tab YA muestra la conversión
                      en el card de Saldo + en el Total fiscal. El top hero
                      es "quick glance"; mostrar 2x la conversion duplica
                      info que el ojo ya procesa abajo. */}
                  <div className="px-4 py-3 text-right">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] opacity-60" style={{ color: balanceTone }}>
                      {balanceLabel}
                    </div>
                    <div className="font-mono tabular-nums text-[17px] font-bold leading-tight mt-0.5" style={{ color: balanceTone }}>
                      {m.primary}
                    </div>
                  </div>

                  {/* CTA section — integrada al pie del MISMO card */}
                  {(() => {
                    if (canRevert) {
                      return (
                        <button
                          type="button"
                          disabled={revertMutation.isPending}
                          onClick={() =>
                            revertMutation.mutate(id!, {
                              onSuccess: () => qc.invalidateQueries({ queryKey: ['guest-stay', id] }),
                            })
                          }
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50/80 hover:bg-amber-100/80 border-t border-amber-200/60 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {revertMutation.isPending ? 'Revirtiendo…' : 'Revertir no-show'}
                        </button>
                      )
                    }
                    if (!isNoShow && status === 'ARRIVING' && !data.actualCheckin) {
                      return (
                        <button
                          type="button"
                          onClick={() => navigate(`/pms?stayId=${id}&action=checkin`)}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Confirmar check-in
                        </button>
                      )
                    }
                    if (!isNoShow && status === 'DEPARTING') {
                      if (showCheckoutConfirm) {
                        return (
                          <div className="flex">
                            <button
                              type="button"
                              onClick={() => setShowCheckoutConfirm(false)}
                              className="flex-1 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 border-t border-slate-200 border-r"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={checkoutMutation.isPending}
                              onClick={() =>
                                checkoutMutation.mutate(id!, {
                                  onSuccess: () => {
                                    setShowCheckoutConfirm(false)
                                    qc.invalidateQueries({ queryKey: ['guest-stay', id] })
                                  },
                                })
                              }
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              {checkoutMutation.isPending ? 'Procesando…' : 'Confirmar'}
                            </button>
                          </div>
                        )
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setShowCheckoutConfirm(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Checkout
                        </button>
                      )
                    }
                    if (!isNoShow && status === 'IN_HOUSE') {
                      return (
                        <button
                          type="button"
                          onClick={() => setShowEarlyCheckout(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50/80 hover:bg-amber-100/80 border-t border-amber-200/60 transition-colors"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Salida anticipada
                        </button>
                      )
                    }
                    return null
                  })()}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── DATES TIMELINE — attached section INSIDE el page hero card.
            2026-05-20 — pegado al hero (mismo patrón que el old quick-stats),
            separado por border-t. Apple Mail thread header pattern: identity
            arriba + meta section dentro del MISMO card. Visible en todos los
            tabs por ser contexto operativo permanente. */}
        <div className="bg-white border-t border-slate-100 px-6 py-4">
          <div className="flex items-stretch gap-3">
            {/* Check-in column */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Check-in
              </div>
              <div className="text-lg font-bold text-slate-900 leading-tight">
                {format(checkIn, 'EEE d MMM', { locale: es })}
              </div>
              <div className="text-sm font-semibold text-slate-700">
                {format(checkIn, 'yyyy', { locale: es })}
              </div>
              {data.actualCheckin ? (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                  <Check className="h-3 w-3" />
                  {format(new Date(data.actualCheckin), 'HH:mm', { locale: es })} registrado
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                  15:00 programado
                </div>
              )}
            </div>

            {/* Timeline middle: línea + nights badge + huéspedes meta */}
            <div className="flex flex-col items-center px-3 shrink-0">
              <div className="flex items-center">
                <div className="h-px w-10 bg-gradient-to-r from-emerald-200/80 via-slate-200 to-slate-200" />
                <div className="relative h-[72px] w-[72px] mx-1">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white to-slate-50 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_10px_rgba(0,0,0,0.04)]" />
                  <div className="relative h-full w-full flex flex-col items-center justify-center">
                    <div className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">
                      {nights}
                    </div>
                    <div className="text-[8.5px] font-semibold text-slate-400 uppercase tracking-[0.08em] mt-1">
                      {nights === 1 ? 'noche' : 'noches'}
                    </div>
                  </div>
                  {/* Moon corner chip — Apple Wallet attached-badge pattern */}
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.08)] flex items-center justify-center">
                    <Moon className="h-2.5 w-2.5 text-slate-500" strokeWidth={2.25} />
                  </div>
                </div>
                <div className="h-px w-10 bg-gradient-to-r from-slate-200 via-slate-200 to-amber-200/80" />
              </div>
              {/* Huéspedes meta line — debajo del nights badge */}
              <div className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                <Users className="h-3 w-3" />
                {data.paxCount} {data.paxCount === 1 ? 'huésped' : 'huéspedes'}
              </div>
            </div>

            {/* Check-out column */}
            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Check-out
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              </div>
              <div className="text-lg font-bold text-slate-900 leading-tight">
                {format(checkOut, 'EEE d MMM', { locale: es })}
              </div>
              <div className="text-sm font-semibold text-slate-700">
                {format(checkOut, 'yyyy', { locale: es })}
              </div>
              {data.actualCheckout ? (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                  <Check className="h-3 w-3" />
                  {format(new Date(data.actualCheckout), 'HH:mm', { locale: es })} registrado
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                  12:00 programado
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="stay">
        <TabsList className="w-full h-10 bg-slate-100 rounded-xl p-1 grid grid-cols-4">
          {(['stay', 'payment', 'guest', 'history'] as const).map((v) => (
            <TabsTrigger
              key={v}
              value={v}
              className={cn(
                'rounded-lg text-xs font-medium transition-all text-slate-500',
                'data-[state=active]:bg-white data-[state=active]:shadow-sm',
                'data-[state=active]:text-slate-900 data-[state=active]:font-semibold',
              )}
            >
              {v === 'stay' ? 'Estadía' : v === 'payment' ? 'Pago' : v === 'guest' ? 'Huésped' : 'Historial'}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── TAB: ESTADÍA ── (rediseño 2026-05-19 iter 3)
            Patrón alineado con el slide lateral: grid de cards bg-slate-50 con
            label uppercase + valor bold. Apple HIG: misma jerarquía visual en
            todas las superficies del PMS. Info más profunda vs slide:
              · Fechas detalladas con día de semana + hora real registrada
              · Ventana fiscal (horas hasta auto-checkout, no-show, etc.)
              · IDs externos (PMS/OTA) ampliados
              · Tarifa por noche + breakdown si aplica
        */}
        <TabsContent value="stay" className="mt-4 space-y-4">
          {/* Dates timeline + Notas de llegada — movidos arriba (debajo del
              page hero) para que vivan visibles en todos los tabs como
              contexto operativo permanente. Estadía tab ahora se enfoca en
              las cards de detalle (habitación, huéspedes, canal, etc.). */}

          {/* ── EDIT MODE HEADER BAR (§120 CLAUDE.md bulk-edit pattern). ────
              Aparece solo si la reserva no está en estado terminal (cancelada
              / no-show / post-checkout). Mirror del slide drawer. */}
          {!data.noShowAt && !data.actualCheckout && (
            <div className="flex items-center justify-end gap-1.5">
              {!stayEditMode ? (
                <button
                  type="button"
                  onClick={enterStayEdit}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={cancelStayEdit}
                    disabled={updateMut.isPending}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveStayEdit}
                    disabled={updateMut.isPending}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── CORE CONTEXT — 3-col grid (Gestalt grouping / Apple App Store
              context tiles). Distribuye horizontalmente lo que antes era stack
              vertical para reducir scroll y mejorar scan F-pattern. */}
          <div className="grid grid-cols-3 gap-3">
            <CategoryCard
              icon={MapPin}
              iconBg="bg-blue-50 text-blue-600"
              label="Habitación"
              value={roomNumber ? `Hab. ${roomNumber}` : '—'}
              hint={data.room?.category === 'PRIVATE' ? 'Privada' : data.room?.category === 'SHARED' ? 'Compartida' : undefined}
            />
            <CategoryCard
              icon={Users}
              iconBg="bg-violet-50 text-violet-600"
              label="Huéspedes"
              value={
                stayEditMode ? (
                  <input
                    type="number"
                    min={1}
                    max={data.room?.capacity ?? 99}
                    value={paxDraft}
                    onChange={(e) => setPaxDraft(e.target.value)}
                    className="w-full text-sm font-bold text-slate-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                ) : (
                  `${data.paxCount} ${data.paxCount === 1 ? 'persona' : 'personas'}`
                )
              }
              hint={data.room?.capacity ? `Cap. ${data.room.capacity}` : undefined}
            />
            <CategoryCard
              icon={Tag}
              iconBg="bg-emerald-50 text-emerald-600"
              label="Canal de venta"
              value={otaName}
              hint={data.source === 'direct' || !data.source ? 'sin comisión' : 'vía OTA'}
            />
          </div>

          {/* ── ROW 2 — Operational depth cards (rediseño 2026-05-20 iter 2)
              Reemplaza Anticipación+Acceso (low operational value) con cards
              PMS-research-backed. Investigación verificable:
                · Mews community + Cloudbeds Capterra: "Saldo pendiente al
                  instante" → top request recurrente
                · Opera HotelTechIndex + Mews: "Pipeline status con timestamp"
                  → operational visibility critical
                · RoomRaccoon G2: "Tarifa por noche sin saltar de tab" → top
              Las 3 cards aquí son las MÁS pedidas cross-PMS para vista de detalle. */}
          <div className="grid grid-cols-3 gap-3">
            <CategoryCard
              icon={CreditCard}
              iconBg="bg-slate-100 text-slate-700"
              label="Tarifa / noche"
              value={
                stayEditMode ? (
                  <div className="flex items-center gap-1 font-mono">
                    <span className="text-[11px] text-slate-500">{data.currency}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rateDraft}
                      onChange={(e) => setRateDraft(e.target.value)}
                      className="w-full text-sm font-bold text-slate-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                ) : (
                  (() => {
                    const m = formatMoney(ratePerNight, data.currency)
                    return (
                      <span className="font-mono tabular-nums leading-tight inline-flex flex-col items-start">
                        <span>{m.primary}</span>
                        {m.secondary && <span className="text-[10px] text-slate-400 font-normal">≈ {m.secondary}</span>}
                      </span>
                    )
                  })()
                )
              }
              hint={(() => {
                const m = formatMoney(totalAmount, data.currency)
                return <span className="font-mono tabular-nums">Total {m.primary}</span>
              })()}
            />
            <CategoryCard
              icon={HandCoins}
              iconBg={balance > 0.01 ? 'bg-amber-50 text-amber-700' : balance < -0.01 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
              label={balance > 0.01 ? 'Saldo pendiente' : balance < -0.01 ? 'Crédito a favor' : 'Liquidado'}
              value={(() => {
                const m = formatMoney(Math.abs(balance), data.currency)
                const tone = balance > 0.01 ? 'text-amber-800' : balance < -0.01 ? 'text-amber-800' : 'text-emerald-800'
                return (
                  <span className={cn('font-mono tabular-nums leading-tight inline-flex flex-col items-start', tone)}>
                    <span>{m.primary}</span>
                    {m.secondary && <span className="text-[10px] text-slate-400 font-normal">≈ {m.secondary}</span>}
                  </span>
                )
              })()}
              hint={(() => {
                const m = formatMoney(amountPaid, data.currency)
                return <span className="font-mono tabular-nums">Pagado {paidPercent}% · {m.primary}</span>
              })()}
            />
            <CategoryCard
              icon={Clock}
              iconBg={(() => {
                if (isNoShow) return 'bg-red-50 text-red-700'
                if (status === 'IN_HOUSE') return 'bg-emerald-50 text-emerald-700'
                if (status === 'DEPARTING') return 'bg-amber-50 text-amber-700'
                if (status === 'DEPARTED') return 'bg-slate-100 text-slate-600'
                return 'bg-blue-50 text-blue-700'
              })()}
              label="Estado"
              value={(() => {
                if (isNoShow) return 'No-show'
                if (status === 'IN_HOUSE') return 'Alojado'
                if (status === 'DEPARTING') return 'Sale hoy'
                if (status === 'DEPARTED') return 'Salió'
                if (status === 'ARRIVING') return 'Llega hoy'
                return 'Confirmada'
              })()}
              hint={(() => {
                // Último evento operativo (Opera Cloud pattern)
                if (isNoShow && data.noShowAt) {
                  return `Marcado ${format(new Date(data.noShowAt), "d MMM HH:mm", { locale: es })}`
                }
                if (data.actualCheckout) {
                  return `Checkout ${format(new Date(data.actualCheckout), "d MMM HH:mm", { locale: es })}`
                }
                if (data.actualCheckin) {
                  return `Check-in ${format(new Date(data.actualCheckin), "d MMM HH:mm", { locale: es })}`
                }
                const leadDays = differenceInDays(checkIn, new Date(data.createdAt))
                return `Reservada hace ${leadDays} ${leadDays === 1 ? 'día' : 'días'}`
              })()}
            />
          </div>

          {/* 2026-05-20 — "Referencias" y "Solicitudes especiales" removidos
              de Estadía:
                · bookingRef + ID interno + timestamps están en header del
                  hero (copyable) + Historial tab (audit trail completo)
                · notes (solicitudes) viven en Huésped tab donde pertenecen
                  como contexto del guest, no de la estadía operativa. */}

          {/* Arrival notes promoted al hero arriba (col-span-4 del grid 12).
              Card aquí abajo eliminada — duplicaba. */}

          {isNoShow && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-red-700">Marcado como no-show</span>
              </div>
              <div className="text-xs text-red-600 space-y-1 pl-6">
                <p>Fecha: {format(new Date(data.noShowAt!), "dd/MM/yyyy HH:mm", { locale: es })}</p>
                {data.noShowReason && <p>Razón: {data.noShowReason}</p>}
                {data.noShowChargeStatus && (
                  <p>Estado del cargo: <span className="font-mono font-bold">{data.noShowChargeStatus}</span></p>
                )}
                {data.noShowFeeAmount && data.noShowFeeCurrency && (
                  <p>Fee: <span className="font-mono font-bold">
                    {data.noShowFeeCurrency} {parseFloat(data.noShowFeeAmount).toFixed(2)}
                  </span></p>
                )}
              </div>
              {canRevert && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50 ml-6"
                  onClick={() => navigate('/pms')}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Revertir (ventana de 48h)
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: PAGO ── (rediseño 2026-05-19 iter 4 — paridad slide + depth)
            Patrón: tomar la versión rica del slide (PaymentHeroCard +
            PaymentMovementsList + collapsible breakdown) como base, y
            agregar profundidad solicitada por los usuarios de PMS:
              · Resumen agregado per-método (cuánto cash/card/transfer)
              · Folio line-items (preparado para v1.0.2 CFDI-CORE taxes)
              · Tarifa y noches con cálculo explícito
              · Status fiscal placeholder (CFDI link cuando exista) */}
        <TabsContent value="payment" className="mt-4 space-y-4">
          {/* ── 6:6 GRID — Hero PaymentHeroCard + Detalles del cálculo ──────
              Hero (saldo + CTA Registrar pago) y Detalles fiscal side-by-side.
              PaymentSummaryCard removido — sus stats (count, último cobro,
              métodos) ya se derivan del listado Movimientos abajo. Apple HIG:
              cada elemento debe tener UN propósito; resumen + listado completo
              era duplicación. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {/* LEFT — Hero PaymentHeroCard (saldo/total/CTA). 2026-05-20:
                items-start (no stretch) — el card de saldo es compacto por
                naturaleza; cuando el desglose fiscal (right) tiene muchas
                líneas (QR con IVA+ISH), forzar stretch genera whitespace
                vacío abajo del Saldo. Apple HIG: cada card respeta su
                tamaño natural; el contenedor padre absorbe diferencias.
                displayCurrency permite que el toggle del top page convierta
                amounts internamente (currency stays property fiscal). */}
            {(() => {
              // Normalizar amounts a propertyCurrency (fiscal pivot) antes de
              // pasarlos a PaymentHeroCard. data.* viven en data.currency
              // (e.g., USD si el stay se cotizó en USD). PaymentHeroCard
              // espera amounts coherentes con `currency` prop.
              const totalInProp   = convertAmount(totalAmount, data.currency, propertyCurrency)
              const paidInProp    = convertAmount(amountPaid,  data.currency, propertyCurrency)
              const balanceInProp = totalInProp - paidInProp
              return (
                <PaymentHeroCard
                  paymentModel={checkinContext?.paymentModel ?? 'HOTEL_COLLECT'}
                  totalAmount={totalInProp}
                  amountPaid={paidInProp}
                  balance={balanceInProp}
                  currency={propertyCurrency}
                  displayCurrency={displayCurrency}
                  secondaryRates={checkinContext?.secondaryRates}
                  otaSource={data.source ?? null}
                  canRegisterPayment={!isNoShow && !data.actualCheckout}
                  onRegisterPayment={() => setRegisterPaymentOpen(true)}
                />
              )
            })()}

            {/* RIGHT — Detalles del cálculo con desglose fiscal jurisdicción-aware.
                Backend (TaxBreakdownService) decide qué líneas mostrar según
                country + state de la Property. Si la propiedad NO es Quintana
                Roo, NO aparece ISH (sería incorrecto). Si es non-MX, sólo
                muestra base + total con nota explicativa. */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" />
                  Detalles del cálculo
                </span>
                {taxBreakdown?.jurisdiction.stateName && (
                  <span className="text-[9px] font-medium text-slate-400 normal-case tracking-normal">
                    {taxBreakdown.jurisdiction.stateName}, {taxBreakdown.jurisdiction.countryName}
                  </span>
                )}
                {taxBreakdown && !taxBreakdown.jurisdiction.stateName && (
                  <span className="text-[9px] font-medium text-slate-400 normal-case tracking-normal">
                    {taxBreakdown.jurisdiction.countryName}
                  </span>
                )}
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                {taxBreakdown && taxBreakdown.configured && taxBreakdown.lineItems.length > 0 ? (
                  <>
                    {/* Líneas individuales: solo primary currency (sin "≈ USD")
                        para reducir densidad cognitiva. La conversion SOLO vive
                        en el Total al pie — info más útil sin saturar. */}
                    {(() => {
                      const m = formatMoney(taxBreakdown.base, taxBreakdown.currency)
                      return (
                        <div className="flex justify-between items-baseline">
                          <span>Subtotal (base)</span>
                          <span className="font-mono tabular-nums">{m.primary}</span>
                        </div>
                      )
                    })()}
                    {(() => {
                      const m = formatMoney(ratePerNight, taxBreakdown.currency)
                      return (
                        <div className="flex justify-between text-[10.5px] text-slate-400">
                          <span>Tarifa × noches</span>
                          <span className="font-mono tabular-nums">{m.primary} × {nights}</span>
                        </div>
                      )
                    })()}
                    {taxBreakdown.lineItems.map((line) => {
                      const m = formatMoney(line.amount, taxBreakdown.currency)
                      // "16% sobre subtotal" en lugar de "16% × USD 286.89" —
                      // el monto ya se ve arriba, no necesitamos repetirlo.
                      const cleanDetail = line.calculation === 'PERCENT_OF_BASE'
                        ? `${Math.round(line.rate * 100)}% sobre subtotal`
                        : line.detail
                      return (
                        <div key={line.code} className="pt-1.5">
                          <div className="flex justify-between items-baseline">
                            <span>{line.label}</span>
                            <span className="font-mono tabular-nums">{m.primary}</span>
                          </div>
                          {cleanDetail && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{cleanDetail}</div>
                          )}
                        </div>
                      )
                    })}
                    {/* Total — ÚNICA línea con conversion secundaria.
                        Apple HIG: secondary info al pie donde aporta más
                        valor (resumen financiero final). */}
                    {(() => {
                      const m = formatMoney(taxBreakdown.total, taxBreakdown.currency)
                      return (
                        <div className="flex justify-between items-baseline font-semibold text-slate-800 pt-1.5 border-t border-slate-100">
                          <span>Total</span>
                          <span className="text-right">
                            <span className="font-mono tabular-nums block">{m.primary}</span>
                            {m.secondary && <span className="font-mono tabular-nums text-[10px] text-slate-400 font-normal block">≈ {m.secondary}</span>}
                          </span>
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <>
                    {/* Fallback: jurisdicción no-configurada o sin breakdown.
                        Mostramos sólo el desglose simple sin impuestos. */}
                    {(() => {
                      const m = formatMoney(ratePerNight, data.currency)
                      return (
                        <div className="flex justify-between">
                          <span>Tarifa por noche</span>
                          <span className="font-mono tabular-nums">{m.primary}</span>
                        </div>
                      )
                    })()}
                    <div className="flex justify-between">
                      <span>Noches</span>
                      <span className="font-mono tabular-nums">× {nights}</span>
                    </div>
                    {(() => {
                      const m = formatMoney(totalAmount, data.currency)
                      return (
                        <div className="flex justify-between items-baseline font-semibold text-slate-800 pt-1.5 border-t border-slate-100">
                          <span>Total</span>
                          <span className="text-right">
                            <span className="font-mono tabular-nums block">{m.primary}</span>
                            {m.secondary && <span className="font-mono tabular-nums text-[10px] text-slate-400 font-normal block">≈ {m.secondary}</span>}
                          </span>
                        </div>
                      )
                    })()}
                  </>
                )}
                {taxBreakdown?.note && (
                  <p className="text-[10px] text-slate-400 italic pt-1.5 border-t border-slate-100 leading-snug">
                    {taxBreakdown.note}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Movimientos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Movimientos
              </div>
              {paymentsQuery.data && paymentsQuery.data.length > 0 && (
                <div className="text-[11px] text-slate-500 tabular-nums">
                  {paymentsQuery.data.filter((p) => !p.voidedAt).length} {paymentsQuery.data.filter((p) => !p.voidedAt).length === 1 ? 'pago' : 'pagos'}
                </div>
              )}
            </div>
            {paymentsQuery.isLoading ? (
              <p className="text-xs text-slate-400 py-2 text-center">Cargando movimientos…</p>
            ) : (
              <PaymentMovementsList
                payments={paymentsQuery.data ?? []}
                currency={checkinContext?.propertyCurrency ?? data.currency}
                secondaryRates={checkinContext?.secondaryRates}
                canVoid={!isNoShow}
                isVoidPending={voidPaymentMut.isPending}
                onVoid={(p) => setVoidTarget(p)}
              />
            )}
          </div>
        </TabsContent>

        {/* ── TAB: HUÉSPED ── */}
        {/* ── TAB: HUÉSPED ── (rediseño 2026-05-20 iter 4 — feedback usuario)
            Layout 4:6 — foto del documento (izq) + info column (der).
            Tipografía aumentada (text-base vs text-sm). Iconos inline para
            WhatsApp/Email nativos + Copy. Grupo y botones grandes removidos. */}
        <TabsContent value="guest" className="mt-4 space-y-4">
          {/* Hidden file input para upload via picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePick}
          />

          {/* REPEAT GUEST BANNER — Mews + Opera top request. */}
          {guestStats && guestStats.previousStaysCount > 0 && (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-50/40 border border-emerald-200 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-emerald-900">
                  Cliente recurrente · {guestStats.previousStaysCount + 1}ª visita
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  {guestStats.totalNightsHistorical} noche{guestStats.totalNightsHistorical === 1 ? '' : 's'} históricas
                  {guestStats.lastVisitAt && (
                    <> · última visita hace {differenceInDays(new Date(), new Date(guestStats.lastVisitAt))} días</>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GRID 4:6 — foto izq (col-span-2 de 5) + info der (col-span-3 de 5) */}
          <div className="grid grid-cols-5 gap-3 items-start">
            {/* COLUMNA IZQUIERDA — Foto del documento (40%) */}
            <div className="col-span-2">
              <GuestDocumentPhotoCardWithUpload
                photoUrl={checkinContext?.stay?.documentPhotoUrl ?? null}
                documentType={data.documentType}
                guestName={data.guestName}
                actualCheckin={data.actualCheckin}
                onUploadFile={() => fileInputRef.current?.click()}
                onCaptureWebcam={() => setWebcamOpen(true)}
                isSaving={updateMut.isPending}
              />
            </div>

            {/* COLUMNA DERECHA — Info en filas (60%) */}
            <div className="col-span-3 rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Nacionalidad + Sexo en 2-col (Sprint 2026-05-20 — sex
                  agregado para BI analytics). Apple Settings group pattern. */}
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <GuestInfoLine
                  icon={MapPin}
                  iconBg="bg-blue-50 text-blue-600"
                  label="Nacionalidad"
                  value={
                    data.nationality ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-lg leading-none">{countryCodeToFlag(data.nationality)}</span>
                        <span>{countryFullName(data.nationality) || data.nationality}</span>
                      </span>
                    ) : <span className="text-slate-400 font-normal">—</span>
                  }
                />
                <GuestInfoLine
                  icon={User}
                  iconBg="bg-rose-50 text-rose-600"
                  label="Sexo"
                  value={(() => {
                    const map: Record<string, string> = {
                      M: 'Masculino',
                      F: 'Femenino',
                      O: 'Otro',
                      N: 'Prefiere no decir',
                    }
                    return data.guestSex
                      ? (map[data.guestSex] ?? data.guestSex)
                      : <span className="text-slate-400 font-normal">—</span>
                  })()}
                />
              </div>
              <GuestInfoLine
                icon={FileText}
                iconBg="bg-slate-100 text-slate-700"
                label="Tipo de documento"
                value={data.documentType ? data.documentType.toUpperCase() : <span className="text-slate-400 font-normal">—</span>}
              />
              <GuestInfoLine
                icon={Phone}
                iconBg="bg-emerald-50 text-emerald-600"
                label="WhatsApp / Teléfono"
                rawValue={data.guestPhone}
                value={data.guestPhone || <span className="text-slate-400 font-normal">—</span>}
                actions={data.guestPhone ? [
                  {
                    kind: 'link',
                    href: `https://wa.me/${data.guestPhone.replace(/\D/g, '')}`,
                    target: '_blank',
                    icon: <WhatsAppIcon className="h-3.5 w-3.5" />,
                    tooltip: 'Enviar WhatsApp',
                    tone: 'emerald',
                  },
                  { kind: 'copy', tooltip: 'Copiar número' },
                ] : undefined}
              />
              <GuestInfoLine
                icon={Mail}
                iconBg="bg-blue-50 text-blue-600"
                label="Email"
                rawValue={data.guestEmail}
                value={data.guestEmail || <span className="text-slate-400 font-normal">—</span>}
                actions={data.guestEmail ? [
                  {
                    kind: 'link',
                    href: `mailto:${data.guestEmail}`,
                    icon: <Mail className="h-3.5 w-3.5" />,
                    tooltip: 'Enviar email',
                    tone: 'blue',
                  },
                  { kind: 'copy', tooltip: 'Copiar email' },
                ] : undefined}
              />
            </div>
          </div>

          {/* Solicitudes especiales removidas — la comunicación per-reserva
              vive ahora 100% en la bitácora del equipo (sidebar derecho). */}

          {/* Webcam capture modal */}
          <WebcamCaptureModal
            open={webcamOpen}
            onClose={() => setWebcamOpen(false)}
            onCapture={(dataUrl) => { void handlePhotoSave(dataUrl) }}
          />
        </TabsContent>

        {/* ── TAB: HISTORIAL ── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="relative pl-8 py-3">
              {/* Vertical line */}
              <div className="absolute left-[27px] top-0 bottom-0 w-px bg-slate-100" />

              {timeline === undefined ? (
                <p className="text-xs text-slate-400 py-2">Cargando historial…</p>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Sin eventos registrados.</p>
              ) : (
                timeline.map((entry) => {
                  const r = renderEvent(entry)
                  return (
                    <TimelineEvent
                      key={entry.id}
                      color={r.color}
                      title={r.label}
                      subtitle={r.subtitle}
                      timestamp={entry.occurredAt}
                    />
                  )
                })
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

        </div>{/* /main column */}

        {/* ── RIGHT SIDEBAR — Bitácora del equipo.
            Única fuente de comunicación per-reserva. Mismo componente que el
            slide drawer del calendario. Altura acotada (~640px) para no
            dominar el viewport; sticky al hacer scroll. lg+ only. */}
        <aside className="hidden lg:flex flex-col w-[340px] shrink-0 self-start sticky top-20 h-[calc(100vh-7rem)]">
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)]">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-0.5">
              Bitácora del equipo
            </div>
            <div className="flex-1 min-h-0">
              <ReservationNotesThread stayId={data.id} currentUserId={currentUserId} />
            </div>
          </div>
        </aside>
      </div>

      {data && (status === 'IN_HOUSE') && (
        <EarlyCheckoutDialog
          open={showEarlyCheckout}
          onClose={() => setShowEarlyCheckout(false)}
          onConfirm={(notes) => {
            earlyCheckoutMut.mutate(
              { stayId: id!, notes },
              {
                onSuccess: () => {
                  setShowEarlyCheckout(false)
                  qc.invalidateQueries({ queryKey: ['guest-stay', id] })
                },
              },
            )
          }}
          isPending={earlyCheckoutMut.isPending}
          guestName={data.guestName}
          roomLabel={data.room?.number ? `Hab. ${data.room.number}` : 'Habitación'}
          checkinAt={new Date(data.checkinAt)}
          scheduledCheckout={new Date(data.scheduledCheckout)}
        />
      )}

      {/* Dialogs de pago — paridad con el slide */}
      <RegisterPaymentDialog
        open={registerPaymentOpen}
        isPending={registerPaymentMut.isPending}
        balance={balance}
        currency={checkinContext?.propertyCurrency ?? data.currency}
        secondaryRates={checkinContext?.secondaryRates}
        onClose={() => setRegisterPaymentOpen(false)}
        onConfirm={(payload) => {
          registerPaymentMut.mutate(payload, { onSuccess: () => setRegisterPaymentOpen(false) })
        }}
      />
      <VoidPaymentDialog
        open={!!voidTarget}
        payment={voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={(reason) => {
          if (!voidTarget) return
          voidPaymentMut.mutate(
            { paymentLogId: voidTarget.id, voidReason: reason },
            { onSuccess: () => setVoidTarget(null) },
          )
        }}
        isPending={voidPaymentMut.isPending}
      />
    </div>
  )
}

// ─── Timeline event ───────────────────────────────────────────────────────────

function TimelineEvent({
  color,
  title,
  subtitle,
  timestamp,
}: {
  color: string
  title: string
  subtitle?: string
  timestamp: string
}) {
  // 2026-05-20 — Layout compacto: timestamp en línea con el title (no debajo).
  // Apple Mail thread/Settings pattern: el ojo escanea title+timestamp como
  // una unidad (Gestalt proximity). Ahorra ~14px vertical por fila × N filas.
  return (
    <div className="flex items-start gap-4 px-4 py-2.5 border-b border-slate-100 last:border-0">
      <div className={cn('w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 -ml-5 z-10', color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-xs font-semibold text-slate-700 truncate">{title}</div>
          <div className="text-[10.5px] text-slate-400 font-mono tabular-nums shrink-0">
            {format(new Date(timestamp), 'dd MMM · HH:mm', { locale: es })}
          </div>
        </div>
        {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}
