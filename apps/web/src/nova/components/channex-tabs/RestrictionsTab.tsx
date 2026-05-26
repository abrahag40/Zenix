/**
 * RestrictionsTab — vista de restrictions activas + CTA al bulk editor.
 *
 * El Restrictions tab del Command Center NO duplica el grid del Rate
 * Calendar — lo complementa con una vista resumen:
 *   - Counts: días con stop-sell / MLOS / CTA / CTD activos en el range
 *   - Lista compacta de días con alguna restricción
 *   - CTA "Editar restricciones" abre BulkRateEditDialog en mode='restrictions'
 *
 * Source-of-truth: GET /rate-calendar (Day 6) — los restriction fields
 * vienen en cada cell, los counteamos client-side aquí.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Settings2, AlertTriangle, Calendar, Lock } from 'lucide-react'
import {
  Surface,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Chip,
  Button,
  StatTile,
  EmptyState,
  Skeleton,
  Code,
} from '../../design-system'
import { getRateCalendar, type RateCalendarMatrix } from '../../../api/nova'
import { BulkRateEditDialog } from '../BulkRateEditDialog'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function RestrictionsTab({ propertyId }: { propertyId: string }) {
  const today = useMemo(() => todayYmd(), [])
  const [bulkOpen, setBulkOpen] = useState(false)

  const dateFrom = today
  const dateTo = addDays(today, 89) // 90 días forward

  const { data, isLoading, isError, refetch } = useQuery<RateCalendarMatrix>({
    queryKey: ['nova', 'channex', 'rate-calendar', propertyId, dateFrom, dateTo],
    queryFn: () => getRateCalendar(propertyId, dateFrom, dateTo),
  })

  // Counts cross ratePlans × cells
  const counts = useMemo(() => {
    if (!data) return { stopSell: 0, cta: 0, ctd: 0, mlos: 0, total: 0 }
    let stopSell = 0
    let cta = 0
    let ctd = 0
    let mlos = 0
    let total = 0
    for (const rp of data.ratePlans) {
      for (const cell of rp.cells) {
        total++
        if (cell.stopSell) stopSell++
        if (cell.closedToArrival) cta++
        if (cell.closedToDeparture) ctd++
        if (cell.minStayThrough && cell.minStayThrough > 1) mlos++
      }
    }
    return { stopSell, cta, ctd, mlos, total }
  }, [data])

  // Days with any restriction (groupedBy date)
  const restrictedDays = useMemo(() => {
    if (!data) return []
    const map = new Map<
      string,
      { date: string; planTitles: Set<string>; flags: Set<string> }
    >()
    for (const rp of data.ratePlans) {
      for (const cell of rp.cells) {
        const flags: string[] = []
        if (cell.stopSell) flags.push('stopSell')
        if (cell.closedToArrival) flags.push('CTA')
        if (cell.closedToDeparture) flags.push('CTD')
        if (cell.minStayThrough && cell.minStayThrough > 1)
          flags.push(`MLOS ${cell.minStayThrough}`)
        if (flags.length === 0) continue
        const existing = map.get(cell.date) ?? {
          date: cell.date,
          planTitles: new Set<string>(),
          flags: new Set<string>(),
        }
        existing.planTitles.add(rp.title)
        flags.forEach((f) => existing.flags.add(f))
        map.set(cell.date, existing)
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [data])

  if (isLoading) {
    return (
      <Surface variant="raised" radius="lg" padding="md">
        <Skeleton height="240px" />
      </Surface>
    )
  }

  if (isError) {
    return (
      <Surface variant="raised" radius="lg" tone="danger" padding="md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
          <div>
            <Title>Error al cargar restrictions</Title>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      </Surface>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + CTA */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Title>Restricciones activas — próximos 90 días</Title>
          <Caption tone="tertiary" className="block mt-0.5">
            Resumen de stop-sell, CTA, CTD y MLOS cross rate plans
          </Caption>
        </div>
        {data && data.ratePlans.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={Settings2}
            onClick={() => setBulkOpen(true)}
          >
            Editar restricciones
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={Lock}
          accent="red"
          label="Stop sell"
          value={counts.stopSell}
          hint={`de ${counts.total} celdas (${pct(counts.stopSell, counts.total)})`}
        />
        <StatTile
          icon={Calendar}
          accent="amber"
          label="CTA"
          value={counts.cta}
          hint="Closed to arrival"
        />
        <StatTile
          icon={Calendar}
          accent="amber"
          label="CTD"
          value={counts.ctd}
          hint="Closed to departure"
        />
        <StatTile
          icon={Settings2}
          accent="sky"
          label="MLOS > 1"
          value={counts.mlos}
          hint="Días con minimum length of stay"
        />
      </div>

      {/* Days list */}
      {restrictedDays.length === 0 ? (
        <Surface variant="raised" radius="lg">
          <EmptyState
            variant="success"
            icon={Calendar}
            title="Sin restricciones activas"
            description="Todos los días + rate plans están abiertos sin restricción en los próximos 90 días."
          />
        </Surface>
      ) : (
        <section>
          <Title className="mb-2">Días con restricción ({restrictedDays.length})</Title>
          <Surface variant="raised" radius="lg" className="overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-slate-200/70 text-left">
                <tr>
                  <Th>Fecha</Th>
                  <Th>Rate plans afectados</Th>
                  <Th>Restricciones</Th>
                </tr>
              </thead>
              <tbody>
                {restrictedDays.slice(0, 50).map((d) => (
                  <tr key={d.date} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-900 tabular-nums">
                        {new Date(d.date + 'T00:00:00Z').toLocaleDateString('es-MX', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        })}
                      </div>
                      <Caption tone="tertiary" className="block font-mono text-[10px]">
                        {d.date}
                      </Caption>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(d.planTitles)
                          .slice(0, 3)
                          .map((title) => (
                            <Chip
                              key={title}
                              variant="neutral"
                              intent="subtle"
                              size="sm"
                            >
                              {title}
                            </Chip>
                          ))}
                        {d.planTitles.size > 3 && (
                          <Caption tone="tertiary">+{d.planTitles.size - 3}</Caption>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(d.flags).map((flag) => {
                          const isStopSell = flag === 'stopSell'
                          return (
                            <Chip
                              key={flag}
                              variant={isStopSell ? 'danger' : 'warning'}
                              intent="tonal"
                              size="sm"
                            >
                              {flag}
                            </Chip>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {restrictedDays.length > 50 && (
              <div className="px-3 py-2 bg-slate-50/50 border-t border-slate-200/70">
                <Caption tone="tertiary">
                  Mostrando 50 primeros · {restrictedDays.length - 50} más en el rango
                </Caption>
              </div>
            )}
          </Surface>
        </section>
      )}

      {/* Bulk dialog */}
      {data && (
        <BulkRateEditDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          propertyId={propertyId}
          ratePlans={data.ratePlans}
          initialDates={{ from: dateFrom, to: dateTo }}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  )
}

function pct(num: number, total: number): string {
  if (total === 0) return '0%'
  return ((num / total) * 100).toFixed(1) + '%'
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
      {children}
    </th>
  )
}
