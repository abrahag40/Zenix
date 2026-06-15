import type { ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ReportTable — primitiva canónica de reporte (Estándar de Reportes, D-REPORT5).
 * Tabla operable: orden por columna, totales, paginación, filtros (slot), export
 * .xlsx/CSV, drill (onRowClick). TODOS los reportes la consumen — prohibido
 * reportería ad-hoc por módulo. Un modal de lectura NO es un reporte.
 */

export interface ReportColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  sortable?: boolean
  render: (row: T) => ReactNode
}

export function ReportTable<T extends { id: string }>({
  title,
  description,
  columns,
  rows,
  loading,
  total,
  page,
  pageSize,
  onPage,
  sort,
  dir,
  onSort,
  totals,
  filters,
  onExport,
  onRowClick,
  emptyText = 'Sin registros para los filtros aplicados.',
}: {
  title: string
  description?: string
  columns: ReportColumn<T>[]
  rows: T[]
  loading?: boolean
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  sort?: string
  dir?: string
  onSort?: (key: string) => void
  totals?: Record<string, ReactNode>
  filters?: ReactNode
  onExport?: (format: 'xlsx' | 'csv') => void
  onRowClick?: (row: T) => void
  emptyText?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Cabecera de control */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {description ? <p className="text-xs text-slate-500 mt-0.5">{description}</p> : null}
          </div>
          {onExport ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onExport('xlsx')}
                className="h-8 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 text-xs font-medium"
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
              <button
                type="button"
                onClick={() => onExport('csv')}
                className="h-8 inline-flex items-center gap-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 text-xs font-medium"
              >
                CSV
              </button>
            </div>
          ) : null}
        </div>
        {filters ? <div className="mt-3 flex flex-wrap items-end gap-2">{filters}</div> : null}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              {columns.map((c) => {
                const active = sort === c.key
                return (
                  <th
                    key={c.key}
                    className={cn('py-2.5 px-3 whitespace-nowrap', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-slate-700 transition-colors',
                          active && 'text-slate-700',
                        )}
                      >
                        {c.header}
                        {active ? (
                          dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : null}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="py-8 text-center text-slate-400">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-8 text-center text-slate-400">{emptyText}</td></tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b border-slate-50', onRowClick && 'hover:bg-slate-50/60 cursor-pointer')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('py-2.5 px-3 text-slate-700', c.align === 'right' ? 'text-right tabular-nums' : 'text-left')}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totals && rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn('py-2.5 px-3', c.align === 'right' ? 'text-right tabular-nums' : 'text-left')}>
                    {totals[c.key] ?? (i === 0 ? 'Totales' : '')}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between p-3 border-t border-slate-100 text-xs text-slate-500">
        <span>{from}–{to} de {total}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="h-7 w-7 grid place-items-center rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2">{page} / {pages}</span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            className="h-7 w-7 grid place-items-center rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
