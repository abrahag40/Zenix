/**
 * NovaMigrationPage — Zenix Onboard (MIGRATION-CORE Sprint 3). Preview/dry-run:
 * subir export → ver resumen + empalmes → resolver (omitir/aceptar/reasignar) →
 * gate (no se puede importar con ERRORes sin resolver). El load a producción es
 * Sprint 4 (el botón queda visible + bloqueado).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUpFromLine, FileSpreadsheet, AlertTriangle, CheckCircle2, SkipForward,
  ShieldCheck, ArrowLeftRight, Trash2, Upload,
} from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { useNovaStore } from '../../store/nova'
import {
  Surface, Eyebrow, Headline, Caption, Body, Button, StatTile, Chip, EmptyState,
} from '../design-system'
import { migrationApi, type MigrationConflict } from '../api/migration-client'

const CONFLICT_LABEL: Record<string, string> = {
  ROOM_OVERLAP: 'Empalme de habitación', BED_OVERLAP: 'Empalme de cama',
  DUP_GUEST: 'Huésped duplicado', NO_ROOM_MATCH: 'Habitación sin emparejar',
  BAD_DATE: 'Fecha inválida', NEGATIVE_AMOUNT: 'Monto negativo', UNMAPPED_RATE: 'Tarifa sin mapear',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
}

export function NovaMigrationPage() {
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const qc = useQueryClient()

  const [propertyId, setPropertyId] = useState('')
  const [sourceSystem, setSourceSystem] = useState('CLOUDBEDS')
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [acceptingRow, setAcceptingRow] = useState<number | null>(null)
  const [acceptReason, setAcceptReason] = useState('')
  const [reassigningRow, setReassigningRow] = useState<number | null>(null)
  const [reassignRoomId, setReassignRoomId] = useState('')

  const properties = useQuery({
    queryKey: ['mig-properties', actingOrgId],
    queryFn: () => migrationApi.properties(),
    enabled: !!actingOrgId,
  })
  const sources = useQuery({
    queryKey: ['mig-sources', actingOrgId],
    queryFn: () => migrationApi.sources(),
    enabled: !!actingOrgId,
  })
  const rooms = useQuery({
    queryKey: ['mig-rooms', propertyId],
    queryFn: () => migrationApi.rooms(propertyId),
    enabled: !!propertyId,
  })

  const job = useQuery({
    queryKey: ['mig-job', jobId],
    queryFn: () => migrationApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (['VALIDATING', 'PARSING', 'LOADING'].includes(q.state.data?.status ?? '') ? 1500 : false),
  })
  const conflicts = useQuery({
    queryKey: ['mig-conflicts', jobId],
    queryFn: () => migrationApi.getConflicts(jobId!),
    enabled: !!jobId && job.data?.status === 'PREVIEW_READY',
  })

  const createMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Elige un archivo CSV')
      const b64 = await fileToBase64(file)
      return migrationApi.createJob(propertyId, { sourceSystem, fileName: file.name, fileBase64: b64 })
    },
    onSuccess: (j) => { setJobId(j.id); toast.success('Archivo analizado — revisa el preview') },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo analizar el archivo'),
  })

  const resolveMut = useMutation({
    mutationFn: ({ rowIndex, action, targetRoomId, reason }: { rowIndex: number; action: 'SKIP' | 'ACCEPT' | 'REASSIGN'; targetRoomId?: string; reason?: string }) =>
      migrationApi.resolveRow(jobId!, rowIndex, { action, targetRoomId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mig-job', jobId] })
      qc.invalidateQueries({ queryKey: ['mig-conflicts', jobId] })
      setAcceptingRow(null); setAcceptReason(''); setReassigningRow(null); setReassignRoomId('')
      toast.success('Conflicto resuelto')
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo resolver'),
  })

  const deleteMut = useMutation({
    mutationFn: () => migrationApi.deleteJob(jobId!),
    onSuccess: () => { toast.success('Migración descartada'); setJobId(null); setFile(null) },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo descartar'),
  })

  // Sprint 4 — load idempotente a producción.
  const loadMut = useMutation({
    mutationFn: () => migrationApi.load(jobId!),
    onSuccess: (j) => {
      qc.invalidateQueries({ queryKey: ['mig-job', jobId] })
      const c = j.counts ?? {}
      if ((c.failed ?? 0) > 0) toast.warning(`Importación parcial: ${c.loaded ?? 0} cargadas, ${c.failed} fallidas`)
      else toast.success(`Importación completa: ${c.loaded ?? 0} reservas cargadas`)
    },
    onError: (e: Error) => toast.error(e.message ?? 'No se pudo importar'),
  })

  // Abre el reporte HTML en una pestaña nueva (fetch con auth → blob).
  const openReport = async () => {
    try {
      const html = await migrationApi.report(jobId!)
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo abrir el reporte')
    }
  }

  useEffect(() => { if (properties.data && !propertyId && properties.data[0]) setPropertyId(properties.data[0].id) }, [properties.data, propertyId])

  const counts = job.data?.counts ?? {}
  const blocking = counts.blocking ?? 0
  const status = job.data?.status
  const canImport = status === 'PREVIEW_READY' && blocking === 0
  const isLoaded = status === 'COMPLETED' || status === 'PARTIAL'

  // Solo refs numéricas (filas del import) son resolubles; `existing:` no.
  const firstResolvableRef = (c: MigrationConflict): number | null => {
    const r = c.rowRefs.find((x) => /^\d+$/.test(x))
    return r != null ? Number(r) : null
  }

  if (!actingOrgId) {
    return (
      <NovaShell>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Surface variant="raised" radius="lg" padding="lg" tone="warning">
            <Body>Selecciona un cliente en <strong>/nova/clientes</strong> primero — la migración opera sobre la organización activa.</Body>
          </Surface>
        </div>
      </NovaShell>
    )
  }

  return (
    <NovaShell>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700">
            <ArrowUpFromLine className="h-4 w-4" />
          </div>
          <div>
            <Eyebrow>Zenix Onboard</Eyebrow>
            <Headline as="h1">Migración desde otro PMS</Headline>
          </div>
        </div>
        <Caption className="max-w-2xl">
          Sube el export de reservas del PMS actual del cliente{actingOrgName ? ` (${actingOrgName})` : ''}. Te mostramos
          un <strong>preview con los empalmes y errores</strong> antes de cargar nada a producción.
        </Caption>

        {/* Paso 1: subir */}
        {!jobId && (
          <Surface variant="raised" radius="lg" padding="lg">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[12px] font-medium text-slate-600">Propiedad destino</span>
                <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                  {(properties.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-slate-600">PMS de origen</span>
                <select value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                  {(sources.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-slate-600">Archivo CSV</span>
                <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-emerald-50 file:px-2 file:py-1 file:text-emerald-700" />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button iconLeft={Upload} disabled={!propertyId || !file || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'Analizando…' : 'Subir y analizar'}
              </Button>
              <Caption>El archivo no toca producción — solo se analiza en un área temporal.</Caption>
            </div>
          </Surface>
        )}

        {/* Paso 2: preview */}
        {jobId && job.data && (
          <>
            {(job.data.status === 'PARSING' || job.data.status === 'VALIDATING' || job.data.status === 'LOADING') && (
              <Surface variant="raised" radius="lg" padding="lg">
                <Body>{job.data.status === 'LOADING' ? 'Importando a producción…' : 'Analizando el archivo…'} ({job.data.status})</Body>
              </Surface>
            )}

            {/* Paso 3: resultado del load (COMPLETED / PARTIAL) */}
            {isLoaded && (
              <>
                <Surface variant="raised" radius="lg" padding="lg" tone={status === 'PARTIAL' ? 'warning' : undefined}>
                  <div className="flex items-center gap-3">
                    {status === 'PARTIAL'
                      ? <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0" />
                      : <CheckCircle2 className="h-6 w-6 text-emerald-500 flex-shrink-0" />}
                    <div>
                      <Headline as="h2">{status === 'PARTIAL' ? 'Importación parcial' : 'Migración completada'}</Headline>
                      <Caption>
                        {counts.loaded ?? 0} cargadas · {counts.existing ?? 0} ya existían · {counts.skipped ?? 0} omitidas · {counts.failed ?? 0} fallidas
                      </Caption>
                    </div>
                  </div>
                </Surface>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatTile icon={CheckCircle2} accent="emerald" label="Cargadas" value={counts.loaded ?? 0} />
                  <StatTile icon={FileSpreadsheet} accent="indigo" label="Ya existían" value={counts.existing ?? 0} />
                  <StatTile icon={SkipForward} accent="amber" label="Omitidas" value={counts.skipped ?? 0} />
                  <StatTile icon={AlertTriangle} accent={(counts.failed ?? 0) > 0 ? 'red' : 'emerald'} label="Fallidas" value={counts.failed ?? 0} />
                </div>
                <div className="flex items-center gap-3">
                  <Button iconLeft={FileSpreadsheet} onClick={openReport}>Ver reporte</Button>
                  <div className="flex-1" />
                  <Button variant="ghost" onClick={() => { setJobId(null); setFile(null) }}>Nueva migración</Button>
                </div>
              </>
            )}

            {job.data.status === 'PREVIEW_READY' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <StatTile icon={FileSpreadsheet} accent="indigo" label="Reservas" value={counts.parsed ?? 0} />
                  <StatTile icon={CheckCircle2} accent="emerald" label="OK" value={counts.ok ?? 0} />
                  <StatTile icon={AlertTriangle} accent="amber" label="Avisos" value={counts.warn ?? 0} />
                  <StatTile icon={AlertTriangle} accent="red" label="Empalmes" value={counts.overlaps ?? 0} hint="habitación/cama" />
                  <StatTile icon={ShieldCheck} accent={blocking === 0 ? 'emerald' : 'red'} label="Bloqueantes" value={blocking} hint="errores sin resolver" />
                </div>

                <div className="flex items-center gap-3">
                  <Button iconLeft={ArrowUpFromLine} disabled={!canImport || loadMut.isPending}
                    onClick={() => loadMut.mutate()}>
                    {loadMut.isPending ? 'Importando…' : 'Importar a producción'}
                  </Button>
                  {!canImport && blocking > 0 && <Caption>Resuelve los {blocking} conflicto(s) bloqueante(s) para habilitar la importación.</Caption>}
                  <div className="flex-1" />
                  <Button variant="ghost" iconLeft={Trash2} onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                    Descartar
                  </Button>
                </div>

                {/* Conflictos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Headline as="h2">Conflictos a revisar</Headline>
                    {conflicts.data && <Chip>{conflicts.data.total} total</Chip>}
                  </div>
                  {conflicts.data && conflicts.data.total === 0 && (
                    <EmptyState icon={CheckCircle2} title="Sin conflictos" description="Todo listo para importar." />
                  )}
                  <div className="space-y-2 mt-3">
                    {(conflicts.data?.conflicts ?? []).map((c) => {
                      const rowIndex = firstResolvableRef(c)
                      const isError = c.severity === 'ERROR'
                      return (
                        <Surface key={c.id} variant="raised" radius="md" padding="md" tone={isError ? 'warning' : undefined}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Chip variant={isError ? 'danger' : 'warning'}>{CONFLICT_LABEL[c.type] ?? c.type}</Chip>
                                <span className="text-[11px] text-slate-400">filas {c.rowRefs.join(', ')}</span>
                              </div>
                              <Body className="mt-1 text-[13px]">{c.message}</Body>
                            </div>
                            {rowIndex != null && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Button size="sm" variant="ghost" iconLeft={SkipForward}
                                  onClick={() => resolveMut.mutate({ rowIndex, action: 'SKIP' })}>Omitir</Button>
                                {(c.type === 'ROOM_OVERLAP' || c.type === 'BED_OVERLAP') && (
                                  <Button size="sm" variant="ghost" iconLeft={ShieldCheck}
                                    onClick={() => { setAcceptingRow(rowIndex); setReassigningRow(null) }}>Aceptar</Button>
                                )}
                                <Button size="sm" variant="ghost" iconLeft={ArrowLeftRight}
                                  onClick={() => { setReassigningRow(rowIndex); setAcceptingRow(null) }}>Reasignar</Button>
                              </div>
                            )}
                          </div>

                          {rowIndex != null && acceptingRow === rowIndex && (
                            <div className="mt-3 flex items-end gap-2">
                              <label className="flex-1">
                                <span className="text-[11px] text-slate-500">Razón (≥5 caracteres) — queda en el audit</span>
                                <input value={acceptReason} onChange={(e) => setAcceptReason(e.target.value)}
                                  className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                                  placeholder="Ej: empalme histórico real del hotel" />
                              </label>
                              <Button size="sm" disabled={acceptReason.trim().length < 5 || resolveMut.isPending}
                                onClick={() => resolveMut.mutate({ rowIndex, action: 'ACCEPT', reason: acceptReason })}>Confirmar</Button>
                            </div>
                          )}

                          {rowIndex != null && reassigningRow === rowIndex && (
                            <div className="mt-3 flex items-end gap-2">
                              <label className="flex-1">
                                <span className="text-[11px] text-slate-500">Habitación destino en Zenix</span>
                                <select value={reassignRoomId} onChange={(e) => setReassignRoomId(e.target.value)}
                                  className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                                  <option value="">— elige —</option>
                                  {(rooms.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.number} ({r.category === 'SHARED' ? 'dorm' : 'privada'})</option>)}
                                </select>
                              </label>
                              <Button size="sm" disabled={!reassignRoomId || resolveMut.isPending}
                                onClick={() => resolveMut.mutate({ rowIndex, action: 'REASSIGN', targetRoomId: reassignRoomId })}>Confirmar</Button>
                            </div>
                          )}
                        </Surface>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </NovaShell>
  )
}
