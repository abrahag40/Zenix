/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * §168 D-NOVA-10 — Tenant switcher híbrido SuccessFactors-style.
 *
 * Chip persistente en topbar Nova. Estados:
 *   - Sin acting org      → "Sin cliente seleccionado · [Elegir]" link a /nova/clientes
 *   - Con acting org      → "[Nombre cliente] · [Cambiar]" dropdown con orgs accesibles
 *
 * Patrón mental:
 *   - Like SuccessFactors company-switcher: el chip es el "donde estás".
 *   - Click → dropdown lista. Selección → cambia store + recarga query keys.
 *   - "Cambiar cliente" es enlace a landing si user quiere ver lista completa.
 *
 * NO confunde con el PropertySwitcher del PMS (que cambia entre properties
 * de la misma org). El TenantSwitcher cambia entre orgs cliente.
 */
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { listClients, type NovaClientRow } from '../../api/nova'
import { useNovaStore } from '../../store/nova'

export function TenantSwitcher() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const setActingOrg = useNovaStore((s) => s.setActingOrg)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { data: clients = [], isLoading } = useQuery<NovaClientRow[]>({
    queryKey: ['nova', 'clients'],
    queryFn: listClients,
    staleTime: 60_000,
  })

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onSelect = (c: NovaClientRow) => {
    setActingOrg(c.id, c.name)
    setOpen(false)
  }

  // No acting org yet — render link to /nova/clientes
  if (!actingOrgId) {
    return (
      <Link
        to="/nova/clientes"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[13px] font-medium transition-colors"
      >
        <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <span>Sin cliente</span>
        <span className="text-slate-400">·</span>
        <span className="text-emerald-600">Elegir</span>
      </Link>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[13px] font-medium transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        <span className="max-w-[180px] truncate">{actingOrgName ?? '...'}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 min-w-[280px] rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] overflow-hidden z-30"
        >
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Cambiar cliente
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Cargando...</div>
            )}
            {!isLoading && clients.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Sin clientes accesibles</div>
            )}
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className={
                  'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ' +
                  (c.id === actingOrgId ? 'bg-emerald-50/60' : '')
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-900 truncate">{c.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.subtitle}</div>
                </div>
                {c.id === actingOrgId && (
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" aria-hidden />
                )}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
            <Link
              to="/nova/clientes"
              onClick={() => setOpen(false)}
              className="text-[12px] text-emerald-700 hover:text-emerald-800 font-medium"
            >
              Ver todos los clientes →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
