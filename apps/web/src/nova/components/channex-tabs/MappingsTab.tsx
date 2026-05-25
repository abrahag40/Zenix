/**
 * MappingsTab — wizard mapeo Zenix Room ↔ Channex Room Type + health check.
 *
 * Backend Day 7 endpoints:
 *   GET   /mappings/proposal — sugiere mappings con similarity scoring
 *   PATCH /mappings/rooms   — bulk update (con confirmation backend)
 *   GET   /mappings/health  — health check (5 finding codes)
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable, AlertCircle, CheckCircle2, AlertTriangle, Info, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  Surface,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Subhead,
  Chip,
  Button,
  EmptyState,
  Skeleton,
  Code,
} from '../../design-system'
import { listMappingsProposal, bulkUpdateMappings, getMappingsHealth } from '../../../api/nova'

interface MappingProposal {
  roomId: string
  roomNumber: string
  roomCategory: string
  roomCapacity: number
  suggestedChannexRoomTypeId: string | null
  suggestedChannexRoomTypeTitle: string | null
  similarityScore: number
  reason: string
}

interface HealthFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO'
  code: string
  message: string
  details: Record<string, unknown>
}

interface HealthResult {
  propertyId: string
  passedErrors: boolean
  errorCount: number
  warningCount: number
  infoCount: number
  findings: HealthFinding[]
}

export function MappingsTab({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient()
  const [overrides, setOverrides] = useState<Record<string, string | null>>({})

  const { data: proposal = [], isLoading: loadingProp } = useQuery<MappingProposal[]>({
    queryKey: ['nova', 'channex', 'mappings', 'proposal', propertyId],
    queryFn: () => listMappingsProposal(propertyId),
  })

  const { data: health, isLoading: loadingHealth } = useQuery<HealthResult>({
    queryKey: ['nova', 'channex', 'mappings', 'health', propertyId],
    queryFn: () => getMappingsHealth(propertyId),
  })

  const bulkMut = useMutation({
    mutationFn: () => {
      const mappings = Object.entries(overrides).map(([roomId, channexRoomTypeId]) => ({
        roomId,
        channexRoomTypeId,
      }))
      return bulkUpdateMappings(propertyId, mappings, 'wizard mappings confirm')
    },
    onSuccess: (result) => {
      toast.success(`${result.updated} mappings actualizados`)
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'mappings', propertyId] })
      setOverrides({})
    },
    onError: (err: Error) => toast.error(err.message ?? 'Error'),
  })

  if (loadingProp && loadingHealth) {
    return (
      <Surface variant="raised" radius="lg" padding="md">
        <Skeleton height="240px" />
      </Surface>
    )
  }

  return (
    <div className="space-y-4">
      {/* Health check */}
      {health && <HealthSummary health={health} />}

      {/* Proposal table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <Title>Sugerencias de mapeo</Title>
            <Caption tone="tertiary">
              Similarity scoring Jaccard + capacity boost. Acepta o sobrescribe per row.
            </Caption>
          </div>
          {Object.keys(overrides).length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => bulkMut.mutate()}
              isLoading={bulkMut.isPending}
            >
              Aplicar {Object.keys(overrides).length} cambios
            </Button>
          )}
        </div>

        {proposal.length === 0 ? (
          <Surface variant="raised" radius="lg">
            <EmptyState
              variant="default"
              icon={Cable}
              title="Sin sugerencias"
              description="Property sin rooms o sin Channex room types creados aún."
            />
          </Surface>
        ) : (
          <Surface variant="raised" radius="lg" className="overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-slate-200/70 text-left">
                <tr>
                  <Th>Room Zenix</Th>
                  <Th>Capacidad</Th>
                  <Th></Th>
                  <Th>Sugerencia Channex</Th>
                  <Th>Score</Th>
                </tr>
              </thead>
              <tbody>
                {proposal.map((p) => (
                  <ProposalRow
                    key={p.roomId}
                    proposal={p}
                    override={overrides[p.roomId]}
                    onAccept={() =>
                      setOverrides((prev) => ({
                        ...prev,
                        [p.roomId]: p.suggestedChannexRoomTypeId,
                      }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </Surface>
        )}
      </section>
    </div>
  )
}

// ─── Health Summary ───────────────────────────────────────────────────

function HealthSummary({ health }: { health: HealthResult }) {
  const passed = health.passedErrors
  const Icon = passed ? CheckCircle2 : AlertCircle
  const tone = passed ? 'success' : 'danger'

  return (
    <Surface variant="raised" radius="lg" tone={tone} padding="md">
      <div className="flex items-start gap-3">
        <div
          className={
            'flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ' +
            (passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Title>
              {passed ? 'Mapeo saludable' : 'Mapeo con errores'}
            </Title>
            <Chip
              variant={passed ? 'success' : 'danger'}
              intent="tonal"
              size="md"
            >
              {health.errorCount} errores · {health.warningCount} warnings
            </Chip>
          </div>
          <Body className="mt-1" tone="secondary">
            {passed
              ? 'No hay errores bloqueantes. Algunos warnings opcionales — revisar para optimizar.'
              : 'Hay errores que impedirán al cliente activar Channex correctamente. Resolver antes de continuar.'}
          </Body>

          {health.findings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {health.findings.slice(0, 5).map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
              {health.findings.length > 5 && (
                <Caption tone="tertiary">
                  …y {health.findings.length - 5} findings más
                </Caption>
              )}
            </div>
          )}
        </div>
      </div>
    </Surface>
  )
}

function FindingRow({ finding }: { finding: HealthFinding }) {
  const Icon =
    finding.severity === 'ERROR'
      ? AlertCircle
      : finding.severity === 'WARNING'
        ? AlertTriangle
        : Info
  const iconCls =
    finding.severity === 'ERROR'
      ? 'text-red-600'
      : finding.severity === 'WARNING'
        ? 'text-amber-600'
        : 'text-sky-600'
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Icon className={'h-3.5 w-3.5 mt-0.5 flex-shrink-0 ' + iconCls} />
      <div className="flex-1 min-w-0">
        <Code variant="inline" className="text-[10px]">
          {finding.code}
        </Code>
        <span className="ml-1.5 text-slate-700">{finding.message}</span>
      </div>
    </div>
  )
}

// ─── Proposal Row ─────────────────────────────────────────────────────

function ProposalRow({
  proposal,
  override,
  onAccept,
}: {
  proposal: MappingProposal
  override: string | null | undefined
  onAccept: () => void
}) {
  const score = proposal.similarityScore
  const scoreColor =
    score >= 0.7
      ? 'success'
      : score >= 0.4
        ? 'warning'
        : 'danger'

  const hasOverride = override !== undefined
  const finalMapping = hasOverride ? override : proposal.suggestedChannexRoomTypeId

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-3 py-2.5 align-top">
        <Subhead tone="primary">{proposal.roomNumber}</Subhead>
        <Caption tone="tertiary" className="block">
          {proposal.roomCategory}
        </Caption>
      </td>
      <td className="px-3 py-2.5 align-top tabular-nums text-slate-700">
        {proposal.roomCapacity}
      </td>
      <td className="px-3 py-2.5 align-top">
        <ArrowRight className="h-3 w-3 text-slate-300" />
      </td>
      <td className="px-3 py-2.5 align-top">
        {proposal.suggestedChannexRoomTypeTitle ? (
          <>
            <Subhead tone="primary">{proposal.suggestedChannexRoomTypeTitle}</Subhead>
            <Caption tone="tertiary" className="block max-w-[260px] truncate">
              {proposal.reason}
            </Caption>
          </>
        ) : (
          <Caption tone="quaternary">Sin sugerencia (score muy bajo)</Caption>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex items-center gap-1.5">
          <Chip variant={scoreColor as any} intent="subtle" size="sm">
            {(score * 100).toFixed(0)}%
          </Chip>
          {!hasOverride && proposal.suggestedChannexRoomTypeId && (
            <Button variant="ghost" size="xs" onClick={onAccept}>
              Aceptar
            </Button>
          )}
          {hasOverride && (
            <Chip variant="success" intent="subtle" size="sm">
              ✓ Aceptada
            </Chip>
          )}
        </div>
      </td>
    </tr>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-slate-500">
      {children}
    </th>
  )
}
