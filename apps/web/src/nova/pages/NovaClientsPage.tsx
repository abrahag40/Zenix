/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * `/nova/clientes` — SuccessFactors-style landing list.
 *
 * - PLATFORM_ADMIN: ve todos los clientes Zenix
 * - PARTNER_ADMIN: orgs del firm
 * - PARTNER_MEMBER: orgs asignadas
 * - ORG_OWNER: su única org (1 card)
 *
 * Click en una card → setActingOrg → redirect a /nova/dashboard.
 * Search inline para filtrar cuando hay >10 clientes (UX>scrolling).
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, CircleDashed, CheckCircle2, AlertCircle } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { listClients, type NovaClientRow } from '../../api/nova'
import { useNovaStore } from '../../store/nova'

export function NovaClientsPage() {
  const navigate = useNavigate()
  const setActingOrg = useNovaStore((s) => s.setActingOrg)
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const [query, setQuery] = useState('')

  const { data: clients = [], isLoading, isError, error } = useQuery<NovaClientRow[]>({
    queryKey: ['nova', 'clients'],
    queryFn: listClients,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    if (!query.trim()) return clients
    const q = query.trim().toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.subtitle ?? '').toLowerCase().includes(q),
    )
  }, [clients, query])

  const onSelect = (c: NovaClientRow) => {
    setActingOrg(c.id, c.name)
    navigate('/nova/dashboard')
  }

  return (
    <NovaShell title="Clientes">
      <div className="space-y-4">
        {/* Header + search */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">
              Selecciona un cliente
            </h2>
            <p className="text-[13px] text-slate-600 mt-0.5">
              Tu sesión se vinculará a esta organización hasta que cambies.
            </p>
          </div>
          {clients.length > 6 && (
            <div className="relative w-full sm:w-72">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>
          )}
        </div>

        {/* States */}
        {isLoading && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CircleDashed className="h-6 w-6 text-slate-400 mx-auto animate-spin" />
            <div className="mt-3 text-[13px] text-slate-500">Cargando clientes...</div>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-6 text-center">
            <AlertCircle className="h-6 w-6 text-red-500 mx-auto" />
            <div className="mt-2 text-[13px] text-red-700 font-medium">
              No se pudieron cargar los clientes
            </div>
            <div className="mt-1 text-[12px] text-red-600">
              {(error as Error)?.message ?? 'Error desconocido'}
            </div>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Building2 className="h-8 w-8 text-slate-300 mx-auto" />
            <div className="mt-3 text-[14px] font-medium text-slate-700">
              {query ? `Sin resultados para "${query}"` : 'Sin clientes accesibles'}
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              {query
                ? 'Limpia el buscador o ajusta los términos.'
                : 'Contacta soporte si crees que esto es un error.'}
            </div>
          </div>
        )}

        {/* Grid de cards */}
        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className={
                  'group relative text-left bg-white rounded-xl border p-4 transition-all hover:shadow-md hover:border-emerald-400 ' +
                  (c.id === actingOrgId
                    ? 'border-emerald-400 ring-1 ring-emerald-200'
                    : 'border-slate-200')
                }
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-[14px] flex-shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate font-mono">
                      {c.slug}
                    </div>
                    <div className="text-[12px] text-slate-600 mt-1 truncate">
                      {c.subtitle}
                    </div>
                  </div>
                  {c.id === actingOrgId && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" aria-hidden />
                  )}
                </div>

                {/* Status footer chip */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <StatusChip status={c.status} />
                  <span className="text-[11px] text-slate-400">
                    {c.activatedAt
                      ? `Activo desde ${new Date(c.activatedAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' })}`
                      : 'Sin activar'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </NovaShell>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: 'Activo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ONBOARDING: { label: 'Onboarding', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    SUSPENDED: { label: 'Suspendido', cls: 'bg-red-50 text-red-700 border-red-200' },
  }
  const def = map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${def.cls}`}
    >
      {def.label}
    </span>
  )
}
