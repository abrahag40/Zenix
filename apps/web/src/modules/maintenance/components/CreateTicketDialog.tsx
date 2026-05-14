/**
 * CreateTicketDialog.tsx — Sprint Mx-1B-W1
 *
 * Wizard de 3 pasos para levantar un ticket. Aplica Hick's Law (1 decisión
 * a la vez) + Sweller 1988 (cognitive load < 7±2 inputs visibles a la vez).
 *
 * Pasos:
 *   1. ¿De dónde es?  → Habitación / Asset / Área general
 *   2. ¿Qué pasa?     → Categoría + priority + título + descripción
 *   3. ¿Quién y cuándo? → Asignar / Cola / Pedir aprobación
 *
 * Apple HIG 2024: progressive form disclosure reduce abandono 31%
 * (Baymard 2022 — forms B2B con >7 campos visibles).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  X,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  CreateMaintenanceTicketInput,
  RoomDto,
  StaffDto,
  TicketCategoryValue,
  TicketPriorityValue,
} from '@zenix/shared'
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_PILL,
} from '../utils/maintenance.constants'
import { useCreateTicket } from '../hooks/useMaintenanceTickets'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../api/client'
import { useShakeOnInvalid } from '@/hooks/useShakeOnInvalid'

type LocationKind = 'ROOM' | 'ASSET' | 'GENERAL'
type AssignmentMode = 'ASSIGN' | 'QUEUE' | 'NEEDS_APPROVAL'

/**
 * Días estimados default por categoría — research 2026-05-10:
 * Hotel Facility Guide + Clock PMS+ + Flexkeeping recomendaciones operativas.
 * El usuario puede editar; estos defaults solo aplican cuando NO ha tocado el input.
 */
const DEFAULT_DAYS_BY_CATEGORY: Record<TicketCategoryValue, number> = {
  PLUMBING: 3,
  ELECTRICAL: 3,
  HVAC: 2,
  APPLIANCE: 2,
  FURNITURE: 2,
  STRUCTURAL: 7,
  COSMETIC: 2,
  SAFETY: 1,
  PEST: 2,
  DEEP_CLEANING: 1,
  OTHER: 3,
}

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fill — desde RoomColumn del calendario, BookingDetailSheet, etc. */
  initialRoomId?: string | null
  /** Por default `true` para housekeeper/recepción. Solo SUPERVISOR puede asignar directamente. */
  defaultRequireApproval?: boolean
}

const CATEGORIES: TicketCategoryValue[] = [
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'FURNITURE',
  'STRUCTURAL',
  'COSMETIC',
  'SAFETY',
  'PEST',
  'DEEP_CLEANING',
  'OTHER',
]
const PRIORITIES: TicketPriorityValue[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function CreateTicketDialog({
  open,
  onClose,
  initialRoomId,
  defaultRequireApproval = false,
}: Props) {
  const create = useCreateTicket()

  // ── Wizard state ──
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [locationKind, setLocationKind] = useState<LocationKind>(
    initialRoomId ? 'ROOM' : 'ROOM',
  )
  const [roomId, setRoomId] = useState<string | null>(initialRoomId ?? null)
  const [assetTag, setAssetTag] = useState('')
  const [category, setCategory] = useState<TicketCategoryValue>('PLUMBING')
  const [priority, setPriority] = useState<TicketPriorityValue>('MEDIUM')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Días estimados — default por categoría (research 2026-05-10 PMS comparativa),
  // editable por el usuario. Se propaga a RoomBlock.endDate + Channex.
  const [estimatedDays, setEstimatedDays] = useState<number>(3)
  // Track si el usuario ya tocó el input — para no sobrescribir al cambiar categoría.
  const [estimatedDaysDirty, setEstimatedDaysDirty] = useState(false)
  const [mode, setMode] = useState<AssignmentMode>(
    defaultRequireApproval ? 'NEEDS_APPROVAL' : 'QUEUE',
  )
  const [assignedToId, setAssignedToId] = useState<string | null>(null)

  // Reset al abrir (no al cerrar — preserva mid-edit si hubo error)
  useEffect(() => {
    if (open) {
      setStep(1)
      setLocationKind(initialRoomId ? 'ROOM' : 'ROOM')
      setRoomId(initialRoomId ?? null)
      setAssetTag('')
      setCategory('PLUMBING')
      setPriority('MEDIUM')
      setTitle('')
      setDescription('')
      setMode(defaultRequireApproval ? 'NEEDS_APPROVAL' : 'QUEUE')
      setAssignedToId(null)
      setEstimatedDays(DEFAULT_DAYS_BY_CATEGORY.PLUMBING)
      setEstimatedDaysDirty(false)
    }
  }, [open, initialRoomId, defaultRequireApproval])

  // Auto-update días estimados cuando cambia categoría (solo si user no lo tocó)
  useEffect(() => {
    if (!estimatedDaysDirty) {
      setEstimatedDays(DEFAULT_DAYS_BY_CATEGORY[category])
    }
  }, [category, estimatedDaysDirty])

  // ── Datos auxiliares ──
  const { data: rooms = [] } = useQuery<RoomDto[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get<RoomDto[]>('/rooms'),
    staleTime: 5 * 60_000,
    enabled: open && locationKind === 'ROOM',
  })
  const { data: staffList = [] } = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffDto[]>('/staff'),
    staleTime: 5 * 60_000,
    enabled: open && step === 3,
  })
  const maintenanceStaff = useMemo(
    () =>
      staffList.filter(
        (s) => s.department === 'MAINTENANCE' && s.active !== false,
      ),
    [staffList],
  )

  const canStep2 =
    (locationKind === 'ROOM' && !!roomId) ||
    (locationKind === 'ASSET' && assetTag.trim().length > 0) ||
    locationKind === 'GENERAL'
  const canStep3 = title.trim().length >= 3
  const canSubmit =
    canStep2 &&
    canStep3 &&
    (mode !== 'ASSIGN' || !!assignedToId)

  // §60 D19: validate-on-click pattern.
  const [stepError, setStepError] = useState<string | null>(null)
  const { trigger: triggerStepShake } = useShakeOnInvalid()

  function handleNext() {
    if (step === 1 && !canStep2) {
      setStepError(
        locationKind === 'ROOM'
          ? 'Selecciona una habitación para continuar.'
          : 'Escribe el identificador del activo o área.',
      )
      triggerStepShake()
      return
    }
    if (step === 2 && !canStep3) {
      setStepError('El título necesita al menos 3 caracteres.')
      triggerStepShake()
      return
    }
    setStepError(null)
    setStep((s) => (s === 1 ? 2 : 3))
  }

  function handleSubmitClick() {
    if (create.isPending) return
    if (!canSubmit) {
      setStepError(
        mode === 'ASSIGN' && !assignedToId
          ? 'Selecciona el técnico que atenderá este ticket.'
          : 'Completa los campos requeridos.',
      )
      triggerStepShake()
      return
    }
    setStepError(null)
    void handleSubmit()
  }

  async function handleSubmit() {
    const dto: CreateMaintenanceTicketInput = {
      roomId: locationKind === 'ROOM' ? roomId : null,
      assetTag: locationKind === 'ASSET' ? assetTag.trim() : null,
      category,
      priority,
      title: title.trim(),
      description: description.trim() || undefined,
      estimatedEndDays: estimatedDays,
      requiresApproval: mode === 'NEEDS_APPROVAL',
      assignedToId: mode === 'ASSIGN' && assignedToId ? assignedToId : undefined,
    }
    try {
      await create.mutateAsync(dto)
      onClose()
    } catch {
      // toast already handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Nuevo ticket de mantenimiento</DialogTitle>
        <DialogDescription className="sr-only">
          Wizard de 3 pasos para levantar un ticket
        </DialogDescription>

        {/* Header con stepper. showCloseButton:false evita la X duplicada
            que Radix añade por default — tenemos nuestra propia X custom. */}
        <header className="px-5 pt-4 pb-3 border-b border-slate-200 flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900 flex-1">
            Nuevo ticket
          </h2>
          <Stepper current={step} />
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="px-5 py-4 min-h-[300px]">
          {step === 1 && (
            <Step1
              locationKind={locationKind}
              setLocationKind={setLocationKind}
              roomId={roomId}
              setRoomId={setRoomId}
              assetTag={assetTag}
              setAssetTag={setAssetTag}
              rooms={rooms}
            />
          )}
          {step === 2 && (
            <Step2
              category={category}
              setCategory={setCategory}
              priority={priority}
              setPriority={setPriority}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              roomBlocked={priority === 'CRITICAL' && !!roomId}
              estimatedDays={estimatedDays}
              setEstimatedDays={(d) => {
                setEstimatedDays(d)
                setEstimatedDaysDirty(true)
              }}
            />
          )}
          {step === 3 && (
            <Step3
              mode={mode}
              setMode={setMode}
              assignedToId={assignedToId}
              setAssignedToId={setAssignedToId}
              maintenanceStaff={maintenanceStaff}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500">
            Paso {step} de 3
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Atrás
              </Button>
            )}
            {step < 3 && (
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 3 && (
              <Button
                size="sm"
                disabled={create.isPending}
                onClick={handleSubmitClick}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {create.isPending ? 'Creando…' : 'Crear ticket'}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
          {stepError && (
            <p className="mt-2 text-xs text-red-600 text-right">{stepError}</p>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  )
}

// ─── Step 1: ¿De dónde es? ──────────────────────────────────────────────

function Step1({
  locationKind,
  setLocationKind,
  roomId,
  setRoomId,
  assetTag,
  setAssetTag,
  rooms,
}: {
  locationKind: LocationKind
  setLocationKind: (k: LocationKind) => void
  roomId: string | null
  setRoomId: (id: string | null) => void
  assetTag: string
  setAssetTag: (s: string) => void
  rooms: RoomDto[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">
          ¿De dónde es el problema?
        </h3>
        <p className="text-xs text-slate-500">
          Si afecta una habitación, el sistema puede bloquearla automáticamente.
        </p>
      </div>

      {/* Pill selector */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { id: 'ROOM', emoji: '🛏', label: 'Habitación' },
            { id: 'ASSET', emoji: '🔧', label: 'Asset/Equipo' },
            { id: 'GENERAL', emoji: '📍', label: 'Área general' },
          ] as const
        ).map((opt) => {
          const active = locationKind === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLocationKind(opt.id)}
              className={`text-xs rounded-lg px-2 py-3 ring-1 transition-all ${
                active
                  ? 'ring-emerald-500 bg-emerald-50 text-emerald-800 ring-2'
                  : 'ring-slate-200 bg-white text-slate-600 hover:ring-slate-300'
              }`}
            >
              <div className="text-xl mb-1">{opt.emoji}</div>
              <div className="font-medium">{opt.label}</div>
            </button>
          )
        })}
      </div>

      {/* Body por kind */}
      {locationKind === 'ROOM' && (
        <RoomCombobox
          rooms={rooms}
          value={roomId}
          onChange={setRoomId}
        />
      )}

      {locationKind === 'ASSET' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Identificador del asset
          </label>
          <Input
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
            placeholder="Ej. Lavadora-2, Generador, Camioneta blanca…"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            No tocará inventario PMS ni Channex. Solo el módulo de mantenimiento.
          </p>
        </div>
      )}

      {locationKind === 'GENERAL' && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2.5">
          Ticket genérico — no asociado a habitación ni asset específico.
          Apto para áreas comunes (lobby, pasillos, exteriores).
        </p>
      )}
    </div>
  )
}

// ─── Step 2: ¿Qué pasa? ─────────────────────────────────────────────────

function Step2({
  category,
  setCategory,
  priority,
  setPriority,
  title,
  setTitle,
  description,
  setDescription,
  roomBlocked,
  estimatedDays,
  setEstimatedDays,
}: {
  category: TicketCategoryValue
  setCategory: (c: TicketCategoryValue) => void
  priority: TicketPriorityValue
  setPriority: (p: TicketPriorityValue) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void
  roomBlocked: boolean
  estimatedDays: number
  setEstimatedDays: (d: number) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">
          ¿Qué está pasando?
        </h3>
        <p className="text-xs text-slate-500">
          Categoría e idea general. El detalle puede ir en la descripción.
        </p>
      </div>

      {/* Categoría — pill grid */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Categoría
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {CATEGORIES.map((c) => {
            const active = category === c
            const Icon = CATEGORY_ICON[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`text-[10px] rounded-md px-1.5 py-2 ring-1 transition-all flex flex-col items-center gap-0.5 ${
                  active
                    ? 'ring-emerald-500 bg-emerald-50 text-emerald-800 ring-2'
                    : 'ring-slate-200 bg-white text-slate-600 hover:ring-slate-300'
                }`}
                title={CATEGORY_LABEL[c]}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="leading-tight">{CATEGORY_LABEL[c]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Priority — chips de color */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Prioridad
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {PRIORITIES.map((p) => {
            const active = priority === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`text-[11px] font-medium rounded-md px-2.5 py-1.5 transition-all ${
                  active
                    ? `${PRIORITY_PILL[p]} ring-2 ring-offset-1`
                    : 'ring-1 ring-slate-200 bg-white text-slate-600 hover:ring-slate-300'
                }`}
              >
                {PRIORITY_LABEL[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Banner CRITICAL — texto user-friendly sin jargon de sistema */}
      {roomBlocked && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 flex gap-2 text-[11px] text-red-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Prioridad Crítica bloquea la habitación</div>
            <div className="opacity-90">
              La habitación quedará fuera de servicio y dejará de estar disponible
              en Booking, Airbnb y demás OTAs por el período estimado abajo. Si
              tiene huésped activo, el sistema rechazará la creación con razón clara.
            </div>
          </div>
        </div>
      )}

      {/* Días estimados — research 2026: defaults por categoría (Hotel Facility
          Guide / Flexkeeping). Channex cierra disponibilidad SOLO este período,
          no infinito. Si el trabajo se atrasa, el supervisor puede extender. */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Días estimados hasta finalizar
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={60}
            value={estimatedDays}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n) && n >= 1 && n <= 60) setEstimatedDays(n)
            }}
            className="w-20 text-sm"
          />
          <span className="text-xs text-slate-500">
            días {estimatedDays === 1 ? '(la habitación reabre mañana)' : `(la habitación reabre en ${estimatedDays} días)`}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Default ajustado por categoría. Si el trabajo se atrasa, podrás extender desde el panel del ticket.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Título corto
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Grifo gotea en baño"
          maxLength={160}
        />
        <p className="text-[10px] mt-0.5 flex items-center justify-between">
          <span
            className={
              title.trim().length === 0
                ? 'text-slate-400'
                : title.trim().length < 3
                ? 'text-amber-600 font-medium'
                : 'text-emerald-600'
            }
          >
            {title.trim().length === 0
              ? 'Mínimo 3 caracteres para continuar'
              : title.trim().length < 3
              ? `Faltan ${3 - title.trim().length} carácter(es)`
              : '✓ Listo'}
          </span>
          <span className="text-slate-400">{title.length}/160</span>
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Descripción (opcional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalle, contexto, qué se ha intentado…"
          className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={3}
          maxLength={2000}
        />
      </div>
    </div>
  )
}

// ─── Step 3: ¿Quién y cuándo? ───────────────────────────────────────────

function Step3({
  mode,
  setMode,
  assignedToId,
  setAssignedToId,
  maintenanceStaff,
}: {
  mode: AssignmentMode
  setMode: (m: AssignmentMode) => void
  assignedToId: string | null
  setAssignedToId: (id: string | null) => void
  maintenanceStaff: StaffDto[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">
          ¿Cómo manejamos el ticket?
        </h3>
        <p className="text-xs text-slate-500">
          Elige el flujo que mejor encaja con tu rol y la situación.
        </p>
      </div>

      <div className="space-y-2">
        {(
          [
            {
              id: 'ASSIGN',
              icon: '👤',
              title: 'Asignar a un técnico ahora',
              hint: 'El técnico recibe push inmediato. Status inicial ACKNOWLEDGED.',
            },
            {
              id: 'QUEUE',
              icon: '📥',
              title: 'Dejar en cola',
              hint: 'Cualquier técnico de mantenimiento puede tomarlo voluntariamente.',
            },
            {
              id: 'NEEDS_APPROVAL',
              icon: '🟡',
              title: 'Pedir aprobación al supervisor',
              hint: 'Útil cuando housekeeper o recepción reporta algo que requiere visto bueno antes de actuar.',
            },
          ] as const
        ).map((opt) => {
          const active = mode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`w-full text-left rounded-lg px-3 py-3 ring-1 transition-all flex items-start gap-3 ${
                active
                  ? 'ring-emerald-500 bg-emerald-50 ring-2'
                  : 'ring-slate-200 bg-white hover:ring-slate-300'
              }`}
            >
              <span className="text-lg leading-none">{opt.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">
                  {opt.title}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {opt.hint}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Selector de técnico cuando ASSIGN */}
      {mode === 'ASSIGN' && (
        <div className="pt-1 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Técnico asignado
          </label>
          {maintenanceStaff.length === 0 ? (
            <p className="text-xs text-slate-500 bg-amber-50 rounded-md px-3 py-2">
              No hay staff con department=MAINTENANCE en esta sucursal. Cambia
              a "Dejar en cola" o crea técnicos en Configuración.
            </p>
          ) : (
            <select
              value={assignedToId ?? ''}
              onChange={(e) => setAssignedToId(e.target.value || null)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— Selecciona —</option>
              {maintenanceStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RoomCombobox — searchable selector (NN/g 2022 Combobox vs Dropdown) ──

function RoomCombobox({
  rooms,
  value,
  onChange,
}: {
  rooms: RoomDto[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const selected = rooms.find((r) => r.id === value) ?? null
  const filtered = useMemo(() => {
    if (!query.trim()) return rooms
    const q = query.trim().toLowerCase()
    return rooms.filter((r) =>
      [r.number, String(r.floor ?? ''), r.category].some((s) =>
        String(s).toLowerCase().includes(q),
      ),
    )
  }, [rooms, query])

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1.5">
        Selecciona habitación
      </label>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar entre ${rooms.length} habitaciones…`}
        className="text-sm mb-2"
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400 text-center">
            Sin coincidencias para "{query}".
          </p>
        ) : (
          filtered.map((r) => {
            const isActive = r.id === value
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onChange(r.id)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-900 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span>
                  Hab. {r.number}
                  {r.floor != null && (
                    <span className="text-xs text-slate-400 ml-2">Piso {r.floor}</span>
                  )}
                </span>
                {isActive && <span className="text-emerald-600">✓</span>}
              </button>
            )
          })
        )}
      </div>
      {selected && (
        <p className="text-[10px] text-emerald-700 mt-1.5">
          ✓ Seleccionada: Hab. {selected.number}
        </p>
      )}
    </div>
  )
}

// ─── Stepper ─────────────────────────────────────────────────────────────

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full transition-all ${
            n === current
              ? 'w-6 bg-emerald-500'
              : n < current
              ? 'w-3 bg-emerald-300'
              : 'w-3 bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}
