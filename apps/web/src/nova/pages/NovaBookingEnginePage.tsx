/**
 * NovaBookingEnginePage — BOOKING-ENGINE B4.
 *
 * Panel consultor-led de "Zenix Booking" (motor de reservas directas). Ruta
 * /nova/booking-engine. El consultor:
 *   · Ve todas las properties del cliente con su estado on/off.
 *   · ACTIVA/DESACTIVA el motor por property (opcional — se cobra extra).
 *   · Copia la URL pública + genera API keys + suscribe webhooks.
 *
 * Headless: el website del hotel (que hace el owner/un tercero) consume la API
 * con la key. Opción B: paymentPolicy = PAY_AT_HOTEL (prepago llega con PAY-CORE).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Power, KeyRound, Webhook, Copy, Trash2, Plus, ExternalLink, Globe } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import { Surface, Headline, Title, Body, Caption, Callout, Chip, Button, EmptyState } from '../design-system'
import { useNovaStore } from '../../store/nova'
import { bookingEngineClient } from '../api/booking-engine-client'
import toast from 'react-hot-toast'

export function NovaBookingEnginePage() {
  const qc = useQueryClient()
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const [selected, setSelected] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['booking-engine-list', actingOrgId],
    queryFn: () => bookingEngineClient.list(),
    enabled: !!actingOrgId,
  })

  const toggle = useMutation({
    mutationFn: ({ propertyId, enabled }: { propertyId: string; enabled: boolean }) =>
      bookingEngineClient.toggle(propertyId, enabled),
    onSuccess: (_d, v) => {
      toast.success(v.enabled ? 'Zenix Booking activado' : 'Zenix Booking desactivado')
      qc.invalidateQueries({ queryKey: ['booking-engine-list', actingOrgId] })
      qc.invalidateQueries({ queryKey: ['booking-engine-detail', selected] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!actingOrgId) {
    return (
      <NovaShell title="Zenix Booking">
        <EmptyState icon={Globe} title="Elige un cliente" description="Selecciona un cliente en /nova/clientes para gestionar su motor de reservas directas." />
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Zenix Booking">
      <div className="mx-auto max-w-4xl space-y-6">
        <Callout>
          Motor de reservas directas <strong>opcional</strong> (se cobra aparte). Actívalo por
          property; el website del hotel consume la API con la key. Pago en recepción en Fase 1.
        </Callout>

        {/* Lista de properties con toggle */}
        <Surface>
          <div className="p-5">
            <Headline>Properties</Headline>
            {list.isLoading && <Body>Cargando…</Body>}
            {list.data && list.data.length === 0 && <Body>Sin properties.</Body>}
            <div className="mt-3 divide-y divide-slate-100">
              {list.data?.map((p) => (
                <div key={p.propertyId} className="flex items-center justify-between py-3">
                  <button className="text-left" onClick={() => setSelected(p.propertyId === selected ? null : p.propertyId)}>
                    <Title>{p.propertyName}</Title>
                    <Caption>
                      {p.city ?? '—'} · {p.enabled ? `book.zenix.com/${p.slug}` : 'motor apagado'}
                    </Caption>
                  </button>
                  <div className="flex items-center gap-2">
                    <Chip variant={p.enabled ? 'success' : 'neutral'} intent={p.enabled ? 'solid' : 'outline'}>
                      {p.enabled ? 'Activo' : 'Inactivo'}
                    </Chip>
                    <Button
                      variant={p.enabled ? 'secondary' : 'primary'}
                      onClick={() => toggle.mutate({ propertyId: p.propertyId, enabled: !p.enabled })}
                      disabled={toggle.isPending}
                    >
                      <Power className="h-4 w-4" />
                      {p.enabled ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Surface>

        {selected && <PropertyDetail propertyId={selected} />}
      </div>
    </NovaShell>
  )
}

function PropertyDetail({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient()
  const actingOrgId = useNovaStore((s) => s.actingOrgId)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')

  const detail = useQuery({
    queryKey: ['booking-engine-detail', propertyId],
    queryFn: () => bookingEngineClient.get(propertyId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['booking-engine-detail', propertyId] })
    qc.invalidateQueries({ queryKey: ['booking-engine-list', actingOrgId] })
  }

  const genKey = useMutation({
    mutationFn: () => bookingEngineClient.generateApiKey(propertyId, { label: 'Sitio web del hotel', environment: 'live' }),
    onSuccess: (d) => { setNewKey(d.plaintextKey); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })
  const revokeKey = useMutation({
    mutationFn: (keyId: string) => bookingEngineClient.revokeApiKey(propertyId, keyId),
    onSuccess: () => { toast.success('Llave revocada'); invalidate() },
  })
  const createHook = useMutation({
    mutationFn: () => bookingEngineClient.createWebhook(propertyId, { url: webhookUrl, events: ['reservation.created', 'availability.changed'] }),
    onSuccess: (d) => { setNewSecret(d.secret); setWebhookUrl(''); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!detail.data) return <Surface><div className="p-5"><Body>Cargando detalle…</Body></div></Surface>
  const d = detail.data
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado') }

  if (!d.configured) {
    return <Surface><div className="p-5"><Body>Motor no configurado. Actívalo arriba para empezar.</Body></div></Surface>
  }

  return (
    <>
      {/* URL pública + política */}
      <Surface>
        <div className="p-5">
          <Headline>{d.propertyName}</Headline>
          <div className="mt-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-600" />
            <a href={d.config!.publicUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
              {d.config!.publicUrl}
            </a>
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <Caption>Política de pago: {d.config!.paymentPolicy} · Moneda: {d.config!.displayCurrency ?? '—'}</Caption>
        </div>
      </Surface>

      {/* API keys */}
      <Surface>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <Headline><KeyRound className="mr-2 inline h-4 w-4" />API keys</Headline>
            <Button variant="primary" onClick={() => genKey.mutate()} disabled={genKey.isPending}>
              <Plus className="h-4 w-4" />Generar llave
            </Button>
          </div>
          {newKey && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Body><strong>Copia esta llave ahora — no se vuelve a mostrar:</strong></Body>
              <div className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-slate-900 px-2 py-1 text-xs text-emerald-300">{newKey}</code>
                <Button variant="secondary" onClick={() => copy(newKey)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          <div className="mt-3 divide-y divide-slate-100">
            {d.apiKeys.length === 0 && <Caption>Sin llaves todavía.</Caption>}
            {d.apiKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-2">
                <div>
                  <Body>{k.label} <Chip variant="neutral" intent="outline">{k.environment}</Chip></Body>
                  <Caption>{k.keyPrefix} · {k.allowedOrigins.join(', ') || 'sin restricción de origen'}</Caption>
                </div>
                <Button variant="destructive" onClick={() => revokeKey.mutate(k.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
      </Surface>

      {/* Webhooks */}
      <Surface>
        <div className="p-5">
          <Headline><Webhook className="mr-2 inline h-4 w-4" />Webhooks</Headline>
          <div className="mt-2 flex gap-2">
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://tusitio.com/zenix-hook"
              className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <Button variant="primary" onClick={() => createHook.mutate()} disabled={!webhookUrl || createHook.isPending}>
              <Plus className="h-4 w-4" />Suscribir
            </Button>
          </div>
          {newSecret && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Body><strong>Secret del webhook (cópialo, no se vuelve a mostrar):</strong></Body>
              <div className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-slate-900 px-2 py-1 text-xs text-emerald-300">{newSecret}</code>
                <Button variant="secondary" onClick={() => copy(newSecret)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          <div className="mt-3 divide-y divide-slate-100">
            {d.webhooks.length === 0 && <Caption>Sin webhooks todavía.</Caption>}
            {d.webhooks.map((w) => (
              <div key={w.id} className="py-2">
                <Body>{w.url}</Body>
                <Caption>{w.events.join(', ')} · {w.active ? 'activo' : 'inactivo'} · fallos: {w.failureCount}</Caption>
              </div>
            ))}
          </div>
        </div>
      </Surface>
    </>
  )
}
