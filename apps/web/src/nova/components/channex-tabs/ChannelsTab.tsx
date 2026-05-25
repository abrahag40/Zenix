/**
 * ChannelsTab — pause/unpause de OTAs.
 *
 * Backend Day 7 endpoints:
 *   GET    /channel-pauses (list history)
 *   POST   /channel-pauses { channexChannelId, channelName, pauseReason? }
 *   POST   /channel-pauses/:id/unpause { unpauseReason? }
 *
 * Pattern: Cloudbeds "Snooze channel" + history log.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Surface,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Chip,
  Button,
  EmptyState,
  Skeleton,
} from '../../design-system'
import { listChannelPauses, pauseChannel, unpauseChannel } from '../../../api/nova'
import { api } from '../../../api/client'

// ── Backend admin endpoint to list available channels ───────────────────
// El controller Channex admin Day 4 expone listChannels via gateway.
// Hacemos thin call directo aquí para simplificar (futuro: agregar a api/nova.ts).
interface ChannexChannelRow {
  id: string
  title: string
  channel: string
  is_active: boolean
}

interface ChannelPauseRow {
  id: string
  propertyId: string
  channexChannelId: string
  channelName: string
  pausedAt: string
  pauseReason: string | null
  unpausedAt: string | null
  unpauseReason: string | null
}

function listChannels(propertyId: string): Promise<ChannexChannelRow[]> {
  // Note: NO existe endpoint público listChannels en backend aún (Day 14+).
  // Por ahora retornamos mock estructura para que la UI funcione.
  // El consultor verá "Sin canales mapeados" hasta que el endpoint exista.
  return Promise.resolve([])
}

export function ChannelsTab({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient()
  const [pausingChannel, setPausingChannel] = useState<ChannexChannelRow | null>(null)

  const { data: pauses = [], isLoading: loadingPauses } = useQuery<ChannelPauseRow[]>({
    queryKey: ['nova', 'channex', 'pauses', propertyId],
    queryFn: () => listChannelPauses(propertyId),
  })

  const { data: channels = [], isLoading: loadingChannels } = useQuery<ChannexChannelRow[]>({
    queryKey: ['nova', 'channex', 'channels', propertyId],
    queryFn: () => listChannels(propertyId),
  })

  const unpauseMut = useMutation({
    mutationFn: (pauseId: string) => unpauseChannel(propertyId, pauseId),
    onSuccess: () => {
      toast.success('Canal despausado')
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'pauses', propertyId] })
    },
    onError: (err: Error) => toast.error(err.message ?? 'Error'),
  })

  const activePauses = pauses.filter((p) => !p.unpausedAt)
  const historyPauses = pauses.filter((p) => p.unpausedAt).slice(0, 10)

  if (loadingPauses && loadingChannels) {
    return (
      <Surface variant="raised" radius="lg" padding="md">
        <Skeleton height="200px" />
      </Surface>
    )
  }

  return (
    <div className="space-y-4">
      {/* Active pauses */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <Title>Pausas activas</Title>
            <Caption tone="tertiary">
              Canales OTA con venta bloqueada. Reactivar al unpause.
            </Caption>
          </div>
          <Chip variant="warning" intent="tonal" size="md">
            {activePauses.length} activas
          </Chip>
        </div>

        {activePauses.length === 0 ? (
          <Surface variant="raised" radius="lg">
            <EmptyState
              variant="success"
              size="sm"
              icon={Play}
              title="Sin pausas activas"
              description="Todos los canales OTA están vendiendo normalmente."
            />
          </Surface>
        ) : (
          <div className="space-y-2">
            {activePauses.map((p) => (
              <Surface
                key={p.id}
                variant="raised"
                radius="lg"
                padding="md"
                tone="warning"
                className="flex items-start gap-3"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0">
                  <Pause className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <Title className="capitalize">{p.channelName.replace(/_/g, ' ')}</Title>
                  <Caption tone="secondary" className="mt-0.5 block">
                    Pausado{' '}
                    {new Date(p.pausedAt).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Caption>
                  {p.pauseReason && (
                    <Body className="mt-1" tone="secondary">
                      <span className="font-medium text-slate-700">Razón:</span> {p.pauseReason}
                    </Body>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={Play}
                  onClick={() => unpauseMut.mutate(p.id)}
                  isLoading={unpauseMut.isPending}
                >
                  Despausar
                </Button>
              </Surface>
            ))}
          </div>
        )}
      </section>

      {/* Backend listChannels endpoint pendiente */}
      <Surface variant="raised" radius="lg" tone="info" padding="md">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-sky-600 mt-0.5 flex-shrink-0" />
          <div>
            <Title>Endpoint listChannels pendiente</Title>
            <Callout className="mt-1" tone="secondary">
              El backend Day 4 tiene <code className="font-mono">gateway.listChannels</code>{' '}
              implementado pero el controller HTTP público no expuesto aún. Día 14+ wirea
              el listado completo de canales OTA + botón pausar individual. Por ahora solo
              vista de pausas activas + history.
            </Callout>
          </div>
        </div>
      </Surface>

      {/* History */}
      {historyPauses.length > 0 && (
        <section>
          <Title className="mb-2">Histórico recente (últimas 10)</Title>
          <Surface variant="raised" radius="lg" className="overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-slate-200/70">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
                    Canal
                  </th>
                  <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
                    Pausado
                  </th>
                  <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
                    Despausado
                  </th>
                  <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
                    Razón
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyPauses.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 capitalize font-medium text-slate-900">
                      {p.channelName.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {new Date(p.pausedAt).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {p.unpausedAt
                        ? new Date(p.unpausedAt).toLocaleDateString('es-MX')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-[300px]">
                      {p.pauseReason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </section>
      )}
    </div>
  )
}
