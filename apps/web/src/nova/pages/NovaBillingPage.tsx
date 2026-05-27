/**
 * NovaBillingPage — landing del módulo Billing.
 *
 * Sprint BILLING-DISCOUNT-CODES Day 2.
 *
 * Routing:
 *   /nova/billing                 — este componente (landing/dashboard)
 *   /nova/billing/codigos         — Day 3 (CRUD de códigos de descuento)
 *   /nova/billing/aprobaciones    — futuro (queue de approvals)
 *   /nova/billing/pricing         — futuro (PLATFORM only)
 *
 * Hoy Day 2 muestra:
 *   · 4 StatTiles placeholder (MRR/ARR/Churn/Mora) — datos reales Day 9
 *   · Sub-nav a Códigos / Aprobaciones / Pricing
 *   · Empty state explaining what this section does
 *
 * Day 9 BILLING-CORE conectará las métricas reales via
 *   GET /v1/nova/billing/metrics (no implementado todavía).
 */
import { Link } from 'react-router-dom'
import {
  CreditCard,
  Tag,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NovaShell } from '../NovaShell'
import {
  Surface,
  Section,
  Headline,
  Title,
  Body,
  Callout,
  Caption,
  Eyebrow,
  Chip,
} from '../design-system'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Sub-nav items (Billing internal navigation)
// ─────────────────────────────────────────────────────────────────────

const BILLING_SECTIONS: Array<{
  label: string
  description: string
  to: string
  icon: LucideIcon
  status: 'available' | 'soon'
  accent: 'violet' | 'emerald' | 'amber' | 'slate'
}> = [
  {
    label: 'Códigos de descuento',
    description:
      'Crea y administra códigos pre-configurados que aplicarás durante el wizard. El cliente no ve el % cap, solo el código aplicado.',
    to: '/nova/billing/codigos',
    icon: Tag,
    status: 'available',
    accent: 'violet',
  },
  {
    label: 'Aprobaciones pendientes',
    description:
      'Cuando un consultor crea un descuento que excede su cap, queda pendiente de aprobación de un PARTNER_ADMIN.',
    to: '/nova/billing/aprobaciones',
    icon: ShieldCheck,
    status: 'soon',
    accent: 'amber',
  },
  {
    label: 'Configuración de precios',
    description:
      'Solo PLATFORM Admin: ajustar precios MXN/USD, descuento anual, partner tier caps.',
    to: '/nova/billing/pricing',
    icon: DollarSign,
    status: 'soon',
    accent: 'slate',
  },
]

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export function NovaBillingPage() {
  return (
    <NovaShell title="Billing">
      <div className="space-y-6">
        {/* ── Hero / header ────────────────────────────────────────── */}
        <div>
          <Eyebrow tone="tertiary" className="text-violet-700">
            Nova → Billing
          </Eyebrow>
          <Headline as="h1" className="mt-1">
            Gestión de cobros y suscripciones
          </Headline>
          <Body tone="secondary" className="mt-1.5 max-w-2xl">
            Administra las suscripciones Stripe de tus clientes, configura códigos de descuento
            negociables y revisa el revenue del partner.
          </Body>
        </div>

        {/* ── 4 StatTiles (placeholder Day 2 — datos reales Day 9) ── */}
        <Section title="Métricas del partner">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTilePlaceholder
              label="MRR"
              tooltip="Monthly Recurring Revenue de tus clientes activos"
              icon={TrendingUp}
              accent="emerald"
            />
            <StatTilePlaceholder
              label="ARR"
              tooltip="Annual Recurring Revenue proyectado (MRR × 12)"
              icon={DollarSign}
              accent="violet"
            />
            <StatTilePlaceholder
              label="Churn 90d"
              tooltip="Clientes cancelados en los últimos 90 días / clientes activos hace 90d"
              icon={TrendingDown}
              accent="amber"
            />
            <StatTilePlaceholder
              label="Clientes en mora"
              tooltip="Subscriptions con status past_due o unpaid"
              icon={AlertCircle}
              accent="slate"
            />
          </div>
          <Caption tone="tertiary" className="block mt-3 italic">
            Datos en tiempo real desde Stripe — disponibles en Day 9 del sprint BILLING-CORE
            (próxima iteración).
          </Caption>
        </Section>

        {/* ── Sub-secciones de Billing ─────────────────────────────── */}
        <Section title="Secciones">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {BILLING_SECTIONS.map((sec) => (
              <BillingSectionCard key={sec.to} section={sec} />
            ))}
          </div>
        </Section>

        {/* ── Footnote ─────────────────────────────────────────────── */}
        <Surface variant="raised" radius="md" padding="md" tone="info">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex-shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <Title>¿Buscas administrar un cliente específico?</Title>
              <Callout tone="tertiary" className="mt-1">
                Las acciones sobre subscriptions concretas (cambiar plan, pausar, cancelar,
                aplicar descuentos) viven en{' '}
                <Link to="/nova/clientes" className="font-medium text-violet-700 hover:underline">
                  Nova → Clientes
                </Link>
                . Entra al detalle del cliente y abre el tab "Billing".
              </Callout>
            </div>
          </div>
        </Surface>
      </div>
    </NovaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function StatTilePlaceholder({
  label,
  tooltip,
  icon: Icon,
  accent,
}: {
  label: string
  tooltip: string
  icon: LucideIcon
  accent: 'emerald' | 'violet' | 'amber' | 'slate'
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
  }[accent]

  return (
    <Surface variant="raised" radius="lg" padding="md">
      <div className="flex items-start justify-between gap-3 mb-3">
        <Eyebrow tone="tertiary">{label}</Eyebrow>
        <div
          className={cn('flex items-center justify-center w-7 h-7 rounded-md', colors.bg, colors.text)}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-[24px] font-bold text-slate-300 tracking-tight leading-none tabular-nums">
        —
      </div>
      <Caption tone="tertiary" className="block mt-1.5">
        Pendiente conexión Stripe metrics
      </Caption>
    </Surface>
  )
}

function BillingSectionCard({
  section,
}: {
  section: {
    label: string
    description: string
    to: string
    icon: LucideIcon
    status: 'available' | 'soon'
    accent: 'violet' | 'emerald' | 'amber' | 'slate'
  }
}) {
  const colors = {
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', hoverRing: 'hover:ring-violet-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hoverRing: 'hover:ring-emerald-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', hoverRing: 'hover:ring-amber-200' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', hoverRing: 'hover:ring-slate-200' },
  }[section.accent]
  const Icon = section.icon
  const isSoon = section.status === 'soon'

  const inner = (
    <Surface
      variant="raised"
      radius="lg"
      padding="lg"
      className={cn(
        'h-full flex flex-col transition-all duration-150',
        isSoon ? 'opacity-60' : `cursor-pointer hover:ring-2 ${colors.hoverRing}`,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0',
            colors.bg,
            colors.text,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {isSoon && (
          <Chip variant="neutral" intent="subtle" size="sm">
            Próximamente
          </Chip>
        )}
      </div>
      <Title className="mb-1.5">{section.label}</Title>
      <Callout tone="secondary" className="flex-1">
        {section.description}
      </Callout>
      {!isSoon && (
        <div className={cn('mt-3 flex items-center gap-1 text-[13px] font-medium', colors.text)}>
          Abrir
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      )}
    </Surface>
  )

  if (isSoon) return inner
  return <Link to={section.to}>{inner}</Link>
}
