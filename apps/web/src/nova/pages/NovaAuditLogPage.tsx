/**
 * `/nova/audit` — Audit log page.
 *
 * Apple HIG-inspired list+detail pattern:
 *   - Filter bar top (action dropdown, date range, status, search by actor)
 *   - Table list virtualized-friendly (limit 50 + cursor next-page)
 *   - Click row → detail drawer side panel con payload completo
 *
 * Append-only — solo READ. Sin acciones destructivas. Compliance Visa CRR
 * §5.9.2 + CFDI Art. 30 + GDPR Art. 17.3.b retention.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, ScrollText, ChevronRight, AlertCircle, CheckCircle2, Clock, User } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import {
  Surface,
  Headline,
  Title,
  Body,
  Callout,
  Subhead,
  Caption,
  Eyebrow,
  Code,
  Chip,
  Button,
  EmptyState,
  Skeleton,
  StatusChip,
} from '../design-system'
import {
  listAuditLogs,
  listAuditLogActions,
  getAuditLog,
  type AuditLogRow,
  type AuditLogDetail,
} from '../../api/nova'
import { useNovaStore } from '../../store/nova'

export function NovaAuditLogPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'SUCCESS' | 'FAILURE' | 'PARTIAL'>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: actionsData } = useQuery({
    queryKey: ['nova', 'audit', 'actions', actingOrgId],
    queryFn: listAuditLogActions,
    enabled: !!actingOrgId,
    staleTime: 60_000,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['nova', 'audit', 'list', actingOrgId, actionFilter, statusFilter, dateFrom, dateTo],
    queryFn: () =>
      listAuditLogs({
        action: actionFilter || undefined,
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 50,
      }),
    enabled: !!actingOrgId,
  })

  const { data: detail } = useQuery({
    queryKey: ['nova', 'audit', 'detail', selectedId],
    queryFn: () => (selectedId ? getAuditLog(selectedId) : Promise.resolve(null)),
    enabled: !!selectedId,
  })

  if (!actingOrgId) {
    return (
      <NovaShell title="Audit log">
        <Surface variant="raised" radius="xl" className="max-w-md mx-auto">
          <EmptyState
            icon={ScrollText}
            title="Sin cliente seleccionado"
            description="El audit log es scope cliente — elige uno desde el listado."
          />
        </Surface>
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Audit log">
      <div className="space-y-4 max-w-7xl">
        <div>
          <Headline>Audit log</Headline>
          <Body className="mt-0.5" tone="secondary">
            Historial inmutable de acciones del cliente. Append-only (§165 D-NOVA-7).
          </Body>
        </div>

        {/* Filter bar */}
        <Surface variant="raised" radius="lg" padding="md">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <Eyebrow tone="tertiary">Filtros</Eyebrow>
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 h-9 rounded-lg border border-slate-300 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-w-[180px]"
            >
              <option value="">Todas las acciones</option>
              {actionsData?.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 h-9 rounded-lg border border-slate-300 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Todos los status</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
              <option value="PARTIAL">PARTIAL</option>
            </select>

            <div className="flex items-center gap-1.5 text-slate-500">
              <Subhead tone="tertiary">Fecha:</Subhead>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 h-9 rounded-lg border border-slate-300 text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 h-9 rounded-lg border border-slate-300 text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {(actionFilter || statusFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionFilter('')
                  setStatusFilter('')
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </Surface>

        {/* Layout: list + detail drawer */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
          {/* List */}
          <div>
            {isLoading && (
              <Surface variant="raised" radius="lg" padding="md">
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height="44px" />
                  ))}
                </div>
              </Surface>
            )}

            {isError && (
              <Surface variant="raised" radius="lg" tone="danger" padding="md">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <div>
                    <Title>Error al cargar audit log</Title>
                    <Caption className="mt-1 block" tone="secondary">
                      {(error as Error)?.message ?? 'Error desconocido'}
                    </Caption>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => refetch()}>
                      Reintentar
                    </Button>
                  </div>
                </div>
              </Surface>
            )}

            {!isLoading && !isError && data && data.rows.length === 0 && (
              <Surface variant="raised" radius="lg">
                <EmptyState
                  variant="noResults"
                  icon={ScrollText}
                  title="Sin entries"
                  description={
                    actionFilter || statusFilter || dateFrom || dateTo
                      ? 'Ajusta los filtros para ver más entries.'
                      : 'Este cliente aún no tiene acciones registradas.'
                  }
                />
              </Surface>
            )}

            {!isLoading && !isError && data && data.rows.length > 0 && (
              <Surface variant="raised" radius="lg" className="overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 border-b border-slate-200/70">
                    <tr className="text-left">
                      <Th>Timestamp</Th>
                      <Th>Actor</Th>
                      <Th>Action</Th>
                      <Th>Status</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <AuditRow
                        key={row.id}
                        row={row}
                        isSelected={row.id === selectedId}
                        onClick={() => setSelectedId(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-slate-200/70 px-3 py-2 bg-slate-50/50 flex items-center justify-between">
                  <Caption tone="tertiary">
                    Mostrando {data.rows.length} {data.nextCursor ? 'de más' : 'entries'}
                  </Caption>
                  {data.nextCursor && (
                    <Caption tone="quaternary">
                      Paginación cursor implementada — UI next-page Day 14
                    </Caption>
                  )}
                </div>
              </Surface>
            )}
          </div>

          {/* Detail drawer */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            {selectedId ? (
              <DetailPanel
                detail={detail}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <Surface variant="raised" radius="lg" padding="md" className="text-center">
                <Body tone="tertiary">
                  Click un entry de la lista para ver el detalle completo.
                </Body>
              </Surface>
            )}
          </div>
        </div>
      </div>
    </NovaShell>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
      {children}
    </th>
  )
}

function AuditRow({
  row,
  isSelected,
  onClick,
}: {
  row: AuditLogRow
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className={
        'border-b border-slate-100 cursor-pointer transition-colors ' +
        (isSelected ? 'bg-emerald-50/40' : 'hover:bg-slate-50')
      }
    >
      <td className="px-3 py-2.5 align-top">
        <div className="text-[12px] font-medium text-slate-900 tabular-nums">
          {new Date(row.createdAt).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>
        <Caption tone="tertiary">
          {new Date(row.createdAt).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Caption>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-slate-400" />
          <span className="font-mono text-[11px] text-slate-700">
            {row.actorRealId.length > 16 ? row.actorRealId.slice(0, 8) + '…' : row.actorRealId}
          </span>
        </div>
        <Caption tone="tertiary">{row.actorRealRole}</Caption>
        {row.onBehalfOfId && (
          <Chip variant="warning" intent="subtle" size="sm" className="mt-0.5">
            onBehalfOf
          </Chip>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <Code variant="inline" className="text-[11px]">
          {row.action}
        </Code>
        {row.target && (
          <Caption tone="tertiary" className="mt-0.5 truncate max-w-[160px] block font-mono">
            {row.target}
          </Caption>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <StatusChip status={row.status} />
      </td>
      <td className="px-3 py-2.5 align-top">
        <ChevronRight
          className={
            'h-3.5 w-3.5 transition-transform ' +
            (isSelected ? 'rotate-90 text-emerald-600' : 'text-slate-300')
          }
        />
      </td>
    </tr>
  )
}

function DetailPanel({
  detail,
  onClose,
}: {
  detail: AuditLogDetail | null | undefined
  onClose: () => void
}) {
  if (!detail) {
    return (
      <Surface variant="raised" radius="lg" padding="md">
        <Skeleton height="200px" />
      </Surface>
    )
  }
  return (
    <Surface variant="raised" radius="lg" className="overflow-hidden">
      <div className="p-4 border-b border-slate-200/70 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow tone="tertiary">Detalle</Eyebrow>
          <Title className="mt-0.5 truncate">{detail.action}</Title>
        </div>
        <Button variant="ghost" size="xs" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="p-4 space-y-3">
        <DetailRow icon={Clock} label="Timestamp">
          <Body tone="primary" className="tabular-nums">
            {new Date(detail.createdAt).toLocaleString('es-MX')}
          </Body>
        </DetailRow>

        <DetailRow icon={User} label="Actor real">
          <Code variant="inline">{detail.actorRealId}</Code>
          <Caption tone="tertiary" className="block mt-0.5">
            {detail.actorRealRole}
          </Caption>
        </DetailRow>

        {detail.onBehalfOfId && (
          <DetailRow icon={User} label="En nombre de">
            <Code variant="inline">{detail.onBehalfOfId}</Code>
            <Caption tone="tertiary" className="block mt-0.5">
              {detail.onBehalfOfRole}
            </Caption>
            {detail.reason && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <Eyebrow tone="tertiary" className="text-amber-700">
                  Razón impersonation
                </Eyebrow>
                <Body className="mt-1" tone="primary">
                  {detail.reason}
                </Body>
              </div>
            )}
          </DetailRow>
        )}

        <DetailRow icon={CheckCircle2} label="Status">
          <StatusChip status={detail.status} />
        </DetailRow>

        {detail.errorMessage && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-md">
            <Eyebrow tone="tertiary" className="text-red-700">
              Error
            </Eyebrow>
            <Body className="mt-1 font-mono text-[11px]" tone="primary">
              {detail.errorMessage}
            </Body>
          </div>
        )}

        {detail.target && (
          <DetailRow icon={ScrollText} label="Target">
            <Code variant="inline" className="text-[11px]">
              {detail.target}
            </Code>
          </DetailRow>
        )}

        {detail.payload && Object.keys(detail.payload).length > 0 && (
          <div>
            <Eyebrow tone="tertiary" className="block mb-1.5">
              Payload
            </Eyebrow>
            <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[10px] font-mono leading-relaxed overflow-x-auto max-h-72 overflow-y-auto">
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <Caption tone="tertiary">
            Retention: <span className="font-mono">{detail.retentionPolicy}</span>
          </Caption>
        </div>
      </div>
    </Surface>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-slate-400" />
        <Eyebrow tone="tertiary">{label}</Eyebrow>
      </div>
      <div>{children}</div>
    </div>
  )
}
