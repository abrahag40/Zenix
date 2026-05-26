/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 12.
 *
 * BulkRateEditDialog — modal para aplicar rate + restrictions a un rango
 * de fechas × rate plans en un solo POST al endpoint Day 6 bulk.
 *
 * Modos de operación:
 *   1. "Rango simple" — usuario elige fecha inicio + fin + rate único
 *   2. "Day-of-week template" — usuario elige fechas inicio/fin + setea
 *      rates per weekday (Mo/Tu/We/Th/Fr/Sa/Su). El endpoint
 *      /expand-template (Day 6) devuelve las entries, las pasamos a /bulk.
 *   3. "Restrictions only" — sin rate, solo MLOS/MaxLOS/CTA/CTD/stopSell
 *
 * Patrón flow:
 *   - Selected cells (state externo) OR explicit date range picker
 *   - Selected rate plans (al menos 1)
 *   - Form fields: rate / restrictions (al menos uno required)
 *   - Preview count: "Aplicarás a N celdas (X días × Y rate plans)"
 *   - Submit → bulkUpdate → toast result (accepted/rejected count)
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Calendar, Layers, X, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  bulkUpdateRateCalendar,
  expandTemplate,
  type RateCalendarBulkEntry,
  type RateCalendarRatePlanRow,
} from '../../api/nova'
import {
  Surface,
  Headline,
  Title,
  Body,
  Callout,
  Subhead,
  Caption,
  Eyebrow,
  Button,
  IconButton,
  Chip,
} from '../design-system'

type Weekday = 'mo' | 'tu' | 'we' | 'th' | 'fr' | 'sa' | 'su'

const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: 'mo', label: 'Lunes', short: 'L' },
  { key: 'tu', label: 'Martes', short: 'M' },
  { key: 'we', label: 'Miércoles', short: 'X' },
  { key: 'th', label: 'Jueves', short: 'J' },
  { key: 'fr', label: 'Viernes', short: 'V' },
  { key: 'sa', label: 'Sábado', short: 'S' },
  { key: 'su', label: 'Domingo', short: 'D' },
]

type EditMode = 'simple' | 'template' | 'restrictions'

interface BulkRateEditDialogProps {
  open: boolean
  onClose: () => void
  propertyId: string
  ratePlans: RateCalendarRatePlanRow[]
  /** Pre-fill desde la selección del matrix (opcional). */
  initialDates?: { from: string; to: string }
  /** Pre-fill rate plans seleccionados (opcional). */
  initialRatePlanIds?: string[]
  /** Callback con result counts post-submit (parent refetcha matrix). */
  onSuccess?: (result: { accepted: number; rejected: number }) => void
}

export function BulkRateEditDialog({
  open,
  onClose,
  propertyId,
  ratePlans,
  initialDates,
  initialRatePlanIds,
  onSuccess,
}: BulkRateEditDialogProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [mode, setMode] = useState<EditMode>('simple')
  const [dateFrom, setDateFrom] = useState(initialDates?.from ?? today)
  const [dateTo, setDateTo] = useState(initialDates?.to ?? addDays(today, 6))
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(
    new Set(initialRatePlanIds ?? ratePlans.slice(0, 1).map((p) => p.channexRatePlanId)),
  )

  // Simple mode fields
  const [rate, setRate] = useState<number | ''>('')

  // Template mode fields
  const [weekdayRates, setWeekdayRates] = useState<Partial<Record<Weekday, number>>>({})

  // Restrictions (compartido entre modes)
  const [minStayThrough, setMinStayThrough] = useState<number | ''>('')
  const [maxStay, setMaxStay] = useState<number | ''>('')
  const [closedToArrival, setClosedToArrival] = useState(false)
  const [closedToDeparture, setClosedToDeparture] = useState(false)
  const [stopSell, setStopSell] = useState(false)

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setMode('simple')
      setDateFrom(initialDates?.from ?? today)
      setDateTo(initialDates?.to ?? addDays(today, 6))
      setSelectedPlanIds(
        new Set(initialRatePlanIds ?? ratePlans.slice(0, 1).map((p) => p.channexRatePlanId)),
      )
      setRate('')
      setWeekdayRates({})
      setMinStayThrough('')
      setMaxStay('')
      setClosedToArrival(false)
      setClosedToDeparture(false)
      setStopSell(false)
    }
  }, [open, initialDates, initialRatePlanIds, ratePlans, today])

  // ── Mutation ─────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async () => {
      // Build entries según modo
      let entries: RateCalendarBulkEntry[] = []

      if (mode === 'template') {
        // Backend expand-template requiere 1 rate plan per request — loop
        const allExpanded = await Promise.all(
          Array.from(selectedPlanIds).map((ratePlanId) =>
            expandTemplate(propertyId, {
              ratePlanId,
              dateFrom,
              dateTo,
              weekdayRates,
            }),
          ),
        )
        entries = allExpanded.flatMap((r) => r.entries)
      } else {
        // simple OR restrictions: expandir manualmente todas las fechas
        const dates = generateDateRange(dateFrom, dateTo)
        for (const planId of selectedPlanIds) {
          for (const d of dates) {
            entries.push({
              ratePlanId: planId,
              date: d,
              ...(mode === 'simple' && rate !== '' ? { rate: Number(rate) } : {}),
              ...(minStayThrough !== '' ? { minStayThrough: Number(minStayThrough) } : {}),
              ...(maxStay !== '' ? { maxStay: Number(maxStay) } : {}),
              ...(closedToArrival ? { closedToArrival: true } : {}),
              ...(closedToDeparture ? { closedToDeparture: true } : {}),
              ...(stopSell ? { stopSell: true } : {}),
            })
          }
        }
      }

      if (entries.length === 0) {
        throw new Error('Sin entries para aplicar — completa al menos un campo')
      }

      return bulkUpdateRateCalendar(propertyId, entries, 'bulk edit calendar UI')
    },
    onSuccess: (result) => {
      if (result.accepted > 0) {
        toast.success(`${result.accepted} celdas actualizadas`)
        onSuccess?.({ accepted: result.accepted, rejected: result.rejected.length })
        onClose()
      } else if (result.rejected.length > 0) {
        toast.error(
          `0 aplicadas. ${result.rejected.length} rechazadas: ${result.rejected[0].reason}`,
        )
      }
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Error al aplicar bulk')
    },
  })

  // ── Derived ──────────────────────────────────────────────────────────

  const dayCount = useMemo(() => generateDateRange(dateFrom, dateTo).length, [dateFrom, dateTo])
  const planCount = selectedPlanIds.size
  const cellCount = dayCount * planCount

  const hasField =
    (mode === 'simple' && rate !== '') ||
    (mode === 'template' && Object.values(weekdayRates).some((v) => v != null)) ||
    (mode === 'restrictions' &&
      (minStayThrough !== '' ||
        maxStay !== '' ||
        closedToArrival ||
        closedToDeparture ||
        stopSell))

  const canSubmit = planCount > 0 && dayCount > 0 && hasField && !mutation.isPending

  const togglePlan = (id: string) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18),0_12px_24px_-8px_rgba(15,23,42,0.10)] border border-slate-200"
          onEscapeKeyDown={(e) => mutation.isPending && e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
            <div>
              <DialogPrimitive.Title asChild>
                <Headline>Editar rates en bulk</Headline>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <Callout className="mt-0.5" tone="secondary">
                  Aplica rate o restricciones a múltiples días × rate plans en una sola operación.
                </Callout>
              </DialogPrimitive.Description>
            </div>
            <IconButton
              icon={X}
              size="sm"
              variant="ghost"
              aria-label="Cerrar"
              onClick={onClose}
              disabled={mutation.isPending}
            />
          </div>

          {/* Body */}
          <div className="p-5 space-y-5">
            {/* Mode tabs */}
            <div>
              <Eyebrow tone="tertiary" className="block mb-2">
                Modo
              </Eyebrow>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100">
                {[
                  { key: 'simple' as EditMode, label: 'Rate uniforme' },
                  { key: 'template' as EditMode, label: 'Por día de semana' },
                  { key: 'restrictions' as EditMode, label: 'Sólo restricciones' },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={
                      'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ' +
                      (mode === m.key
                        ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                        : 'text-slate-600 hover:text-slate-900')
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div>
              <Eyebrow tone="tertiary" className="block mb-2">
                Rango de fechas
              </Eyebrow>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="pl-8 pr-3 h-9 rounded-lg border border-slate-300 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <span className="text-slate-400">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 h-9 rounded-lg border border-slate-300 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <Chip variant="neutral" intent="subtle" size="md">
                  {dayCount} {dayCount === 1 ? 'día' : 'días'}
                </Chip>
              </div>
            </div>

            {/* Rate plans selector */}
            <div>
              <Eyebrow tone="tertiary" className="block mb-2">
                Rate plans ({planCount} de {ratePlans.length})
              </Eyebrow>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {ratePlans.map((rp) => {
                  const isSelected = selectedPlanIds.has(rp.channexRatePlanId)
                  return (
                    <label
                      key={rp.channexRatePlanId}
                      className={
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all ' +
                        (isSelected
                          ? 'border-emerald-300 bg-emerald-50/60'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlan(rp.channexRatePlanId)}
                        className="rounded text-emerald-600 focus:ring-emerald-500/30 border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 truncate">
                          {rp.title}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {rp.currency} · default {rp.defaultRate.toFixed(2)}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Mode-specific fields */}
            {mode === 'simple' && (
              <FieldGroup label="Rate uniforme">
                <RateInput value={rate} onChange={setRate} />
              </FieldGroup>
            )}

            {mode === 'template' && (
              <FieldGroup label="Rate por día de la semana">
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd.key} className="text-center">
                      <div className="text-[10px] font-semibold text-slate-500 mb-1 uppercase">
                        {wd.short}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={weekdayRates[wd.key] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setWeekdayRates((prev) => ({
                            ...prev,
                            [wd.key]: v === '' ? undefined : Number(v),
                          }))
                        }}
                        placeholder="—"
                        title={wd.label}
                        className="w-full px-1.5 py-1.5 text-[12px] tabular-nums text-center border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  ))}
                </div>
                <Caption tone="tertiary" className="mt-2 block">
                  Días sin valor se omiten (mantienen rate actual).
                </Caption>
              </FieldGroup>
            )}

            {/* Restrictions block (compartido en simple + restrictions modes) */}
            <FieldGroup label="Restricciones (opcional)">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Subhead className="block mb-1" tone="secondary">
                    Min stay (MLOS)
                  </Subhead>
                  <input
                    type="number"
                    min={0}
                    value={minStayThrough}
                    onChange={(e) =>
                      setMinStayThrough(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="—"
                    className="w-full px-3 h-9 rounded-lg border border-slate-300 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <Subhead className="block mb-1" tone="secondary">
                    Max stay
                  </Subhead>
                  <input
                    type="number"
                    min={0}
                    value={maxStay}
                    onChange={(e) =>
                      setMaxStay(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="—"
                    className="w-full px-3 h-9 rounded-lg border border-slate-300 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <CheckboxRow
                  checked={closedToArrival}
                  onChange={setClosedToArrival}
                  label="Closed to arrival (CTA)"
                  hint="OTAs no aceptan check-ins en estas fechas"
                />
                <CheckboxRow
                  checked={closedToDeparture}
                  onChange={setClosedToDeparture}
                  label="Closed to departure (CTD)"
                  hint="No se permite checkout en estas fechas"
                />
                <CheckboxRow
                  checked={stopSell}
                  onChange={setStopSell}
                  label="Stop sell"
                  hint="Bloquea ventas completamente — usar con precaución"
                  destructive
                />
              </div>
            </FieldGroup>

            {/* Preview */}
            <Surface variant="sunken" radius="lg" padding="md">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-slate-500" />
                <Body tone="secondary">
                  Aplicarás a{' '}
                  <span className="font-semibold text-slate-900 tabular-nums">{cellCount}</span>{' '}
                  celdas (
                  <span className="tabular-nums">{dayCount}</span> días ×{' '}
                  <span className="tabular-nums">{planCount}</span> rate plans).
                </Body>
              </div>
              {!hasField && (
                <Caption className="block mt-1" tone="tertiary">
                  Completa al menos un campo (rate, restricción, o stop sell) para habilitar aplicar.
                </Caption>
              )}
            </Surface>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50/50">
            <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              isLoading={mutation.isPending}
            >
              Aplicar a {cellCount} celdas
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow tone="tertiary" className="block mb-2">
        {label}
      </Eyebrow>
      {children}
    </div>
  )
}

function RateInput({
  value,
  onChange,
}: {
  value: number | ''
  onChange: (v: number | '') => void
}) {
  return (
    <input
      type="number"
      step="0.01"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      placeholder="Ej: 95.00"
      className="w-40 px-3 h-9 rounded-lg border border-slate-300 text-[14px] tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
    />
  )
}

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
  destructive = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
  destructive?: boolean
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={
          'mt-0.5 rounded border-slate-300 focus:ring-emerald-500/30 ' +
          (destructive ? 'text-red-600' : 'text-emerald-600')
        }
      />
      <div className="flex-1">
        <div className="text-[13px] font-medium text-slate-900">{label}</div>
        <Caption tone="tertiary" className="block">
          {hint}
        </Caption>
      </div>
    </label>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function generateDateRange(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (end < start) return out
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
