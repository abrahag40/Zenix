/*
 * ChannexAdminPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sprint CHANNEX-OUTBOUND-CERT Day 6 — admin observability surface.
 *
 * Esta página existe para 2 audiencias:
 *   1. SUPERVISOR día-a-día: detectar sync issues + acción rápida
 *   2. **Channex Stage 4 reviewer** durante live screenshare cert
 *      — quiere ver queue counts, retry logic activa, DEAD_LETTER visible
 *
 * Cards mostradas:
 *   · Outbound queue status (PENDING / IN_PROGRESS / SUCCEEDED / FAILED /
 *     DEAD_LETTER) — counts last 24h
 *   · Inbound webhooks last 24h + last received
 *   · Token bucket capacity remaining per (kind, property)
 *   · Full sync last run + next eligible
 *   · DEAD_LETTER list con error message
 *   · Manual full sync trigger button
 *
 * Acceso: SUPERVISOR only (mismo gate que /channex/conflicts).
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StaffRole } from '@zenix/shared'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'

interface ChannexAdminStatus {
  propertyId: string
  channexPropertyId: string | null
  timezone: string | null
  generatedAt: string
  windowSince: string
  outbound: {
    byStatus: Record<string, number>
    deadLetters: Array<{
      id: string
      kind: string
      attempts: number
      lastError: string | null
      processedAt: string | null
      createdAt: string
    }>
    tokenBucket: {
      availability: { tokensRemaining: number; windowConsumed: number; capacity: number }
      ratesRestrictions: { tokensRemaining: number; windowConsumed: number; capacity: number }
    }
  }
  inbound: {
    byStatus: Record<string, number>
    webhookCount24h: number
    lastWebhookAt: string | null
    lastWebhookEvent: string | null
    deadLetters: Array<{
      id: string
      eventType: string
      channexBookingId: string | null
      attempts: number
      lastError: string | null
      processedAt: string | null
    }>
    feedLastRunAt: string | null
  }
  fullSync: {
    lastRunAt: string | null
    windowStart: number
    windowEnd: number
    nextEligibleAt: string | null
  }
  conflicts: { openCount: number }
}

export default function ChannexAdminPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const isSupervisor = user?.role === StaffRole.SUPERVISOR
  const propertyId = user?.propertyId

  const { data: status, isLoading } = useQuery<ChannexAdminStatus>({
    queryKey: ['channex-admin-status', propertyId],
    queryFn: () => api.get(`/v1/admin/channex/status/${propertyId}`),
    enabled: !!propertyId && isSupervisor,
    refetchInterval: 30_000, // refresh cada 30s — vistazo en vivo durante screenshare
  })

  const fullSync = useMutation({
    mutationFn: async () => api.post(`/v1/admin/channex/full-sync/${propertyId}`, {}),
    onSuccess: async (data) => {
      await qc.refetchQueries({ queryKey: ['channex-admin-status', propertyId] })
      const outcome = (data as { outcome?: { ran?: boolean; reason?: string } })?.outcome
      if (outcome?.ran) {
        toast.success('Full sync disparado — revisa los counts en breve')
      } else {
        toast.error(`Full sync skipped: ${outcome?.reason ?? 'unknown'}`)
      }
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? 'Full sync falló')
    },
  })

  if (!isSupervisor) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Solo los supervisores pueden ver el panel admin de Channex.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Channex — Admin</h1>
          <p className="mt-1 text-sm text-slate-600">
            Observabilidad del sync con Channel Manager.{' '}
            {status?.channexPropertyId ? (
              <>
                Property Channex: <code className="font-mono text-xs">{status.channexPropertyId}</code>
              </>
            ) : (
              <span className="text-amber-700">⚠ Property NO conectada a Channex</span>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={fullSync.isPending || !status?.channexPropertyId}
          onClick={() => fullSync.mutate()}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {fullSync.isPending ? 'Disparando…' : 'Manual full sync'}
        </button>
      </header>

      {isLoading || !status ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Cargando estado…
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Outbound — PMS → Channex ────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Outbound (PMS → Channex) · últimas 24h
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatusPill label="Pending" value={status.outbound.byStatus.PENDING ?? 0} tone="slate" />
              <StatusPill label="In progress" value={status.outbound.byStatus.IN_PROGRESS ?? 0} tone="blue" />
              <StatusPill label="Succeeded" value={status.outbound.byStatus.SUCCEEDED ?? 0} tone="emerald" />
              <StatusPill label="Failed" value={status.outbound.byStatus.FAILED ?? 0} tone="amber" />
              <StatusPill label="Dead letter" value={status.outbound.byStatus.DEAD_LETTER ?? 0} tone="red" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TokenBucketCard
                label="Availability"
                snap={status.outbound.tokenBucket.availability}
              />
              <TokenBucketCard
                label="Rates + Restrictions"
                snap={status.outbound.tokenBucket.ratesRestrictions}
              />
            </div>
          </section>

          {/* ── Inbound — Channex → PMS ─────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Inbound (Channex → PMS) · últimas 24h
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatusPill label="Pending" value={status.inbound.byStatus.PENDING ?? 0} tone="slate" />
              <StatusPill label="In progress" value={status.inbound.byStatus.IN_PROGRESS ?? 0} tone="blue" />
              <StatusPill label="Succeeded" value={status.inbound.byStatus.SUCCEEDED ?? 0} tone="emerald" />
              <StatusPill label="Failed" value={status.inbound.byStatus.FAILED ?? 0} tone="amber" />
              <StatusPill label="Dead letter" value={status.inbound.byStatus.DEAD_LETTER ?? 0} tone="red" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <Stat label="Webhooks 24h" value={String(status.inbound.webhookCount24h)} />
              <Stat
                label="Último webhook"
                value={
                  status.inbound.lastWebhookAt
                    ? `${status.inbound.lastWebhookEvent} · ${fmtRelative(status.inbound.lastWebhookAt)}`
                    : '—'
                }
              />
              <Stat
                label="Feed last run"
                value={status.inbound.feedLastRunAt ? fmtRelative(status.inbound.feedLastRunAt) : '—'}
              />
            </dl>
          </section>

          {/* ── Full sync state ────────────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Full sync (500 días)
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Stat
                label="Última corrida"
                value={status.fullSync.lastRunAt ? fmtRelative(status.fullSync.lastRunAt) : 'Nunca'}
              />
              <Stat
                label="Próxima elegible"
                value={
                  status.fullSync.nextEligibleAt
                    ? fmtRelative(status.fullSync.nextEligibleAt)
                    : 'Ahora'
                }
              />
              <Stat
                label="Ventana local"
                value={`${pad(status.fullSync.windowStart)}:00 – ${pad(status.fullSync.windowEnd)}:00`}
              />
              <Stat label="Timezone" value={status.timezone ?? '—'} />
            </dl>
          </section>

          {/* ── Conflict review queue ─────────────────────────────────── */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Conflicts pendientes
            </h2>
            <p className="text-sm text-slate-700">
              {status.conflicts.openCount === 0 ? (
                <span className="text-emerald-700">✓ Sin conflicts abiertos</span>
              ) : (
                <>
                  <strong className="text-amber-700">{status.conflicts.openCount}</strong>{' '}
                  reserva{status.conflicts.openCount === 1 ? '' : 's'} OTA requiere
                  {status.conflicts.openCount === 1 ? '' : 'n'} review →{' '}
                  <a href="/channex/conflicts" className="text-slate-900 underline">
                    Resolver
                  </a>
                </>
              )}
            </p>
          </section>

          {/* ── DEAD_LETTER lists ─────────────────────────────────────── */}
          {(status.outbound.deadLetters.length > 0 || status.inbound.deadLetters.length > 0) && (
            <section className="rounded-lg border border-red-200 bg-red-50 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
                DEAD_LETTER queue — acción humana requerida
              </h2>
              {status.outbound.deadLetters.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                    Outbound (PMS → Channex) — {status.outbound.deadLetters.length}
                  </h3>
                  <ul className="space-y-2 text-xs">
                    {status.outbound.deadLetters.map((d) => (
                      <li key={d.id} className="rounded border border-red-200 bg-white p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-red-700">{d.kind}</span>
                          <span className="text-slate-500">attempts {d.attempts}/5</span>
                          <span className="text-slate-500">{fmtRelative(d.createdAt)}</span>
                        </div>
                        {d.lastError && (
                          <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-700">
                            {d.lastError.slice(0, 300)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {status.inbound.deadLetters.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                    Inbound (Channex → PMS) — {status.inbound.deadLetters.length}
                  </h3>
                  <ul className="space-y-2 text-xs">
                    {status.inbound.deadLetters.map((d) => (
                      <li key={d.id} className="rounded border border-red-200 bg-white p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-red-700">{d.eventType}</span>
                          {d.channexBookingId && (
                            <span className="font-mono text-[10px] text-slate-500">
                              booking {d.channexBookingId.slice(0, 12)}…
                            </span>
                          )}
                          <span className="text-slate-500">attempts {d.attempts}/5</span>
                        </div>
                        {d.lastError && (
                          <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-700">
                            {d.lastError.slice(0, 300)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ── UI primitives ───────────────────────────────────────────────────────────

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'slate' | 'blue' | 'emerald' | 'amber' | 'red'
}) {
  const colors: Record<typeof tone, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  }
  return (
    <div className={`rounded border px-3 py-2 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}

function TokenBucketCard({
  label,
  snap,
}: {
  label: string
  snap: { tokensRemaining: number; windowConsumed: number; capacity: number }
}) {
  const pct = Math.round((snap.tokensRemaining / snap.capacity) * 100)
  const tone = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {snap.tokensRemaining}/{snap.capacity} tokens · {snap.windowConsumed} en último min
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-100">
        <div className={`h-2 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-900">{value}</dd>
    </div>
  )
}

function fmtRelative(iso: string): string {
  const date = new Date(iso)
  const diff = (Date.now() - date.getTime()) / 1000 // seconds
  if (Math.abs(diff) < 60) return diff > 0 ? 'hace segundos' : 'en segundos'
  const mins = Math.round(Math.abs(diff) / 60)
  if (mins < 60) return diff > 0 ? `hace ${mins}m` : `en ${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return diff > 0 ? `hace ${hrs}h` : `en ${hrs}h`
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
