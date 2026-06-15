import { Plus, X } from 'lucide-react'
import { StyledSelect } from '@/modules/rooms/components/shared/StyledSelect'

/**
 * Editor de saldos per-divisa `{ MXN: 2000, USD: 50 }` (D-CASH3 — nunca agregado).
 * - `fixed`: divisas no editables/removibles (cierre → cuenta las del fondo de apertura).
 * - dinámico: el cajero agrega/quita divisas (apertura → fondo inicial).
 */

const CCY_OPTIONS = [
  { value: 'MXN', label: 'MXN' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

export function CurrencyAmountRows({
  value,
  onChange,
  fixed,
}: {
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  /** Divisas fijas (cierre). Si se pasa, no hay add/remove ni selector de divisa. */
  fixed?: string[]
}) {
  const rows = fixed ?? Object.keys(value)
  const used = new Set(Object.keys(value))
  const available = CCY_OPTIONS.filter((o) => !used.has(o.value))

  const setAmount = (ccy: string, amount: number) => onChange({ ...value, [ccy]: amount })
  const removeCcy = (ccy: string) => {
    const next = { ...value }
    delete next[ccy]
    onChange(next)
  }
  const addCcy = () => {
    if (available.length === 0) return
    onChange({ ...value, [available[0].value]: 0 })
  }

  return (
    <div className="space-y-2">
      {rows.map((ccy) => (
        <div key={ccy} className="grid grid-cols-[88px_1fr_auto] gap-2 items-center">
          <span className="text-xs font-bold text-slate-600 tabular-nums px-2 py-2 rounded-md bg-slate-50 border border-slate-200 text-center">
            {ccy}
          </span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={Number.isFinite(value[ccy]) ? value[ccy] : ''}
              onChange={(e) => setAmount(ccy, parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full h-9 rounded-md border border-slate-200 bg-white pl-7 pr-3 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 transition-colors"
            />
          </div>
          {!fixed && Object.keys(value).length > 1 ? (
            <button
              type="button"
              onClick={() => removeCcy(ccy)}
              className="h-8 w-8 grid place-items-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              aria-label={`Quitar ${ccy}`}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-8" />
          )}
        </div>
      ))}

      {!fixed && available.length > 0 ? (
        <button
          type="button"
          onClick={addCcy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar divisa
        </button>
      ) : null}

      {/* selector accesorio para reemplazar la divisa de una fila dinámica nueva */}
      {!fixed && available.length > 0 && rows.length === 0 ? (
        <StyledSelect value="" onChange={(v) => onChange({ ...value, [v]: 0 })} options={available} placeholder="Divisa" />
      ) : null}
    </div>
  )
}
