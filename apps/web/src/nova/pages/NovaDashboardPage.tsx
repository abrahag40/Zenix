/**
 * NovaDashboardPage — landing post-tenant-selection.
 *
 * Refactor 2026-05-25 (design system Nova): toda la página usa primitives
 * del DS (Surface, Headline, Body, StatTile, Button, Chip, EmptyState).
 * Cero inline `text-[13px]` / `bg-white p-4` ad-hoc.
 *
 * Tipografía Apple HIG hierarchy:
 *   - DisplayLarge: org name del cliente activo (hero)
 *   - Eyebrow: "CLIENTE ACTIVO" antes del nombre
 *   - Headline: section titles
 *   - Body: descriptions
 *   - Caption: meta info, hints
 */
import { Link } from 'react-router-dom'
import {
  Building2,
  Cable,
  Sparkles,
  ScrollText,
  ArrowRight,
  ExternalLink,
  Hotel,
  TrendingUp,
  Users,
  Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NovaShell } from '../NovaShell'
import { useNovaStore } from '../../store/nova'
import { listPropertiesOfActingOrg, type PropertyRow } from '../../api/nova'
import {
  Surface,
  Section,
  DisplayLarge,
  Headline,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Code,
  StatTile,
  Button,
  Chip,
  EmptyState,
  type StatAccent,
} from '../design-system'

export function NovaDashboardPage() {
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const actingOrgId = useNovaStore((s) => s.actingOrgId)

  const { data: properties = [] } = useQuery<PropertyRow[]>({
    queryKey: ['nova', 'properties', actingOrgId],
    queryFn: listPropertiesOfActingOrg,
    enabled: !!actingOrgId,
    staleTime: 60_000,
  })

  if (!actingOrgId) {
    return (
      <NovaShell title="Dashboard">
        <Surface variant="raised" radius="xl" className="max-w-md mx-auto">
          <EmptyState
            icon={Building2}
            title="Sin cliente seleccionado"
            description="Para empezar a operar, elige un cliente desde el listado."
            action={
              <Link to="/nova/clientes">
                <Button iconLeft={Building2}>Elegir cliente</Button>
              </Link>
            }
          />
        </Surface>
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Dashboard">
      <div className="space-y-7 max-w-6xl">
        <WelcomeHero orgName={actingOrgName ?? 'Cliente'} propertyCount={properties.length} />

        <Section title="Resumen del cliente" subtitle="Datos generales · actualizado en vivo">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              icon={Hotel}
              accent="emerald"
              label="Properties"
              value={properties.length}
              hint={properties.length === 0 ? 'Configurar en wizard' : 'Operativas'}
            />
            <StatTile
              icon={Users}
              accent="sky"
              label="Staff activo"
              value="—"
              hint="Datos en Day 12+"
            />
            <StatTile
              icon={Layers}
              accent="violet"
              label="Integraciones"
              value="1"
              hint="Channex configurado"
            />
            <StatTile
              icon={TrendingUp}
              accent="indigo"
              label="Reservas 24h"
              value="—"
              hint="Datos en Day 12+"
            />
          </div>
        </Section>

        <Section title="Áreas de trabajo" subtitle="Acceso rápido a los módulos del consultor">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLinkCard
              to="/nova/channex"
              icon={Cable}
              accent="emerald"
              title="Channex Command"
              desc="Room types, rate plans, calendar matrix, restrictions, channels."
              status="LIVE"
            />
            <QuickLinkCard
              to="/nova/wizard"
              icon={Sparkles}
              accent="violet"
              title="Wizard Activate"
              desc="8 pasos para activar un cliente nuevo desde cero."
              status="DAY 14-15"
            />
            <QuickLinkCard
              to="/nova/audit"
              icon={ScrollText}
              accent="indigo"
              title="Audit log"
              desc="Historial inmutable de acciones. Filtrable por actor y acción."
              status="DAY 13"
            />
          </div>
        </Section>

        <ImpersonationLink />
      </div>
    </NovaShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Welcome hero
// ═══════════════════════════════════════════════════════════════════════════

function WelcomeHero({ orgName, propertyCount }: { orgName: string; propertyCount: number }) {
  return (
    <Surface variant="raised" radius="xl" className="relative overflow-hidden">
      {/* Gradient mesh background — Apple-style depth */}
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(16,185,129,0.12) 0%, transparent 55%),' +
            'radial-gradient(circle at 100% 100%, rgba(99,102,241,0.07) 0%, transparent 50%)',
        }}
        aria-hidden
      />
      <div className="relative p-6 lg:p-7">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow tone="tertiary" className="text-emerald-700">Cliente activo</Eyebrow>
              <Chip variant="success" intent="subtle" size="sm" pulse>LIVE</Chip>
            </div>
            <DisplayLarge className="mt-1">{orgName}</DisplayLarge>
            <Body className="mt-2 max-w-2xl leading-relaxed">
              Operando con tu identidad real (auditoría preservada). Para acciones{' '}
              <span className="font-medium text-slate-900">en nombre del cliente</span>, activa
              impersonation desde el flow correspondiente — el banner ámbar aparecerá persistente
              en toda tu sesión.
            </Body>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip variant="neutral" intent="subtle" size="md">
                {propertyCount} {propertyCount === 1 ? 'property' : 'properties'}
              </Chip>
              <Chip variant="success" intent="subtle" size="md">
                PMS conectado
              </Chip>
            </div>
          </div>
        </div>
      </div>
    </Surface>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// QuickLinkCard — hover lift + accent bar
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_BAR: Record<StatAccent, string> = {
  emerald: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  sky: 'bg-gradient-to-b from-sky-400 to-sky-600',
  violet: 'bg-gradient-to-b from-violet-400 to-violet-600',
  indigo: 'bg-gradient-to-b from-indigo-400 to-indigo-600',
  amber: 'bg-gradient-to-b from-amber-400 to-amber-600',
  red: 'bg-gradient-to-b from-red-400 to-red-600',
}

const ACCENT_ICON_BG: Record<StatAccent, string> = {
  emerald: 'bg-emerald-100/80 text-emerald-700',
  sky: 'bg-sky-100/80 text-sky-700',
  violet: 'bg-violet-100/80 text-violet-700',
  indigo: 'bg-indigo-100/80 text-indigo-700',
  amber: 'bg-amber-100/80 text-amber-700',
  red: 'bg-red-100/80 text-red-700',
}

interface QuickLinkCardProps {
  to: string
  icon: LucideIcon
  accent: StatAccent
  title: string
  desc: string
  status?: string
}

function QuickLinkCard({ to, icon: Icon, accent, title, desc, status }: QuickLinkCardProps) {
  return (
    <Link to={to} className="block group">
      <Surface variant="raised" radius="lg" hoverable padding="md" className="relative overflow-hidden h-full">
        {/* Accent bar lateral izquierdo on hover */}
        <div
          className={
            'absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity ' +
            ACCENT_BAR[accent]
          }
          aria-hidden
        />
        <div className="flex items-start gap-3">
          <div
            className={
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ' +
              ACCENT_ICON_BG[accent]
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Title className="truncate group-hover:text-slate-950 transition-colors">{title}</Title>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
            <Callout className="mt-1 line-clamp-2" tone="secondary">
              {desc}
            </Callout>
            {status && (
              <div className="mt-2">
                <Chip
                  variant={status === 'LIVE' ? 'success' : 'progress'}
                  intent="subtle"
                  size="sm"
                  pulse={status === 'LIVE'}
                >
                  {status}
                </Chip>
              </div>
            )}
          </div>
        </div>
      </Surface>
    </Link>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Impersonation cross-link banner
// ═══════════════════════════════════════════════════════════════════════════

function ImpersonationLink() {
  return (
    <Surface variant="raised" radius="lg" className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600" aria-hidden />
      <div className="relative p-4 pl-5 flex items-start gap-3">
        <ExternalLink className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Title>
              Vista cliente — PMS en <Code>app.zenix.com</Code>
            </Title>
            <Chip variant="progress" intent="subtle" size="sm">
              DAY 14+
            </Chip>
          </div>
          <Body className="mt-1 leading-relaxed" tone="secondary">
            Para ver lo mismo que ve el recepcionista del hotel (calendar, check-in, housekeeping),
            usa el flow de impersonation. Generará token short-lived + banner ámbar persistente
            sticky top mientras operes en nombre del cliente.
          </Body>
        </div>
      </div>
    </Surface>
  )
}
