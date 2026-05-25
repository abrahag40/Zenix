/**
 * `/nova/clientes` — SuccessFactors-style tenant landing list.
 *
 * Refactor 2026-05-25 (design system Nova): toda la página usa primitives
 * del DS. Hierarchy clara, density compacta Apple HIG.
 *
 * - PLATFORM_ADMIN: ve todos los clientes Zenix
 * - PARTNER_ADMIN: orgs del firm
 * - PARTNER_MEMBER: orgs asignadas
 * - ORG_OWNER: su única org
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { listClients, type NovaClientRow } from '../../api/nova'
import { useNovaStore } from '../../store/nova'
import {
  Surface,
  Headline,
  Body,
  Title,
  Caption,
  Code,
  StatusChip,
  EmptyState,
  Skeleton,
} from '../design-system'

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
      <div className="space-y-5 max-w-6xl">
        {/* Header */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <Headline as="h2">Selecciona un cliente</Headline>
            <Body className="mt-0.5" tone="secondary">
              Tu sesión se vinculará a esta organización hasta que cambies.
            </Body>
          </div>
          {clients.length > 6 && <SearchInput query={query} onChange={setQuery} />}
        </div>

        {/* States */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Surface key={i} variant="raised" radius="lg" padding="md">
                <div className="flex items-start gap-3">
                  <Skeleton variant="circle" className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton width="60%" />
                    <Skeleton width="40%" />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <Skeleton width="30%" />
                </div>
              </Surface>
            ))}
          </div>
        )}

        {isError && (
          <Surface variant="raised" radius="lg" tone="danger" padding="md">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <Title>No se pudieron cargar los clientes</Title>
                <Caption className="mt-1 block" tone="secondary">
                  {(error as Error)?.message ?? 'Error desconocido'}
                </Caption>
              </div>
            </div>
          </Surface>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <Surface variant="raised" radius="xl">
            <EmptyState
              variant={query ? 'noResults' : 'default'}
              icon={query ? Search : Building2}
              title={query ? `Sin resultados para "${query}"` : 'Sin clientes accesibles'}
              description={
                query
                  ? 'Limpia el buscador o ajusta los términos.'
                  : 'Contacta soporte si crees que esto es un error.'
              }
            />
          </Surface>
        )}

        {/* Cards grid */}
        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                isSelected={c.id === actingOrgId}
                onSelect={() => onSelect(c)}
              />
            ))}
          </div>
        )}
      </div>
    </NovaShell>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function SearchInput({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search
        className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        aria-hidden
      />
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-3 h-9 rounded-lg border border-slate-300 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400"
      />
    </div>
  )
}

function ClientCard({
  client,
  isSelected,
  onSelect,
}: {
  client: NovaClientRow
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <Surface
      variant="raised"
      radius="lg"
      hoverable
      padding="md"
      tone={isSelected ? 'success' : 'neutral'}
      onClick={onSelect}
      className="group"
    >
      <div className="flex items-start gap-3">
        <div
          className={
            'w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-[13px] flex-shrink-0 transition-colors ' +
            (isSelected
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]'
              : 'bg-gradient-to-br from-slate-100 to-slate-200/80 text-slate-700 group-hover:from-slate-200 group-hover:to-slate-300/80')
          }
        >
          {initials(client.name)}
        </div>
        <div className="flex-1 min-w-0">
          <Title className="truncate group-hover:text-emerald-800 transition-colors">
            {client.name}
          </Title>
          <Code variant="inline" className="text-[10px] block truncate mt-0.5">
            {client.slug}
          </Code>
          <Caption className="mt-1 block truncate" tone="secondary">
            {client.subtitle}
          </Caption>
        </div>
        {isSelected && (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" aria-hidden />
        )}
      </div>

      {/* Status footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <StatusChip
          status={client.status}
          label={
            client.status === 'ACTIVE'
              ? 'Activo'
              : client.status === 'ONBOARDING'
                ? 'Onboarding'
                : client.status === 'SUSPENDED'
                  ? 'Suspendido'
                  : client.status
          }
        />
        <Caption tone="quaternary">
          {client.activatedAt
            ? `Activo desde ${new Date(client.activatedAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' })}`
            : 'Sin activar'}
        </Caption>
      </div>
    </Surface>
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
