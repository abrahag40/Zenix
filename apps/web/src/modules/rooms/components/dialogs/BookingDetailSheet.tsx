import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useSoftLock } from '@/hooks/useSoftLock'
import { useShakeOnInvalid } from '@/hooks/useShakeOnInvalid'
import { useMaintenanceTickets } from '../../../maintenance/hooks/useMaintenanceTickets'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  User,
  MapPin,
  Moon,
  Users,
  Phone,
  Mail,
  FileText,
  LogIn,
  LogOut,
  ArrowRightLeft,
  UserX,
  RotateCcw,
  ExternalLink,
  X,
  MessageCircle,
  CreditCard,
  HandCoins,
  AlertCircle,
  Copy,
  Check,
  Ban,
  Pencil,
  Camera,
  Upload,
  ChevronDown,
  Wrench,
  CalendarPlus,
  Split as SplitIcon,
} from 'lucide-react'

import { format, differenceInDays, differenceInHours, formatDistanceToNowStrict, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

import {
  STAY_STATUS_COLORS,
  resolveOtaDisplay,
} from '../../utils/timeline.constants'

import { getStayStatus } from '../../utils/timeline.utils'
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge'
import { useLogContact, useEarlyCheckout, useUpdateGuestStay, useStayPayments, useVoidPayment, useRegisterPayment, useStayContext, useRegisterNoShowCharge } from '../../hooks/useGuestStays'
import { useStayUpdatedSSE } from '../../hooks/useStayUpdatedSSE'
import { EarlyCheckoutDialog } from './EarlyCheckoutDialog'
import { RegisterNoShowChargeDialog } from './RegisterNoShowChargeDialog'
import { InlineEditField } from '../shared/InlineEditField'
import { ReservationNotesThread } from '../shared/ReservationNotesThread'
import { ChangeConfirmDialog } from '../shared/ChangeConfirmDialog'
import { VoidPaymentDialog } from '../shared/VoidPaymentDialog'
import { RegisterPaymentDialog } from '../shared/RegisterPaymentDialog'
import { PaymentHeroCard } from '../shared/PaymentHeroCard'
import { PaymentMovementsList } from '../shared/PaymentMovementsList'
import { EditableSectionHeader } from '../shared/EditableSectionHeader'
import { DialogActions } from '../shared/DialogActions'
import type { PaymentLogDto } from '../../api/guest-stays.api'
import { useAuthStore } from '@/store/auth'
import { useQueryClient } from '@tanstack/react-query'

import type { GuestStayBlock } from '../../types/timeline.types'

interface BookingDetailSheetProps {
  stay: GuestStayBlock | null
  open: boolean
  onClose: () => void
  onCheckout: (stayId: string) => void
  onMoveRoom: (stayId: string) => void
  onNoShow: (stayId: string, opts: { reason?: string; waiveCharge?: boolean }) => void
  onRevertNoShow: (stayId: string) => void
  onStartCheckin?: (stayId: string) => void
  onCancelReservation?: (stayId: string) => void
  /** Confirma la mudanza física de un segmento (entrega de nueva llave).
   *  Solo se renderiza la acción cuando segment.reason in [EXT_NEW_ROOM,
   *  ROOM_MOVE] + checkIn ≤ today + !moveConfirmedAt. */
  onConfirmSegmentMove?: (segmentId: string) => void
  confirmMovePending?: boolean
  /** W3.3 — Abre el TicketDetailDrawer in-place sobre el calendario.
   *  Si no se provee, hace fallback a navigate(/maintenance?ticketId=X). */
  onOpenMaintenanceTicket?: (ticketId: string) => void
  /** propertyId needed for soft-lock advisory (Sprint 7C). */
  propertyId?: string
}

/**
 * ID copiable inline — texto plano (sin chip), tipografía SF Mono nativa.
 * Apple HIG: secondary metadata sutil, copyable con un click.
 * Posicionado bajo el botón "Ver completa" en el header del sheet.
 * Solo se renderiza cuando hay bookingRef formal (MX-D-001-YYMM-NNNN);
 * legacy/seed sin ref NO se muestra.
 */
function InlineCopyId({
  value,
  statusText,
}: { value: string; statusText: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          // no-op si el navegador bloquea clipboard
        }
      }}
      className="group inline-flex items-center gap-1.5 px-2 py-1 -mr-1 rounded-md hover:bg-white/50 transition-colors"
      style={{ color: statusText }}
      title={copied ? 'Copiado' : `Copiar ${value}`}
    >
      <span
        className="select-all font-mono tabular-nums tracking-tight"
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          fontFeatureSettings: '"ss01", "tnum"',
        }}
      >
        {value}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-40 group-hover:opacity-90 transition-opacity" />
      )}
    </button>
  )
}

function CopyableId({ value, short = false }: { value: string; short?: boolean }) {
  const [copied, setCopied] = useState(false)
  const display = short && value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          // no-op si el navegador bloquea clipboard (preview / http)
        }
      }}
      className="group flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
      title={short ? value : 'Copiar al portapapeles'}
    >
      <span className="select-all">{display}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
      )}
    </button>
  )
}

// ── DocumentPhotoCard — Sprint EDIT-RESERVATION iter 5 ─────────────────────
// Thumbnail de la foto del documento (captura en check-in §108). Click → lightbox.
// Si no hay foto, render compacto invitando a capturarla (legacy fallback antes
// que v1.0.3 IMG migre a S3 con upload background). Visa CRR §5.9.2 evidence.

// ─── SegmentContextLine ──────────────────────────────────────────────────────
// Una sola fila compacta que reemplaza los 4 banners previos
// (EXTENSION_SAME_ROOM / EXTENSION_NEW_ROOM / ROOM_MOVE / SPLIT). Cumple
// estandarización Apple HIG: misma altura, mismo padding, color semántico
// distinto. Para detalle profundo (timestamp, actor, secuencia) → Historial.

function SegmentContextLine({
  segmentReason,
  nights,
  originalRoomNumber,
  roomNumber,
}: {
  segmentReason: string | undefined | null
  nights: number
  originalRoomNumber: string | undefined | null
  roomNumber: string | undefined | null
}) {
  if (!segmentReason) return null

  const n = nights
  const plural = n !== 1 ? 's' : ''

  // Configuración por tipo de segmento. Cada caso define:
  //   icon, bg/border/text colors (semántica del sistema Zenix), texto.
  let config: {
    Icon: React.ElementType
    bg: string
    border: string
    label: string
    body: React.ReactNode
  } | null = null

  if (segmentReason === 'EXTENSION_SAME_ROOM') {
    config = {
      Icon: CalendarPlus,
      bg: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      label: 'text-emerald-700',
      body: <>Extensión <span className="font-semibold">+{n} noche{plural}</span> en la misma habitación</>,
    }
  } else if (segmentReason === 'EXTENSION_NEW_ROOM') {
    config = {
      Icon: CalendarPlus,
      bg: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      label: 'text-emerald-700',
      body: originalRoomNumber && roomNumber
        ? <>Extensión <span className="font-semibold">+{n} noche{plural}</span> · Hab. {originalRoomNumber} <span className="text-emerald-500 mx-0.5">→</span> <span className="font-semibold">Hab. {roomNumber}</span></>
        : <>Extensión <span className="font-semibold">+{n} noche{plural}</span> con cambio de habitación</>,
    }
  } else if (segmentReason === 'ROOM_MOVE') {
    config = {
      Icon: ArrowRightLeft,
      bg: 'bg-blue-50/70',
      border: 'border-blue-200',
      label: 'text-blue-700',
      body: originalRoomNumber && roomNumber
        ? <>Cambio de habitación · Hab. {originalRoomNumber} <span className="text-blue-500 mx-0.5">→</span> <span className="font-semibold">Hab. {roomNumber}</span></>
        : <>Cambio de habitación</>,
    }
  } else if (segmentReason === 'SPLIT') {
    config = {
      Icon: SplitIcon,
      bg: 'bg-violet-50/70',
      border: 'border-violet-200',
      label: 'text-violet-700',
      body: <>Tramo de reserva dividida · <span className="font-semibold">{n} noche{plural}</span> en Hab. {roomNumber}</>,
    }
  }

  if (!config) return null

  const { Icon, bg, border, label, body } = config
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2',
        bg,
        border,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', label)} />
      <div className={cn('text-xs leading-snug truncate', label.replace('700', '800'))}>
        {body}
      </div>
    </div>
  )
}

// ─── RoomMaintenanceCallout ───────────────────────────────────────────────────
// Colapsable. Cerrado por default (NN/g progressive disclosure — sólo abrir
// cuando el recepcionista realmente necesita el contexto). Cada fila tiene
// badge de prioridad de ancho fijo (54px) para alineación vertical perfecta,
// título principal en gris-900, y fechas de inicio/fin en menor jerarquía.

const TICKET_PRIORITY_META: Record<
  string,
  { label: string; badge: string }
> = {
  CRITICAL: { label: 'Crítico', badge: 'bg-red-100 text-red-700 border-red-200' },
  HIGH:     { label: 'Alto',    badge: 'bg-red-50  text-red-600 border-red-100' },
  MEDIUM:   { label: 'Medio',   badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  LOW:      { label: 'Bajo',    badge: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function RoomMaintenanceCallout({
  tickets,
  onOpenTicket,
  onViewAll,
}: {
  tickets: Array<{
    id: string
    priority: string
    title: string
    createdAt: string
    estimatedEndAt: string | null
    hasAutoBlock: boolean
  }>
  onOpenTicket: (id: string) => void
  onViewAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const visible = tickets.slice(0, 3)
  const rest = tickets.length - visible.length

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-amber-100/40 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-900">
          <Wrench className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span>
            {tickets.length} ticket{tickets.length === 1 ? '' : 's'} de mantenimiento en esta habitación
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-amber-700 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-amber-200/60">
          {visible.map((t) => {
            const meta = TICKET_PRIORITY_META[t.priority] ?? TICKET_PRIORITY_META.LOW
            const startDate = format(new Date(t.createdAt), 'd MMM', { locale: es })
            const endDate = t.estimatedEndAt
              ? format(new Date(t.estimatedEndAt), 'd MMM', { locale: es })
              : null
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTicket(t.id)}
                className="w-full flex items-center gap-2.5 rounded-lg bg-white border border-amber-100 px-2.5 py-2 hover:bg-amber-100/30 hover:border-amber-200 transition-colors text-left"
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center text-[10px] font-semibold rounded border',
                    'w-[54px] h-[20px] shrink-0 tabular-nums',
                    meta.badge,
                  )}
                >
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-900 truncate leading-tight">
                    {t.title}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 font-mono tabular-nums">
                    <span className="text-slate-400">Inicio</span> {startDate}
                    {endDate && (
                      <>
                        <span className="text-slate-300 mx-1">·</span>
                        <span className="text-slate-400">Fin est.</span> {endDate}
                      </>
                    )}
                  </div>
                </div>
                {t.hasAutoBlock && (
                  <span
                    title="Habitación bloqueada en OTAs"
                    className="text-[10px] shrink-0 text-amber-700"
                  >
                    🔒
                  </span>
                )}
              </button>
            )
          })}
          {rest > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              className="w-full text-center text-[11px] text-amber-700 hover:text-amber-900 font-medium pt-1"
            >
              Ver los {rest} restantes →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DocumentPhotoCard({
  photoUrl, documentType, guestName, onUploadRequest, canUpload,
}: {
  photoUrl: string | null | undefined
  documentType: string | null | undefined
  guestName: string
  /** Abre el dialog de upload — el parent maneja la mutation. */
  onUploadRequest: () => void
  /** False si la reserva está locked (cancelled/no-show post-checkout audit). */
  canUpload: boolean
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (!photoUrl) {
    // Estado vacío — clickable si canUpload (pre-check-in capture allowed).
    // Apple HIG signifier: dashed border + hover affordance = "click me to add".
    if (canUpload) {
      return (
        <button
          type="button"
          onClick={onUploadRequest}
          aria-label={`Cargar foto del documento de ${guestName}`}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50/60 hover:bg-emerald-50/60 hover:border-emerald-400 px-3 py-2.5 flex items-center gap-2.5 transition-colors group text-left"
        >
          <div className="w-10 h-10 rounded-md bg-white border border-slate-200 group-hover:border-emerald-300 flex items-center justify-center shrink-0 transition-colors">
            <Camera className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
          <div className="text-[11px] leading-snug flex-1 min-w-0">
            <p className="font-medium text-slate-700 group-hover:text-emerald-800 transition-colors">
              Cargar foto del documento
            </p>
            <p className="text-slate-400 group-hover:text-emerald-600/80 transition-colors">
              Click para tomar o seleccionar archivo · INE, pasaporte, licencia
            </p>
          </div>
          <Upload className="h-3.5 w-3.5 text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
        </button>
      )
    }
    // Locked — info only, sin click action.
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-slate-300" />
        </div>
        <div className="text-[11px] text-slate-500 leading-snug">
          <p className="font-medium text-slate-600">Sin foto del documento</p>
          <p className="text-slate-400">Documento bloqueado por audit fiscal.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={`Ver foto del documento de ${guestName}`}
          className="relative w-12 h-12 rounded-md overflow-hidden border border-slate-200 hover:border-emerald-400 transition-colors shrink-0 group bg-slate-100"
        >
          <img
            src={photoUrl}
            alt={`Documento de ${guestName}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <ExternalLink className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 drop-shadow" />
          </div>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Foto del documento
          </p>
          <p className="text-xs text-slate-700 font-medium truncate mt-0.5">
            {documentType ? `${documentType.toUpperCase()} verificado` : 'Identificación capturada'}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium"
            >
              Ver en tamaño real →
            </button>
            {canUpload && (
              <>
                <span className="text-slate-300 text-[10px]">·</span>
                <button
                  type="button"
                  onClick={onUploadRequest}
                  className="text-[10px] text-slate-500 hover:text-emerald-700 font-medium"
                >
                  Reemplazar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox fullscreen */}
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
            onClick={() => setLightboxOpen(false)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={photoUrl}
            alt={`Documento de ${guestName} — vista ampliada`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ── UploadDocumentPhotoDialog ──────────────────────────────────────────────
// Modal nested-over-sheet usando Radix Dialog primitives (§116). File picker
// nativo + preview + confirm. Data URI base64 (mismo patrón ConfirmCheckin
// §108) — migración a S3 background en v1.0.4 IMG.

function UploadDocumentPhotoDialog({
  open, onOpenChange, existingPhotoUrl, guestName, onSave, isSaving,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  existingPhotoUrl: string | null | undefined
  guestName: string
  onSave: (dataUrl: string) => Promise<void> | void
  isSaving: boolean
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Reset al abrir/cerrar — no fugamos preview entre sesiones.
  React.useEffect(() => {
    if (!open) { setPreviewUrl(null); setFileName(null) }
  }, [open])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La foto excede 5 MB. Toma una nueva foto de menor calidad.')
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
      setPreviewUrl(result)
      setFileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function handleConfirm() {
    if (!previewUrl || isSaving) return
    await onSave(previewUrl)
    onOpenChange(false)
  }

  const displayUrl = previewUrl ?? existingPhotoUrl ?? null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[91] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl border border-slate-200 p-5"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold text-slate-900">
                Foto del documento
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[11px] text-slate-500 mt-0.5">
                {guestName} · INE, pasaporte o licencia
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              disabled={isSaving}
              className="text-slate-400 hover:text-slate-600 p-1 -m-1 rounded disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Preview area */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden mb-3 aspect-[4/3] flex items-center justify-center">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt="Vista previa del documento"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-center px-4">
                <Camera className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-[11px] text-slate-500">
                  Aún no has seleccionado una foto
                </p>
              </div>
            )}
          </div>

          {fileName && (
            <p className="text-[10px] text-slate-500 truncate mb-2 font-mono">
              {fileName}
            </p>
          )}

          {/* File input hidden — botón visible lo dispara */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
            disabled={isSaving}
          />

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="w-full text-xs h-9"
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {previewUrl ? 'Elegir otra foto' : existingPhotoUrl ? 'Reemplazar foto' : 'Tomar / elegir foto'}
            </Button>

            <DialogActions
              onCancel={() => onOpenChange(false)}
              onConfirm={() => void handleConfirm()}
              confirmLabel="Guardar foto"
              isPending={isSaving}
              confirmDisabled={!previewUrl}
              className="pt-1"
            />
          </div>

          <p className="text-[10px] text-slate-400 mt-3 leading-snug">
            Máximo 5 MB · JPG/PNG/HEIC · Evidencia chargeback Visa CRR §5.9.2
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function BookingDetailSheet({
  stay,
  open,
  onClose,
  onCheckout,
  onMoveRoom,
  onNoShow,
  onRevertNoShow,
  onStartCheckin,
  onCancelReservation,
  onConfirmSegmentMove,
  confirmMovePending = false,
  onOpenMaintenanceTicket,
  propertyId,
}: BookingDetailSheetProps) {
  /**
   * Advisory soft-lock while the panel is open.
   * Rationale (CLAUDE.md §Principio Rector):
   * - Visibilidad del sistema (Nielsen #1): cualquier recepcionista conectado
   *   verá el badge 🔒 en la columna de habitaciones mientras este panel esté
   *   abierto, independientemente de si está en CheckInDialog o en este panel.
   * - Modelo dual (Kahneman): el badge activa Sistema 1 — reconocimiento
   *   inmediato sin carga cognitiva adicional para quien lo recibe.
   * - Lock se libera en el cleanup del useEffect (unmount o `open` → false),
   *   garantizando que el badge desaparezca al cerrar el panel.
   */
  useSoftLock(open && stay?.roomId ? stay.roomId : null, propertyId ?? null)
  const navigate = useNavigate()
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false)
  const [noShowReason, setNoShowReason] = useState('')
  const [waiveCharge, setWaiveCharge] = useState(false)
  const logContact  = useLogContact(stay?.id ?? '')
  const { shakeClass: waiveShake, trigger: triggerWaiveShake } = useShakeOnInvalid()

  // W3.2 — Maintenance tickets activos en la habitación de esta reserva.
  // Shared query; staleTime 30s + SSE invalida en tiempo real.
  const { data: allActiveTickets = [] } = useMaintenanceTickets({ activeOnly: true })
  const roomTickets = stay?.roomId
    ? allActiveTickets.filter((t) => t.roomId === stay.roomId)
    : []
  const [showEarlyCheckout, setShowEarlyCheckout] = useState(false)
  const earlyCheckoutMutation = useEarlyCheckout(propertyId ?? '')

  // No-show admin charge — Sprint POST-NETFLIX-TRIAL (2026-05-29)
  const [showNoShowChargeDialog, setShowNoShowChargeDialog] = useState(false)
  const registerNoShowChargeMut = useRegisterNoShowCharge(propertyId ?? '')

  // Sprint EDIT-RESERVATION — hook único para todas las ediciones inline.
  // Backend aplica matriz phase×campo + audit log. El frontend solo dispatcha.
  const updateMut    = useUpdateGuestStay(propertyId ?? '')
  const currentUser  = useAuthStore((s) => s.user)
  const currentUserId = currentUser?.id ?? currentUser?.email ?? ''
  const realStayId   = stay?.guestStayId ?? stay?.id ?? null
  const qc           = useQueryClient()

  // Helper para guardar 1 campo. Mantiene el wrapper limpio en cada
  // InlineEditField. Lanza si falla → el componente entra en state error.
  const saveField = async (field: string, newValue: string | number) => {
    if (!realStayId) return
    await updateMut.mutateAsync({ stayId: realStayId, patch: { [field]: newValue } })
  }

  // ── ChangeConfirmDialog state: pax + rate edits ─────────────────────────
  // Pattern: el InlineEditField llama a confirmBeforeSave; abrimos el dialog
  // y resolvemos vía promesa. La promesa se resuelve true→continúa save,
  // false→cancela edit.
  type ConfirmContext = {
    field: 'paxCount' | 'ratePerNight'
    before: string
    after: string
    rawAfter: string
    requireApproval: boolean
    derivedSummary?: string
  }
  const [confirmCtx, setConfirmCtx] = useState<ConfirmContext | null>(null)
  const [confirmResolver, setConfirmResolver] = useState<((v: boolean) => void) | null>(null)

  // ── Tab control ─────────────────────────────────────────────────────────
  // Controlled tab → permite ocultar el footer de acciones en la tab Notas
  // (la barra de acciones destructivas no aporta valor en contexto del chat).
  const [activeTab, setActiveTab] = useState<'stay' | 'payment' | 'guest' | 'notes'>('stay')

  // Phase de la stay — usada por los 3 tabs editables para decidir guards.
  const stayPhase: 'PRE_CHECKIN' | 'POST_CHECKIN' | 'POST_CHECKOUT' | 'CANCELLED' | 'NOSHOW' =
    stay?.cancelledAt    ? 'CANCELLED'
    : stay?.noShowAt     ? 'NOSHOW'
    : stay?.actualCheckout ? 'POST_CHECKOUT'
    : stay?.actualCheckin  ? 'POST_CHECKIN'
    : 'PRE_CHECKIN'
  const isStayLockedHard = stayPhase === 'CANCELLED' || stayPhase === 'NOSHOW'

  // ── Estadía tab bulk-edit ───────────────────────────────────────────────
  type StayDraft = { paxCount: number; arrivalNotes: string }
  const emptyStayDraft = (): StayDraft => ({
    paxCount:     stay?.paxCount    ?? 1,
    arrivalNotes: stay?.arrivalNotes ?? '',
  })
  const [stayEditMode, setStayEditMode] = useState(false)
  const [stayDraft,    setStayDraft]    = useState<StayDraft>(emptyStayDraft)
  const [stayErrors,   setStayErrors]   = useState<Partial<Record<keyof StayDraft, string>>>({})
  const enterStayEdit = () => { setStayDraft(emptyStayDraft()); setStayErrors({}); setStayEditMode(true) }
  const cancelStayEdit = () => { setStayEditMode(false); setStayErrors({}) }
  const saveStayEdit = async () => {
    if (!stay || !realStayId) return
    const errors: Partial<Record<keyof StayDraft, string>> = {}
    if (!Number.isFinite(stayDraft.paxCount) || stayDraft.paxCount < 1) errors.paxCount = 'Mínimo 1'
    if (stayDraft.paxCount > 20) errors.paxCount = 'Máximo 20'
    if (Object.keys(errors).length > 0) { setStayErrors(errors); return }

    const orig = emptyStayDraft()
    const patch: Partial<StayDraft> = {}
    if (stayDraft.paxCount !== orig.paxCount) patch.paxCount = stayDraft.paxCount
    if (stayDraft.arrivalNotes.trim() !== (orig.arrivalNotes || '').trim()) {
      patch.arrivalNotes = stayDraft.arrivalNotes.trim()
    }
    if (Object.keys(patch).length === 0) { setStayEditMode(false); return }

    // paxCount post-checkin → abrimos ChangeConfirmDialog para confirmar
    // con diff visible + razón (opcional, audit log). Sin approval bloqueante
    // del manager (política Cloudbeds/Mews — iter 6).
    if (patch.paxCount !== undefined && stayPhase === 'POST_CHECKIN') {
      const orig = stay.paxCount
      setConfirmCtx({
        field: 'paxCount',
        before: `${orig} pax`,
        after:  `${patch.paxCount} pax`,
        rawAfter: String(patch.paxCount),
        requireApproval: false,
        derivedSummary: 'Cambio post-checkin — queda registrado en audit trail.',
      })
      setConfirmResolver(() => (confirmed: boolean) => {
        if (confirmed) setStayEditMode(false)
      })
      return
    }

    try {
      await updateMut.mutateAsync({ stayId: realStayId, patch })
      setStayEditMode(false)
    } catch { /* hook ya muestra toast.error */ }
  }

  // ── Pago tab bulk-edit ──────────────────────────────────────────────────
  type PaymentDraft = { ratePerNight: number }
  const emptyPaymentDraft = (): PaymentDraft => ({
    ratePerNight: Number(stay?.ratePerNight ?? 0),
  })
  const [paymentEditMode, setPaymentEditMode] = useState(false)
  const [paymentDraft,    setPaymentDraft]    = useState<PaymentDraft>(emptyPaymentDraft)
  const [paymentErrors,   setPaymentErrors]   = useState<Partial<Record<keyof PaymentDraft, string>>>({})
  const enterPaymentEdit = () => { setPaymentDraft(emptyPaymentDraft()); setPaymentErrors({}); setPaymentEditMode(true) }
  const cancelPaymentEdit = () => { setPaymentEditMode(false); setPaymentErrors({}) }
  const savePaymentEdit = async () => {
    if (!stay || !realStayId) return
    const errors: Partial<Record<keyof PaymentDraft, string>> = {}
    if (!Number.isFinite(paymentDraft.ratePerNight) || paymentDraft.ratePerNight < 0) {
      errors.ratePerNight = 'Tarifa inválida'
    }
    if (Object.keys(errors).length > 0) { setPaymentErrors(errors); return }

    const orig = emptyPaymentDraft()
    if (paymentDraft.ratePerNight === orig.ratePerNight) {
      setPaymentEditMode(false); return
    }

    // Post-checkout: bloqueado (CFDI lock) — backend lo rechazará pero
    // mejor short-circuit aquí con mensaje claro.
    if (stayPhase === 'POST_CHECKOUT') {
      toast.error('Reserva cerrada — usar nota de crédito para correcciones monetarias')
      return
    }

    // Post-checkin: abrir ChangeConfirmDialog con diff + razón (opcional).
    // Sin approval bloqueante del manager (política Cloudbeds/Mews iter 6).
    // El cambio queda registrado en GuestStayLog para auditoría posterior.
    if (stayPhase === 'POST_CHECKIN') {
      const newTotal = paymentDraft.ratePerNight * nights
      const oldTotal = orig.ratePerNight * nights
      const delta = newTotal - oldTotal
      setConfirmCtx({
        field: 'ratePerNight',
        before: `${stay.currency} ${orig.ratePerNight.toFixed(2)}`,
        after:  `${stay.currency} ${paymentDraft.ratePerNight.toFixed(2)}`,
        rawAfter: String(paymentDraft.ratePerNight),
        requireApproval: false,
        derivedSummary:
          `Total: ${stay.currency} ${oldTotal.toFixed(2)} → ` +
          `${stay.currency} ${newTotal.toFixed(2)} (${delta >= 0 ? '+' : ''}${stay.currency} ${delta.toFixed(2)}).`,
      })
      setConfirmResolver(() => (confirmed: boolean) => {
        if (confirmed) setPaymentEditMode(false)
      })
      return
    }

    // Pre-checkin: PATCH directo, sin modal.
    try {
      await updateMut.mutateAsync({
        stayId: realStayId,
        patch: { ratePerNight: paymentDraft.ratePerNight },
      })
      setPaymentEditMode(false)
    } catch { /* hook ya toast.error */ }
  }

  // ── Guest tab bulk-edit (Sprint EDIT-RESERVATION iteración 2) ──────────
  // Pattern Mews/Cloudbeds: un solo botón "Editar" arriba del tab toggle-ea
  // todos los inputs simultáneamente. Save dispara UN PATCH con sólo los
  // campos modificados — más eficiente que 5 PATCH individuales y un solo
  // entry de audit log agrupa todos los cambios.
  type GuestDraft = {
    guestName:      string
    guestEmail:     string
    guestPhone:     string
    nationality:    string
    documentType:   string
    documentNumber: string
  }
  const emptyGuestDraft = (): GuestDraft => ({
    guestName:      stay?.guestName      ?? '',
    guestEmail:     stay?.guestEmail     ?? '',
    guestPhone:     stay?.guestPhone     ?? '',
    nationality:    stay?.nationality    ?? '',
    documentType:   stay?.documentType   ?? '',
    documentNumber: stay?.documentNumber ?? '',
  })
  const [guestEditMode, setGuestEditMode] = useState(false)
  const [guestDraft,    setGuestDraft]    = useState<GuestDraft>(emptyGuestDraft)
  const [guestErrors,   setGuestErrors]   = useState<Partial<Record<keyof GuestDraft, string>>>({})
  const [docPhotoUploadOpen, setDocPhotoUploadOpen] = useState(false)

  // ── Payment void + register state ──────────────────────────────────────
  const [voidTarget, setVoidTarget] = useState<PaymentLogDto | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const paymentsQuery  = useStayPayments(realStayId)
  const voidMut        = useVoidPayment(realStayId ?? '', propertyId ?? '')
  const registerMut    = useRegisterPayment(realStayId ?? '', propertyId ?? '')
  // Context (propertyCurrency + secondaryRates + paymentModel) reusado del
  // mismo query cache que el ConfirmCheckinDialog — un solo round-trip.
  const stayContext    = useStayContext(realStayId)

  // ── SSE concurrent edit banner ──────────────────────────────────────────
  const { staleByOtherSession, dismiss: dismissStale } = useStayUpdatedSSE({
    stayId: realStayId,
    currentUserId,
  })

  // Helpers del bulk-edit del tab Huésped.
  const enterGuestEdit = () => {
    setGuestDraft(emptyGuestDraft())
    setGuestErrors({})
    setGuestEditMode(true)
  }
  const cancelGuestEdit = () => {
    setGuestEditMode(false)
    setGuestErrors({})
  }
  const saveGuestEdit = async () => {
    if (!stay || !realStayId) return

    // Validación local pre-PATCH (Apple HIG error prevention).
    const errors: Partial<Record<keyof GuestDraft, string>> = {}
    if (guestDraft.guestName.trim().length === 0) errors.guestName = 'Nombre requerido'
    if (guestDraft.guestEmail.trim() !== ''
        && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDraft.guestEmail.trim())) {
      errors.guestEmail = 'Email inválido'
    }
    if (Object.keys(errors).length > 0) { setGuestErrors(errors); return }

    // Diff vs original — sólo enviamos lo que cambió.
    const patch: Partial<GuestDraft> = {}
    const original = emptyGuestDraft()
    for (const k of Object.keys(guestDraft) as (keyof GuestDraft)[]) {
      if (guestDraft[k].trim() !== original[k].trim()) {
        patch[k] = guestDraft[k].trim()
      }
    }

    // Sin cambios → solo cerrar el modo edit sin tocar el backend.
    if (Object.keys(patch).length === 0) { setGuestEditMode(false); return }

    try {
      await updateMut.mutateAsync({ stayId: realStayId, patch })
      setGuestEditMode(false)
    } catch {
      // El hook ya muestra toast.error — mantenemos modo edit para reintentar.
    }
  }

  const refreshStaleData = useCallback(() => {
    if (!realStayId || !propertyId) return
    qc.invalidateQueries({ queryKey: ['guest-stays', propertyId], exact: false, refetchType: 'active' })
    qc.invalidateQueries({ queryKey: ['stay-journeys-timeline', propertyId], exact: false, refetchType: 'active' })
    qc.invalidateQueries({ queryKey: ['stay-payments', realStayId], refetchType: 'active' })
    qc.invalidateQueries({ queryKey: ['guest-stay-notes', realStayId], refetchType: 'active' })
    dismissStale()
  }, [realStayId, propertyId, qc, dismissStale])

  if (!stay) return null

  const status = getStayStatus(stay.checkIn, stay.checkOut, stay.actualCheckout, stay.actualCheckin, stay.noShowAt)
  const statusColors = STAY_STATUS_COLORS[status]
  // Sprint CHANNEX-UX-E2-E3 §149 — resolveOtaDisplay unifica channex slug + legacy
  // source en un solo brand chip (color oficial Booking navy / Airbnb coral / etc.)
  const otaMeta = resolveOtaDisplay(stay.channexOtaName, stay.source)
  const otaColor = otaMeta.color

  const isNoShow  = !!stay.noShowAt
  const canRevert = isNoShow && differenceInHours(new Date(), stay.noShowAt!) < 48

  // isArrivalDay: check-in date is exactly today (day granularity).
  // Distinguishes two mutually exclusive IN_HOUSE sub-cases:
  //   · isArrivalDay  → guest might not have arrived yet → "Marcar no-show"
  //   · !isArrivalDay → past check-in day, system assumes guest arrived → "Salida anticipada"
  // ARRIVING (future check-in) is excluded: you cannot no-show someone before their arrival day.
  const isArrivalDay = startOfDay(new Date(stay.checkIn)).getTime() === startOfDay(new Date()).getTime()
  const isUnconfirmed    = status === 'UNCONFIRMED'
  const canNoShow          = !isNoShow && isArrivalDay && !stay.actualCheckin
  const canConfirmCheckin  = !stay.actualCheckin && !isNoShow && isArrivalDay
  // Allow early checkout if IN_HOUSE and either it's not arrival day, OR the guest
  // already confirmed check-in (actualCheckin set) — covers arrival-day check-ins.
  const canEarlyCheckout   = !isNoShow && status === 'IN_HOUSE' && (!isArrivalDay || !!stay.actualCheckin)
  // Cancel-Archive: solo pre-checkin, no IN_HOUSE/DEPARTED/NO_SHOW/CANCELLED.
  const canCancel = !isNoShow && !stay.actualCheckin && !stay.actualCheckout && !stay.cancelledAt

  const isRoomMove = stay.segmentReason === 'ROOM_MOVE'
  const isSplit    = stay.segmentReason === 'SPLIT'
  const isExtension =
    stay.segmentReason === 'EXTENSION_SAME_ROOM' ||
    stay.segmentReason === 'EXTENSION_NEW_ROOM'

  // Third chip: segment context (optional). Only shown when this block is *not*
  // the original reservation — the user can skim color + short label instead of
  // reading the banner below. Max 3 chips total (status + OTA + segment).
  const segmentChip =
    isExtension ? { label: 'Extensión', bg: 'rgba(16,185,129,0.14)', fg: '#047857', border: 'rgba(16,185,129,0.30)' }
    : isRoomMove ? { label: 'Cambio hab.', bg: 'rgba(59,130,246,0.14)', fg: '#1D4ED8', border: 'rgba(59,130,246,0.30)' }
    : isSplit    ? { label: 'División',    bg: 'rgba(139,92,246,0.14)', fg: '#6D28D9', border: 'rgba(139,92,246,0.30)' }
    : null

  const nights = differenceInDays(
    new Date(stay.checkOut),
    new Date(stay.checkIn)
  )

  const nightlyRate =
    nights > 0 ? stay.totalAmount / nights : stay.totalAmount

  const paidPercent =
    stay.totalAmount > 0
      ? Math.round((stay.amountPaid / stay.totalAmount) * 100)
      : 0

  const balance = stay.totalAmount - stay.amountPaid

  return (
    <>
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        // Inspector pattern — calendar permanece 100% visible mientras se ve el
        // detalle. Apple HIG (Inspector), Mews/Cloudbeds (Reservation drawer)
        // y NN/g coinciden: backdrops oscuros sólo para modales bloqueantes
        // (confirmaciones destructivas), no para paneles de navegación lateral.
        overlayClassName="bg-transparent"
        // 2026-05-15 — Radix por default mueve focus al primer elemento focusable
        // del sheet al abrir (botón "Ver completa"). El ring focus-visible queda
        // pintado permanentemente y parece selección "pegajosa". preventDefault
        // suprime el auto-focus inicial — el usuario puede tabbear si quiere
        // navegar con teclado. Pattern recomendado por Radix Dialog para
        // inspector-style panels que no requieren acción inmediata del usuario.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // 2026-05-17 (iter 4 final) — Los 3 dialogs hijos
        // (RegisterPaymentDialog, VoidPaymentDialog, ChangeConfirmDialog) se
        // refactorizaron a Radix Dialog primitives. Radix soporta NESTED
        // dialogs nativamente: el inner FocusScope toma precedencia sobre el
        // outer Sheet, el DismissableLayer maneja stack de capas, los pointer
        // events se respetan automáticamente. No se requieren bypass manuales
        // de onPointerDownOutside / onInteractOutside / onFocusOutside.
        // Pattern: usar Radix primitives para todos los modales que vivan
        // dentro del Sheet — NO inventar contenedores fixed manualmente.
        className="w-[420px] sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col overflow-hidden gap-0 shadow-[-12px_0_32px_-8px_rgba(15,23,42,0.18)]"
      >
        {/* HEADER */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ backgroundColor: statusColors.bg }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle
                className="text-lg font-bold truncate"
                style={{ color: statusColors.text }}
              >
                {stay.guestName}
              </SheetTitle>

              <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                {/* Chip 1 — estado de la reserva (fase operativa) */}
                {isNoShow ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    No-show
                  </span>
                ) : isUnconfirmed ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)] bg-amber-100 text-amber-800 border border-amber-300">
                    Sin confirmar
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    style={{
                      backgroundColor: `${otaColor}20`,
                      color: otaColor,
                      border: `1px solid ${otaColor}40`,
                    }}
                  >
                    {status === 'IN_HOUSE'
                      ? 'Alojado'
                      : status === 'ARRIVING'
                      ? 'Por llegar'
                      : status === 'DEPARTING'
                      ? 'Sale hoy'
                      : 'Salió'}
                  </span>
                )}

                {/* Chip 2 — OTA brand chip (color + label oficial del canal).
                    Sprint CHANNEX-UX-E2-E3 §149: usa Channex slug si está, sino
                    fallback a source legacy. Color/label/textTone vienen de
                    resolveOtaDisplay → coherencia visual con marketing del OTA. */}
                {(stay.channexOtaName || stay.otaName) && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    style={{
                      backgroundColor: otaColor,
                      color: otaMeta.textTone === 'light' ? '#FFFFFF' : '#0F172A',
                    }}
                  >
                    {otaMeta.label}
                  </span>
                )}

                {/* Chip 3 — contexto del segmento (solo si aplica) */}
                {segmentChip && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    style={{
                      backgroundColor: segmentChip.bg,
                      color: segmentChip.fg,
                      border: `1px solid ${segmentChip.border}`,
                    }}
                  >
                    {segmentChip.label}
                  </span>
                )}
              </div>
            </div>

            {/* Header controls: full-page link + close.
                ID debajo del link "Ver completa" como texto plano copiable
                (sin chip). bookingRef preferido (MX-D-001-YYMM-NNNN),
                UUID short fallback solo para legacy/seed sin ref. */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onClose()
                    navigate(`/reservations/${stay.guestStayId ?? stay.id}`)
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                  style={{ color: `${statusColors.text}99` }}
                  title="Ver reserva completa"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="hidden sm:inline">Ver completa</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
                  style={{ color: `${statusColors.text}99` }}
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ID copiable — solo se muestra cuando hay bookingRef formal
                  (MX-D-001-YYMM-NNNN del generator). Para stays legacy/seed
                  sin bookingRef NO se renderiza — mostrar UUID interno como
                  "ID" confunde al usuario (nomenclatura no acordada). */}
              {stay.bookingRef && (
                <InlineCopyId value={stay.bookingRef} statusText={statusColors.text} />
              )}
            </div>
          </div>
        </div>

        {/* OTA accent */}
        <div
          className="h-[3px] flex-shrink-0"
          style={{ backgroundColor: otaColor }}
        />

        {/* No-show status banner — explains the visual (diagonal stripes, NS badge) and shows the timeline */}
        {isNoShow && (
          <div className="mx-4 mt-3 mb-1 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 flex items-start gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <UserX className="h-3.5 w-3.5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-800">No-show confirmado</p>
              <p className="text-[11px] text-red-600 mt-0.5">
                Marcado el{' '}
                {format(stay.noShowAt!, "d 'de' MMMM · HH:mm", { locale: es })}
              </p>
              {canRevert ? (
                <p className="text-[10px] text-red-500 mt-1 font-medium flex items-center gap-1">
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  Ventana de reversión activa (48 h) · usa el botón de abajo
                </p>
              ) : (
                <p className="text-[10px] text-red-400 mt-1">
                  Habitación liberada y disponible para nueva venta
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Banner concurrent-edit (Sprint EDIT-RESERVATION) ────────────
            SSE detectó que otra sesión escribió esta reserva. Apple HIG:
            visibilidad del estado del sistema + respeto de la agencia
            (no auto-refrescar — usuario decide). */}
        {staleByOtherSession && (
          <div className="mx-4 mt-1 mb-2 shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-center gap-2 text-[11px]">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="flex-1 text-amber-800 leading-snug">
              Otra sesión actualizó esta reserva.
            </span>
            <button
              type="button"
              onClick={refreshStaleData}
              className="font-semibold text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={dismissStale}
              className="text-amber-500 hover:text-amber-700 p-0.5"
              aria-label="Descartar aviso"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Tabs: list OUTSIDE the scroll area so it stays fixed while content scrolls.
            Controlled — necesitamos el active tab para condicionalmente ocultar
            el footer de acciones cuando estás en "Notas" (la barra de acciones
            destructivas/CTA no aporta en el contexto del chat). */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'stay' | 'payment' | 'guest' | 'notes')}
          className="flex-1 flex flex-col min-h-0"
        >{/* px-4 py-2 (en vez de py-3) reduce gap visual del tab-pill al primer
            elemento. Apple Tabs sample: 8pt entre pill y content. */}
          <div className="px-4 py-2 shrink-0">
            <TabsList className="w-full h-9 bg-slate-100 rounded-xl p-1 grid grid-cols-4">
              {(['stay', 'payment', 'guest', 'notes'] as const).map((v) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className={cn(
                    'rounded-lg text-xs font-medium transition-all',
                    'text-slate-500',
                    'data-[state=active]:bg-white data-[state=active]:shadow-sm',
                    'data-[state=active]:text-slate-900 data-[state=active]:font-semibold',
                  )}
                >
                  {v === 'stay' ? 'Estadía'
                    : v === 'payment' ? 'Pago'
                    : v === 'guest' ? 'Huésped'
                    : 'Notas'}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* TAB ESTADÍA — Sprint EDIT-RESERVATION iter 3 bulk-edit
                Campos editables: paxCount + arrivalNotes.
                Pattern: EditableSectionHeader sticky con Editar/Cancelar/Guardar. */}
            <TabsContent value="stay" className="mt-0 ">
              <div className="p-4 space-y-3">
                <EditableSectionHeader
                  title="Estadía"
                  editMode={stayEditMode}
                  canEdit={!isStayLockedHard}
                  isSaving={updateMut.isPending}
                  disabledReason={isStayLockedHard
                    ? (stay.cancelledAt ? 'Reserva cancelada' : 'Flujo no-show')
                    : undefined}
                  onEnterEdit={enterStayEdit}
                  onCancel={cancelStayEdit}
                  onSave={() => void saveStayEdit()}
                />
                {/* Fechas */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-stretch gap-3">
                    {/* Checkin */}
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Check-in
                      </div>

                      <div className="text-base font-bold text-slate-800 mt-1 leading-tight">
                        {format(new Date(stay.checkIn), 'EEE d MMM', {
                          locale: es,
                        })}
                      </div>

                      <div className="text-sm font-semibold text-slate-700">
                        {format(new Date(stay.checkIn), 'yyyy', {
                          locale: es,
                        })}
                      </div>

                      {/* Hora: si hay actualCheckin mostramos hora real con
                          tipografía emerald (registrado); si no, hora target. */}
                      {stay.actualCheckin ? (
                        <div className="text-[11px] font-semibold text-emerald-700 mt-0.5 tabular-nums">
                          {format(new Date(stay.actualCheckin), 'HH:mm', { locale: es })}
                          <span className="text-[10px] text-emerald-600 font-normal ml-1">registrado</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          15:00
                        </div>
                      )}
                    </div>

                    {/* Nights */}
                    <div className="flex flex-col items-center justify-center px-2">
                      <Moon className="h-4 w-4 text-slate-300 mb-1" />

                      <div className="text-sm font-bold font-mono text-slate-600">
                        {nights}n
                      </div>

                      <div className="w-8 h-px bg-slate-200 my-1" />
                    </div>

                    {/* Checkout */}
                    <div className="flex-1 text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Check-out
                      </div>

                      <div className="text-base font-bold text-slate-800 mt-1 leading-tight">
                        {format(new Date(stay.checkOut), 'EEE d MMM', {
                          locale: es,
                        })}
                      </div>

                      <div className="text-sm font-semibold text-slate-700">
                        {format(new Date(stay.checkOut), 'yyyy', {
                          locale: es,
                        })}
                      </div>

                      {stay.actualCheckout ? (
                        <div className="text-[11px] font-semibold text-emerald-700 mt-0.5 tabular-nums">
                          {format(new Date(stay.actualCheckout), 'HH:mm', { locale: es })}
                          <span className="text-[10px] text-emerald-600 font-normal ml-1">registrado</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          12:00
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Segment context (unificado 2026-05-19 iter 3) ────────────
                    Antes: 4 banners distintos (extensión-same, extensión-new,
                    room-move, split) cada uno con tamaño/altura diferente y
                    el de EXTENSION_NEW_ROOM ocupaba ~80px de alto innecesarios.
                    Ahora: 1 sola fila compacta (32px alto) con icono semántico
                    + descripción concisa. Patrón Apple Calendar inline metadata
                    bar. Para detalle (timestamp, actor, secuencia de moves) →
                    Historial tab. */}
                <SegmentContextLine
                  segmentReason={stay.segmentReason}
                  nights={nights}
                  originalRoomNumber={stay.originalRoomNumber}
                  roomNumber={stay.roomNumber}
                />

                {/* Room + pax */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Habitación
                    </div>

                    <div className="text-base font-bold text-slate-800 mt-1">
                      {stay.roomNumber ??
                        stay.roomId.replace('r-', 'Hab. ')}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Huéspedes
                    </div>

                    <div className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-slate-400" />
                      {stayEditMode && !stay.actualCheckout ? (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={stayDraft.paxCount}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            setStayDraft({ ...stayDraft, paxCount: Number.isFinite(v) ? v : 1 })
                            if (stayErrors.paxCount) setStayErrors({ ...stayErrors, paxCount: undefined })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); void saveStayEdit() }
                            if (e.key === 'Escape') { e.preventDefault(); cancelStayEdit() }
                          }}
                          className={cn(
                            'w-16 px-2 py-1 text-base rounded border bg-white outline-none tabular-nums',
                            '[-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0',
                            stayErrors.paxCount
                              ? 'border-rose-400 ring-1 ring-rose-200'
                              : 'border-slate-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200',
                          )}
                        />
                      ) : (
                        <span>{stay.paxCount}</span>
                      )}
                      {stayEditMode && stay.actualCheckout && (
                        <span className="text-[10px] text-amber-600 italic font-normal">
                          · bloqueado (fiscal)
                        </span>
                      )}
                    </div>
                    {stayErrors.paxCount && (
                      <p className="text-[11px] text-rose-600 mt-1">{stayErrors.paxCount}</p>
                    )}
                  </div>
                </div>

                {/* IDs adicionales — bookingRef + ID interno ya viven en el header.
                    Aquí mostramos solo IDs externos (OTA, PMS legacy distinto) cuando aplican.
                    Sprint CHANNEX-UX-E2-E3: ahora también renderiza cuando hay
                    `channexBookingId` (reservas OTA vía Channex sin otaReservationId
                    legacy). El operador necesita ver Channex ID + chip sync incluso
                    si la OTA no expone su propio ID interno (caso común Booking.com). */}
                {(stay.otaReservationId || stay.channexBookingId || (stay.pmsReservationId && stay.pmsReservationId !== stay.bookingRef)) && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      IDs externos
                    </div>

                    <div className="bg-slate-50 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {stay.pmsReservationId && stay.pmsReservationId !== stay.bookingRef && (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-slate-400 font-mono uppercase tracking-wide">
                            PMS ID
                          </span>
                          <CopyableId value={stay.pmsReservationId} />
                        </div>
                      )}

                      {stay.otaReservationId && (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-slate-400 font-mono uppercase tracking-wide">
                            {stay.otaName} ID
                          </span>
                          <CopyableId value={stay.otaReservationId} />
                        </div>
                      )}

                      {/* Sprint CHANNEX-INBOUND — info OTA específica via Channel
                          Manager. Visible solo cuando la reserva vino por Channex.
                          Recepción usa channex_booking_id para cross-referenciar
                          con extranet del OTA en caso de disputa. */}
                      {stay.channexBookingId && (
                        <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-100">
                          <span className="text-xs text-slate-400 font-mono uppercase tracking-wide">
                            Channex ID
                          </span>
                          <CopyableId value={stay.channexBookingId} />
                        </div>
                      )}
                      {/* Sprint CHANNEX-UX-E2-E3 §151 (D-CHX-UX-E2.2)
                          Chip dinámico de sync con OTA. Estados:
                            - cancelled + syncedAfterCancel: verde "✓ Cancelado en {ota} hace Xs"
                            - cancelled + NO syncedAfterCancel: amber "⏳ Sincronizando con {ota}…"
                            - active + lastSyncAt: gris sutil "Última sync hace Xs"
                          Reemplaza al row "Última sync OTA" plano para alinearse
                          con Cloudbeds chip-pattern (queja #1 cross-PMS: silent fail). */}
                      <ChannexSyncChip stay={stay} />

                      {stay.paymentModel === 'OTA_COLLECT' && (
                        <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-100 bg-blue-50/40">
                          <span className="text-xs text-blue-900 font-medium uppercase tracking-wide">
                            Pago por OTA
                          </span>
                          <span className="text-xs text-blue-800">
                            Cobrado por {otaMeta.label} · folio marca PAID
                          </span>
                        </div>
                      )}
                      {stay.channexConflict && (
                        <div className="flex items-center justify-between px-3 py-2.5 border-t border-amber-200 bg-amber-50">
                          <span className="text-xs text-amber-900 font-semibold uppercase tracking-wide">
                            ⚠ Conflict OTA
                          </span>
                          <a
                            href="/channex/conflicts"
                            className="text-xs text-amber-900 underline hover:text-amber-700"
                          >
                            Revisar →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Nota interna removida — redundante con tab "Notas". */}

                {/* arrivalNotes — info DEL EVENTO DE LLEGADA (pre-arrival).
                    Industry consensus 5/5 PMS (Mews, Cloudbeds, Opera, Little
                    Hotelier, RoomRaccoon): vive en el panel de la reserva (=
                    Estadía), NO en el perfil del huésped — la nota es del
                    booking arrival event, no del guest como entidad.
                    Distinto del tab Notas (thread multi-entry de turno).
                    Read-mode: oculto si vacío (cognitive load — Sweller),
                    visible con stripe ámbar si filled (pre-attentive Treisman).
                    Edit-mode: siempre visible con helper text aclarando el
                    propósito vs tab Notas (NN/g H10 documentation). */}
                {stayEditMode ? (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      Notas para recepción al arrival
                      <span className="font-normal normal-case text-slate-400 ml-1">(pre-arrival)</span>
                    </label>
                    <textarea
                      value={stayDraft.arrivalNotes}
                      onChange={(e) => setStayDraft({ ...stayDraft, arrivalNotes: e.target.value })}
                      rows={2}
                      placeholder="Llega tarde, vuelo X, equipaje en consigna…"
                      className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white outline-none
                                 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 resize-none"
                    />
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Visible en el card de la reserva. Para mensajes durante la estadía usa el tab <span className="font-semibold">Notas</span>.
                    </p>
                  </div>
                ) : stay.arrivalNotes ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">
                      Notas para recepción al arrival
                    </div>
                    <div className="text-xs text-amber-800">{stay.arrivalNotes}</div>
                  </div>
                ) : null}

                {/* W3.2 — Maintenance tickets activos en esta habitación.
                    2026-05-19 — refactor: colapsable, al final del tab (estándar
                    "core info first, ancillary last"), pixel-perfect badges,
                    fechas de inicio + fin estimado con tipografía diferenciada. */}
                {roomTickets.length > 0 && (
                  <RoomMaintenanceCallout
                    tickets={roomTickets}
                    onOpenTicket={(id) => {
                      if (onOpenMaintenanceTicket) onOpenMaintenanceTicket(id)
                      else navigate(`/maintenance?ticketId=${id}`)
                    }}
                    onViewAll={() => navigate(`/maintenance?roomId=${stay.roomId}`)}
                  />
                )}
              </div>
            </TabsContent>

            {/* TAB PAYMENT — Sprint EDIT-RESERVATION iter 3 bulk-edit
                Campo editable: ratePerNight (con approval modal on save si post-checkin). */}
            <TabsContent value="payment" className="mt-0 ">
              <div className="p-4 space-y-3">
                <EditableSectionHeader
                  title="Pago"
                  editMode={paymentEditMode}
                  canEdit={!isStayLockedHard && stayPhase !== 'POST_CHECKOUT'}
                  isSaving={updateMut.isPending}
                  disabledReason={
                    stayPhase === 'POST_CHECKOUT'
                      ? 'Cerrada — usar nota crédito'
                      : isStayLockedHard
                        ? (stay.cancelledAt ? 'Reserva cancelada' : 'Flujo no-show')
                        : undefined
                  }
                  saveTone={stayPhase === 'POST_CHECKIN' ? 'amber' : 'emerald'}
                  onEnterEdit={enterPaymentEdit}
                  onCancel={cancelPaymentEdit}
                  onSave={() => void savePaymentEdit()}
                />

                {/* ── HERO CARD (Sprint EDIT-RESERVATION iter 4) ──────────
                    Jerarquía F-pattern: saldo → status → conversión → progress → CTA.
                    En edit mode se muestra el rate editor en su lugar para no
                    duplicar UI. */}
                {paymentEditMode ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      Editando tarifa
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 shrink-0">
                        {nights} noche{nights > 1 ? 's' : ''} ×
                      </label>
                      <span className="text-xs text-slate-500 font-mono">{stay.currency}</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={paymentDraft.ratePerNight}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          setPaymentDraft({ ratePerNight: Number.isFinite(v) ? v : 0 })
                          if (paymentErrors.ratePerNight) setPaymentErrors({ ...paymentErrors, ratePerNight: undefined })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void savePaymentEdit() }
                          if (e.key === 'Escape') { e.preventDefault(); cancelPaymentEdit() }
                        }}
                        className={cn(
                          'flex-1 rounded-lg border bg-white px-3 py-2 text-base font-mono tabular-nums',
                          'focus:outline-none focus:ring-2',
                          '[-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0',
                          paymentErrors.ratePerNight
                            ? 'border-rose-400 ring-1 ring-rose-200'
                            : 'border-slate-300 focus:border-emerald-400 focus:ring-emerald-200',
                        )}
                      />
                    </div>
                    {paymentErrors.ratePerNight && (
                      <p className="text-[11px] text-rose-600">{paymentErrors.ratePerNight}</p>
                    )}
                    {(() => {
                      // Desglose financiero completo del cambio de tarifa.
                      // Sin esto, el usuario no entiende qué pasa con lo ya
                      // pagado cuando baja/sube la tarifa. Ejemplo: total $350
                      // ya pagado, baja a $280 → no es "Total cambia y ya",
                      // queda crédito a favor del huésped por $70.
                      const oldTotal = Number(stay.totalAmount)
                      const newTotal = paymentDraft.ratePerNight * nights
                      const totalDelta = newTotal - oldTotal
                      const paid = Number(stay.amountPaid)
                      const oldBalance = oldTotal - paid
                      const newBalance = newTotal - paid
                      const noChange = Math.abs(totalDelta) < 0.005
                      if (noChange) return null

                      // Resultado neto post-cambio
                      const credito = newBalance < -0.005   // crédito a favor del huésped
                      const porCobrar = newBalance > 0.005  // saldo nuevo pendiente

                      return (
                        <div className="rounded-md bg-white/70 border border-amber-200 px-3 py-2 text-[11px] space-y-1.5">
                          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5 items-baseline font-mono tabular-nums text-amber-900">
                            <span className="text-amber-700">Total</span>
                            <span className="text-amber-400 text-right">{stay.currency} {oldTotal.toFixed(2)} →</span>
                            <span className="font-bold">{stay.currency} {newTotal.toFixed(2)}</span>

                            <span className="text-amber-700">Pagado</span>
                            <span className="text-amber-400 text-right italic">sin cambio</span>
                            <span>{stay.currency} {paid.toFixed(2)}</span>

                            <span className="text-amber-700">Saldo</span>
                            <span className="text-amber-400 text-right">{stay.currency} {oldBalance.toFixed(2)} →</span>
                            <span className={cn(
                              'font-bold',
                              credito ? 'text-rose-700' : porCobrar ? 'text-amber-900' : 'text-emerald-700',
                            )}>
                              {credito ? '−' : ''}{stay.currency} {Math.abs(newBalance).toFixed(2)}
                            </span>
                          </div>

                          {/* Línea de consecuencia — qué significa el saldo nuevo */}
                          {credito && (
                            <p className="text-rose-700 font-medium leading-snug pt-1 border-t border-amber-200">
                              Queda {stay.currency} {Math.abs(newBalance).toFixed(2)} a favor del huésped (crédito devolvible al checkout).
                            </p>
                          )}
                          {porCobrar && (
                            <p className="text-amber-900 font-medium leading-snug pt-1 border-t border-amber-200">
                              Quedan {stay.currency} {newBalance.toFixed(2)} pendientes de cobrar al huésped.
                            </p>
                          )}
                          {stayPhase === 'POST_CHECKIN' && (
                            <p className="italic text-amber-700 leading-snug">
                              Al guardar se pedirá una razón del cambio (queda en audit trail).
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <PaymentHeroCard
                    paymentModel={stayContext.data?.paymentModel ?? 'HOTEL_COLLECT'}
                    totalAmount={Number(stay.totalAmount)}
                    amountPaid={Number(stay.amountPaid)}
                    balance={balance}
                    currency={stayContext.data?.propertyCurrency ?? stay.currency}
                    secondaryRates={stayContext.data?.secondaryRates}
                    otaSource={stay.source ?? null}
                    canRegisterPayment={!isStayLockedHard && stayPhase !== 'POST_CHECKOUT'}
                    onRegisterPayment={() => setRegisterOpen(true)}
                  />
                )}

                {/* ── Detalles colapsable: rate breakdown + tax (v1.0.2 CFDI-CORE) ─ */}
                <details className="group rounded-lg border border-slate-200 bg-white">
                  <summary className="cursor-pointer flex items-center justify-between px-3 py-2 text-[11px] font-medium text-slate-600 hover:text-slate-800 select-none">
                    <span>Detalles del cálculo</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <div className="px-3 pb-2.5 pt-1 space-y-1 text-[11px] text-slate-600 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span>Tarifa × noches</span>
                      <span className="font-mono tabular-nums">
                        {stay.currency} {Number(stay.ratePerNight ?? nightlyRate).toFixed(2)} × {nights}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-100">
                      <span>Total</span>
                      <span className="font-mono tabular-nums">
                        {stay.currency} {Number(stay.totalAmount).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}
                      </span>
                    </div>
                    {/* TODO v1.0.2 CFDI-CORE: insertar líneas IVA + ISH + DSA aquí */}
                  </div>
                </details>

                {/* ── MOVIMIENTOS — lista enriquecida (collector + método icon + running balance) ─ */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Movimientos
                  </div>
                  {paymentsQuery.isLoading ? (
                    <p className="text-xs text-slate-400 py-2 text-center">Cargando…</p>
                  ) : (
                    <PaymentMovementsList
                      payments={paymentsQuery.data ?? []}
                      currency={stayContext.data?.propertyCurrency ?? stay.currency}
                      secondaryRates={stayContext.data?.secondaryRates}
                      canVoid={!isStayLockedHard}
                      isVoidPending={voidMut.isPending}
                      onVoid={(p) => setVoidTarget(p)}
                    />
                  )}
                </div>

              {/* ── Sección de cargo de no-show (visible solo si hay noShowAt) ── */}
              {stay.noShowAt && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3.5 space-y-3">
                  <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Cargo de no-show
                    {stay.noShowFeeAmount != null && (
                      <span className="ml-auto font-mono">
                        {stay.noShowFeeCurrency ?? stay.currency}{' '}
                        {stay.noShowFeeAmount.toLocaleString()}
                      </span>
                    )}
                  </p>

                  {/*
                    Sprint POST-NETFLIX-TRIAL (2026-05-29) — flujo admin del cobro.
                    Stripe NO se usa para no-show (fuera del scope — Stripe solo
                    para subscription billing del hotel + booking engine). Recepción
                    cobra fuera de Zenix (efectivo / OTA VCC / POS) y registra el
                    outcome via POST /v1/guest-stays/:id/register-noshow-charge.
                  */}

                  {/* OTA Guarantee — datos de tarjeta enviados por la OTA en booking_new */}
                  {stay.channexGuaranteeMeta && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-2.5 py-2 text-[11px] text-sky-900">
                      <div className="font-semibold flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Datos OTA para cobro
                        {stay.channexGuaranteeMeta.isVirtual && (
                          <span className="ml-auto rounded bg-sky-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-900">
                            Virtual Card
                          </span>
                        )}
                      </div>
                      <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                        {stay.channexGuaranteeMeta.cardType && (
                          <>
                            <dt className="text-sky-700">Tipo</dt>
                            <dd className="font-mono text-sky-900">{stay.channexGuaranteeMeta.cardType}</dd>
                          </>
                        )}
                        {stay.channexGuaranteeMeta.masked && (
                          <>
                            <dt className="text-sky-700">Tarjeta</dt>
                            <dd className="font-mono text-sky-900">{stay.channexGuaranteeMeta.masked}</dd>
                          </>
                        )}
                        {stay.channexGuaranteeMeta.expirationDate && (
                          <>
                            <dt className="text-sky-700">Vence</dt>
                            <dd className="font-mono text-sky-900">{stay.channexGuaranteeMeta.expirationDate}</dd>
                          </>
                        )}
                        {stay.channexGuaranteeMeta.meta?.balance != null && (
                          <>
                            <dt className="text-sky-700">Balance VCC</dt>
                            <dd className="font-mono text-sky-900">
                              {stay.channexGuaranteeMeta.meta.currency ?? ''}{' '}
                              {String(stay.channexGuaranteeMeta.meta.balance)}
                            </dd>
                          </>
                        )}
                        {stay.channexGuaranteeMeta.meta?.effectiveDate && (
                          <>
                            <dt className="text-sky-700">VCC activa</dt>
                            <dd className="font-mono text-sky-900">{stay.channexGuaranteeMeta.meta.effectiveDate}</dd>
                          </>
                        )}
                      </dl>
                      <p className="mt-1.5 text-[10px] text-sky-700">
                        Usa estos datos en tu terminal POS para procesar el cargo manualmente,
                        luego registra el resultado aquí.
                      </p>
                    </div>
                  )}

                  {/* Estado actual del cargo */}
                  {stay.noShowChargeStatus === 'PENDING' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-700">
                        Cargo pendiente — cobra en caja / terminal / OTA VCC y registra el resultado.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setShowNoShowChargeDialog(true)}
                        className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      >
                        Registrar cobro
                      </Button>
                    </div>
                  )}

                  {stay.noShowChargeStatus === 'CHARGED' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Cobro registrado ✓
                      </p>
                      {stay.noShowChargeMethod && (
                        <p className="text-[10px] text-slate-600">
                          Método: <span className="font-medium">{stay.noShowChargeMethod}</span>
                          {stay.noShowChargeReference && <> · Ref: <span className="font-mono">{stay.noShowChargeReference}</span></>}
                          {stay.noShowChargeAt && (
                            <> · {format(stay.noShowChargeAt, "d MMM HH:mm", { locale: es })}</>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {stay.noShowChargeStatus === 'FAILED' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-red-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        Cobro fallido
                        {stay.noShowChargeMethod && (
                          <span className="text-slate-500">· {stay.noShowChargeMethod}</span>
                        )}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNoShowChargeDialog(true)}
                        className="w-full h-8 text-xs"
                      >
                        Reintentar / actualizar outcome
                      </Button>
                    </div>
                  )}

                  {stay.noShowChargeStatus === 'WAIVED' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                        Cargo perdonado
                      </p>
                      {stay.noShowChargeReason && (
                        <p className="text-[10px] text-slate-600 italic">"{stay.noShowChargeReason}"</p>
                      )}
                    </div>
                  )}

                  {stay.noShowChargeStatus === 'NOT_APPLICABLE' && (
                    <p className="text-[11px] text-slate-500">Sin cargo aplicable</p>
                  )}
                </div>
              )}
              </div>{/* /wrapper "p-4 space-y-3" del tab Pago bulk-edit */}
            </TabsContent>

            {/* TAB GUEST — Sprint EDIT-RESERVATION bulk-edit pattern.
                Mews/Cloudbeds: un botón "Editar" arriba toggle-ea todos los
                inputs simultáneamente; "Guardar cambios" dispara un solo
                PATCH con sólo los campos modificados (1 audit log entry agrupado). */}
            <TabsContent value="guest" className="mt-0 ">
              <div className="p-4 space-y-2">
                {(() => {
                  const isStayLocked = !!stay.cancelledAt || !!stay.noShowAt
                  const isPostCheckout = !!stay.actualCheckout
                  const canEditAny = !isStayLocked
                  return (
                    <>
                      <EditableSectionHeader
                        title="Datos del huésped"
                        editMode={guestEditMode}
                        canEdit={canEditAny}
                        isSaving={updateMut.isPending}
                        disabledReason={isStayLocked
                          ? (stay.cancelledAt ? 'Reserva cancelada' : 'Flujo no-show')
                          : undefined}
                        onEnterEdit={enterGuestEdit}
                        onCancel={cancelGuestEdit}
                        onSave={() => void saveGuestEdit()}
                      />

                      {/* Banner stay locked (cancelled/no-show) */}
                      {isStayLocked && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-snug">
                          Reserva {stay.cancelledAt ? 'cancelada' : 'en flujo no-show'} — datos congelados para audit trail.
                        </div>
                      )}

                      {/* Foto del documento — capturada al check-in (§108).
                          Thumbnail clickeable abre lightbox fullscreen.
                          Visa CRR §5.9.2 chargeback evidence visible al staff. */}
                      <DocumentPhotoCard
                        photoUrl={stayContext.data?.stay.documentPhotoUrl}
                        documentType={stayContext.data?.stay.documentType ?? stay.documentType}
                        guestName={stay.guestName}
                        canUpload={canEditAny && !isPostCheckout}
                        onUploadRequest={() => setDocPhotoUploadOpen(true)}
                      />


                      {/* Banner post-checkout — algunos campos siguen editables. */}
                      {!isStayLocked && isPostCheckout && guestEditMode && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
                          Reserva ya cerrada — documento queda bloqueado por audit fiscal. Otros campos siguen editables.
                        </div>
                      )}

                      {/* Lista de campos — display o input según editMode. */}
                      {(() => {
                        // CHECK-IN C1.12 hotfix 2026-05-29 — fallback a
                        // stayContext.data.stay para los datos del huésped.
                        // Bug: el `stay` prop viene del array `useGuestStays`
                        // (queryKey `guest-stays`) que puede ser stale si
                        // el create-reservation invalidate no completó refetch
                        // a tiempo. stayContext usa queryKey distinto
                        // (`checkin-context`) y SIEMPRE refetcha al abrir el
                        // sheet — es la fuente más fresca. Aplica a fields
                        // editables por el bulk-edit (guestName/Email/Phone/
                        // nationality/documentType/documentNumber).
                        const ctxStay = stayContext.data?.stay
                        const guestName      = ctxStay?.guestName ?? stay.guestName
                        const guestPhone     = ctxStay?.guestPhone ?? stay.guestPhone
                        const guestEmail     = ctxStay?.guestEmail ?? stay.guestEmail
                        const nationality    = ctxStay?.nationality ?? stay.nationality
                        const documentType   = ctxStay?.documentType ?? stay.documentType
                        const documentNumber = ctxStay?.documentNumber ?? stay.documentNumber
                        return [
                        {
                          icon: User, label: 'Nombre', field: 'guestName' as const,
                          value: guestName, type: 'text',
                          placeholder: 'Nombre completo del huésped',
                        },
                        {
                          icon: Phone, label: 'WhatsApp', field: 'guestPhone' as const,
                          value: guestPhone, type: 'tel',
                          placeholder: '+52 123 456 7890',
                        },
                        {
                          icon: MapPin, label: 'Nacionalidad', field: 'nationality' as const,
                          value: nationality, type: 'text',
                          placeholder: 'MX, US, FR…',
                        },
                        {
                          icon: FileText, label: 'Documento', field: 'documentNumber' as const,
                          value: documentNumber, type: 'text',
                          placeholder: 'Pasaporte / INE / Cédula',
                          displayValue: documentNumber
                            ? (documentType
                                ? `${documentType.toUpperCase()} · ${documentNumber}`
                                : documentNumber)
                            : null,
                          fiscalLocked: isPostCheckout,
                        },
                        {
                          icon: Mail, label: 'Email', field: 'guestEmail' as const,
                          value: guestEmail, type: 'email',
                          placeholder: 'huesped@ejemplo.com',
                        },
                      ]})().map(({ icon: Icon, label, field, value, type, placeholder, displayValue, fiscalLocked }) => {
                        const isEditingThis = guestEditMode && !fiscalLocked
                        const error = guestErrors[field]
                        return (
                          <div
                            key={label}
                            className={cn(
                              'flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors',
                              isEditingThis ? 'bg-white border border-emerald-200' : 'bg-slate-50',
                            )}
                          >
                            <div className="w-7 h-7 bg-white rounded-md border border-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Icon className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[9px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                {label}
                                {guestEditMode && fiscalLocked && (
                                  <span className="text-amber-600 normal-case font-normal italic">
                                    · bloqueado (fiscal)
                                  </span>
                                )}
                              </div>
                              {isEditingThis ? (
                                <>
                                  <input
                                    type={type}
                                    value={guestDraft[field]}
                                    onChange={(e) => {
                                      setGuestDraft({ ...guestDraft, [field]: e.target.value })
                                      if (error) setGuestErrors({ ...guestErrors, [field]: undefined })
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { e.preventDefault(); void saveGuestEdit() }
                                      if (e.key === 'Escape') { e.preventDefault(); cancelGuestEdit() }
                                    }}
                                    placeholder={placeholder}
                                    autoFocus={field === 'guestName'}
                                    className={cn(
                                      'w-full mt-1 px-2 py-1 text-sm rounded border bg-white outline-none',
                                      'transition-shadow',
                                      error
                                        ? 'border-rose-400 ring-1 ring-rose-200'
                                        : 'border-slate-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200',
                                    )}
                                  />
                                  {error && (
                                    <p className="text-[11px] text-rose-600 mt-0.5">{error}</p>
                                  )}
                                </>
                              ) : (
                                <div className={cn(
                                  'text-sm font-medium truncate',
                                  (displayValue ?? value) ? 'text-slate-700' : 'text-slate-400 italic',
                                )}>
                                  {displayValue ?? value ?? '—'}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Cancelar/Guardar viven en EditableSectionHeader (sticky top).
                          Apple HIG Edit/Done — botones siempre visibles sin scroll. */}
                    </>
                  )
                })()}

                {/*
                 * Contact buttons — visibles SOLO si hay datos de contacto.
                 * NN/g Empty States 2023 + Sweller carga cognitiva: el label
                 * "Sin datos de contacto" es redundante con las filas vacías
                 * de WhatsApp/Email arriba (que ya muestran "—"). Hide
                 * completo cuando no hay nada — el usuario sabe que falta info
                 * por las dashes; agregar otro mensaje "sin contacto" es ruido.
                 */}
                {(stay.guestPhone || stay.guestEmail) && (
                  <div className="pt-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Contactar
                    </div>
                    <div className="flex gap-2">
                      {stay.guestPhone && (
                        <a
                          href={`https://wa.me/${stay.guestPhone.replace(/\D/g, '')}?text=Hola%20${encodeURIComponent(stay.guestName)}%2C%20te%20contactamos%20del%20hotel`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            logContact.mutate({
                              channel: 'WHATSAPP',
                              messagePreview: `wa.me/${stay.guestPhone} — ${stay.guestName}`,
                            })
                          }
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1.5',
                            'text-xs font-semibold py-2 px-3 rounded-lg',
                            'bg-[#25D366] hover:bg-[#1ebe5a] text-white',
                            'transition-colors',
                          )}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      )}
                      {stay.guestEmail && (
                        <a
                          href={`mailto:${stay.guestEmail}?subject=${encodeURIComponent(`Reserva ${stay.bookingRef ?? stay.pmsReservationId ?? stay.id}`)}`}
                          onClick={() =>
                            logContact.mutate({
                              channel: 'EMAIL',
                              messagePreview: `mailto:${stay.guestEmail} — ${stay.guestName}`,
                            })
                          }
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1.5',
                            'text-xs font-semibold py-2 px-3 rounded-lg',
                            'bg-blue-600 hover:bg-blue-700 text-white',
                            'transition-colors',
                          )}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Email
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB NOTAS — Sprint EDIT-RESERVATION bitácora chat */}
            <TabsContent value="notes" className="mt-0 h-full">
              <div className="p-4 h-full min-h-[320px]">
                <ReservationNotesThread
                  stayId={stay.guestStayId ?? stay.id}
                  currentUserId={currentUserId}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* FOOTER — oculto en tab Notas (Apple HIG: hide UI not applicable to
            the current context). El chat necesita máxima altura útil y la
            barra de acciones destructivas no aporta valor mientras escribes. */}
        {activeTab !== 'notes' && (
        <div className="flex-shrink-0 border-t border-slate-200 p-3 bg-white space-y-2">
          {/* No-show confirm panel (inline — no separate Dialog) */}
          {showNoShowConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2.5 ">
              <p className="text-xs font-semibold text-red-800">
                Marcar como no-show — cargo estimado: {stay.currency} {Number(stay.ratePerNight).toFixed(2)}
              </p>
              <input
                type="text"
                placeholder="Razón (opcional)"
                value={noShowReason}
                onChange={(e) => setNoShowReason(e.target.value)}
                className="w-full text-xs border border-red-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-red-300"
              />
              <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiveCharge}
                  onChange={(e) => setWaiveCharge(e.target.checked)}
                  className="rounded"
                />
                Exonerar cargo (supervisor)
              </label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setShowNoShowConfirm(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    onNoShow(stay.id, { reason: noShowReason || undefined, waiveCharge })
                    setShowNoShowConfirm(false)
                    setNoShowReason('')
                    setWaiveCharge(false)
                    onClose()
                  }}
                >
                  Confirmar no-show
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {/* DEPARTED — progressive disclosure: full folio/audit trail in ReservationDetailPage */}
            {status === 'DEPARTED' && (
              <Button
                size="sm"
                className="flex-1 text-xs bg-slate-700 hover:bg-slate-800 text-white"
                onClick={() => {
                  onClose()
                  navigate(`/reservations/${stay.guestStayId ?? stay.id}`)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver folio completo →
              </Button>
            )}

            {!isNoShow && status !== 'DEPARTED' && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => onMoveRoom(stay.id)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                Mover hab.
              </Button>
            )}

            {canCancel && onCancelReservation && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                onClick={() => onCancelReservation(stay.id)}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancelar
              </Button>
            )}

            {canNoShow && !showNoShowConfirm && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowNoShowConfirm(true)}
              >
                <UserX className="h-3.5 w-3.5 mr-1.5" />
                No-show
              </Button>
            )}

            {canRevert && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => {
                  onRevertNoShow(stay.id)
                  onClose()
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Revertir no-show
              </Button>
            )}

            {/* MOVE_PENDING: bloque es segmento de room change (EXT_NEW_ROOM
                o ROOM_MOVE), checkIn ya llegó (≤ today), y la mudanza
                física aún no se ha confirmado. CTA primary el día del move.
                Pattern Mews/Cloudbeds "Confirm move executed". §125 + §126. */}
            {!!stay.segmentId
              && !!stay.segmentReason
              && (stay.segmentReason === 'EXTENSION_NEW_ROOM' || stay.segmentReason === 'ROOM_MOVE')
              && !stay.moveConfirmedAt
              && startOfDay(new Date(stay.checkIn)).getTime() <= startOfDay(new Date()).getTime()
              && onConfirmSegmentMove && (
              <Button
                size="sm"
                className="flex-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  onConfirmSegmentMove(stay.segmentId!)
                  onClose()
                }}
                disabled={confirmMovePending}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                {confirmMovePending ? 'Confirmando…' : 'Confirmar mudanza'}
              </Button>
            )}

            {/* UNCONFIRMED: guest arrived today but check-in not confirmed yet */}
            {canConfirmCheckin && onStartCheckin && (
              <Button
                size="sm"
                className="flex-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  onStartCheckin(stay.guestStayId ?? stay.id)
                  onClose()
                }}
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" />
                Confirmar check-in
              </Button>
            )}

            {/* DEPARTING: checkout en fecha programada */}
            {!isNoShow && status === 'DEPARTING' && (
              <Button
                size="sm"
                className="flex-1 text-xs text-white bg-amber-600 hover:bg-amber-700"
                onClick={() => onCheckout(stay.id)}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Confirmar checkout
              </Button>
            )}

            {/* IN_HOUSE post-arrival: guest is staying and wants to leave early */}
            {canEarlyCheckout && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => setShowEarlyCheckout(true)}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Salida anticipada
              </Button>
            )}
          </div>
        </div>
        )}
      </SheetContent>
    </Sheet>

    <EarlyCheckoutDialog
      open={showEarlyCheckout}
      onClose={() => setShowEarlyCheckout(false)}
      onConfirm={(notes) => {
        const stayId = stay.guestStayId ?? stay.id
        earlyCheckoutMutation.mutate(
          { stayId, notes },
          {
            onSuccess: () => {
              setShowEarlyCheckout(false)
              onClose()
            },
          },
        )
      }}
      isPending={earlyCheckoutMutation.isPending}
      guestName={stay.guestName}
      roomLabel={stay.roomNumber ? `Hab. ${stay.roomNumber}` : 'Habitación'}
      checkinAt={new Date(stay.checkIn)}
      scheduledCheckout={new Date(stay.checkOut)}
    />

    {/* Sprint POST-NETFLIX-TRIAL (2026-05-29) — registro admin del cobro del no-show. */}
    <RegisterNoShowChargeDialog
      open={showNoShowChargeDialog}
      onClose={() => setShowNoShowChargeDialog(false)}
      onConfirm={(dto) => {
        const stayId = stay.guestStayId ?? stay.id
        registerNoShowChargeMut.mutate(
          { stayId, ...dto },
          { onSuccess: () => setShowNoShowChargeDialog(false) },
        )
      }}
      isPending={registerNoShowChargeMut.isPending}
      guestName={stay.guestName}
      feeAmount={stay.noShowFeeAmount}
      feeCurrency={stay.noShowFeeCurrency}
      hasOtaGuarantee={!!stay.channexGuaranteeMeta}
    />

    {/* ── ChangeConfirmDialog: approval flow para paxCount/rate post-checkin.
        Disparado desde saveStayEdit / savePaymentEdit cuando phase=POST_CHECKIN.
        En este punto el draft local ya tiene el valor nuevo; el dialog sólo
        recolecta razón + manager code para anexarlos al PATCH. */}
    <ChangeConfirmDialog
      open={!!confirmCtx}
      onResolve={(confirmed, extras) => {
        if (confirmed && extras && realStayId && confirmCtx) {
          updateMut.mutate({
            stayId: realStayId,
            patch: {
              [confirmCtx.field]: confirmCtx.field === 'paxCount'
                ? parseInt(confirmCtx.rawAfter, 10)
                : parseFloat(confirmCtx.rawAfter),
              reason: extras.reason,
              managerApprovalCode: extras.managerApprovalCode,
              managerApprovalReason: extras.managerApprovalReason,
            },
          })
        }
        // Notifica al saveXxxEdit caller para que cierre su edit mode si OK.
        confirmResolver?.(confirmed)
        setConfirmCtx(null)
        setConfirmResolver(null)
      }}
      title={confirmCtx?.field === 'paxCount' ? 'Cambiar número de huéspedes' : 'Cambiar tarifa por noche'}
      subtitle={confirmCtx?.requireApproval ? 'Reserva en check-in — requiere aprobación' : 'Confirma el cambio'}
      fieldLabel={confirmCtx?.field === 'paxCount' ? 'Huéspedes' : 'Tarifa por noche'}
      beforeDisplay={confirmCtx?.before ?? ''}
      afterDisplay={confirmCtx?.after ?? ''}
      derivedSummary={confirmCtx?.derivedSummary}
      changeKind="increase"
      requireReason={confirmCtx?.requireApproval ?? false}
      requireApproval={confirmCtx?.requireApproval ?? false}
    />

    {/* ── VoidPaymentDialog ───────────────────────────────────────────────── */}
    <VoidPaymentDialog
      open={!!voidTarget}
      payment={voidTarget}
      isPending={voidMut.isPending}
      onClose={() => setVoidTarget(null)}
      onConfirm={(voidReason) => {
        if (!voidTarget) return
        voidMut.mutate(
          { paymentLogId: voidTarget.id, voidReason },
          { onSettled: () => setVoidTarget(null) },
        )
      }}
    />

    {/* ── RegisterPaymentDialog ───────────────────────────────────────────── */}
    <RegisterPaymentDialog
      open={registerOpen}
      isPending={registerMut.isPending}
      balance={balance}
      currency={stayContext.data?.propertyCurrency ?? stay.currency}
      secondaryRates={stayContext.data?.secondaryRates}
      onClose={() => setRegisterOpen(false)}
      onConfirm={(payload) => {
        registerMut.mutate(payload, { onSuccess: () => setRegisterOpen(false) })
      }}
    />

    {/* ── UploadDocumentPhotoDialog ───────────────────────────────────────── */}
    <UploadDocumentPhotoDialog
      open={docPhotoUploadOpen}
      onOpenChange={setDocPhotoUploadOpen}
      existingPhotoUrl={stayContext.data?.stay.documentPhotoUrl}
      guestName={stay.guestName}
      isSaving={updateMut.isPending}
      onSave={async (dataUrl) => {
        if (!realStayId) return
        try {
          await updateMut.mutateAsync({
            stayId: realStayId,
            patch: { documentPhotoUrl: dataUrl },
          })
          toast.success('Foto del documento actualizada')
        } catch {
          // toast.error ya emitido por el hook
        }
      }}
    />
    </>
  )
}

// ─── Sprint CHANNEX-UX-E2-E3 §151 (D-CHX-UX-E2.2) ─────────────────────────
// Chip de sincronización con OTA via Channex. Reemplaza al row "Última sync"
// plano para que el operador SEPA si el push CRS llegó al canal.
//
// Estados:
//   1. Stay cancelado + syncedAfterCancel    → verde "✓ Cancelado en {ota} hace Xs"
//   2. Stay cancelado + NO syncedAfterCancel → amber "⏳ Sincronizando con {ota}…"
//   3. Stay activo + lastSyncAt              → gris sutil "Última sync hace Xs"
//
// Caso 2 ocurre durante la ventana entre cancelStay y el worker dispatch
// (típicamente <30s). El SSE `channex:cancel-acked` re-fetch el stay → el
// chip flippea a verde sin recargar la página.
function ChannexSyncChip({ stay }: { stay: GuestStayBlock }) {
  const otaName = resolveOtaDisplay(stay.channexOtaName, stay.source).label
  const lastSync = stay.channexLastSyncAt ? new Date(stay.channexLastSyncAt) : null
  const cancelledAt = stay.cancelledAt ? new Date(stay.cancelledAt) : null
  const syncedAfterCancel =
    cancelledAt !== null && lastSync !== null && lastSync.getTime() >= cancelledAt.getTime()

  // Caso 1 — cancelado + acked por Channex
  if (cancelledAt && syncedAfterCancel && lastSync) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-emerald-100 bg-emerald-50/50">
        <span className="text-xs text-emerald-900 font-medium uppercase tracking-wide">
          Sincronización OTA
        </span>
        <span className="text-xs text-emerald-800 inline-flex items-center gap-1">
          <span aria-hidden>✓</span>
          Cancelado en {otaName} hace{' '}
          {formatDistanceToNowStrict(lastSync, { locale: es })}
        </span>
      </div>
    )
  }

  // Caso 2 — cancelado pero el push aún no acknowledged
  if (cancelledAt && !syncedAfterCancel) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-amber-100 bg-amber-50/50">
        <span className="text-xs text-amber-900 font-medium uppercase tracking-wide">
          Sincronización OTA
        </span>
        <span className="text-xs text-amber-800 inline-flex items-center gap-1">
          <span aria-hidden className="inline-block animate-pulse">⏳</span>
          Sincronizando con {otaName}…
        </span>
      </div>
    )
  }

  // Caso 3 — stay activo con history previo (ej: extensión)
  if (lastSync) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-100">
        <span className="text-xs text-slate-400 font-mono uppercase tracking-wide">
          Última sync OTA
        </span>
        <span className="text-xs text-slate-600">
          hace {formatDistanceToNowStrict(lastSync, { locale: es })}
        </span>
      </div>
    )
  }

  return null
}