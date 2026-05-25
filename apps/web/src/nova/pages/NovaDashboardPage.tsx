/**
 * NovaDashboardPage — landing post-tenant-selection.
 *
 * Refactor 2026-05-25: nuevo lenguaje visual moderno con:
 *   - Welcome card con gradient mesh sutil (Apple HIG depth, no flat)
 *   - Metric tiles tipográficamente jerárquicos (TIME journal headline scale)
 *   - QuickLink cards con hover lift + accent-bar lateral
 *   - Footer banner con info de impersonation cross-link
 *
 * Fundamentos:
 *   - Pousman & Stasko 2006 (Ambient Information Display) — info densa
 *     pero glanceable, no sobreestimulación.
 *   - Tufte 1990 (Envisioning Information) — alta data-ink ratio, removing
 *     chartjunk. Cada elemento tiene función.
 *   - Apple HIG 2024 Visual Design — depth via stacked shadows + tonal
 *     surfaces, NO flat brutalism.
 *   - Material Design 3 Tonal Palette — primary container vs primary,
 *     diferenciación de jerarquía sin saturación.
 *
 * Color psychology aplicada (vs versión anterior flat):
 *   - Hero card: gradient emerald-50 → mint subtle. Mehrabian-Russell:
 *     low Arousal + high Pleasure = sensación de control / bienestar.
 *   - Metric values: text-slate-900 sized large = autoridad visual sin
 *     gritar (Tufte "data prominence").
 *   - Accent: violet para "premium / upcoming" (Apple-style "new" tag).
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
import { Chip } from '../components/Chip'

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
        <EmptyOrgState />
      </NovaShell>
    )
  }

  return (
    <NovaShell title="Dashboard">
      <div className="space-y-6 max-w-6xl">
        {/* ── Welcome hero ─────────────────────────────────────────────── */}
        <WelcomeCard orgName={actingOrgName ?? 'Cliente'} propertyCount={properties.length} />

        {/* ── Metric tiles ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Resumen del cliente" subtitle="Datos generales · actualizado en vivo" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile
              icon={Hotel}
              accent="emerald"
              label="Properties"
              value={properties.length}
              hint={properties.length === 0 ? 'Configurar en wizard' : 'Operativas'}
            />
            <MetricTile
              icon={Users}
              accent="sky"
              label="Staff activo"
              value="—"
              hint="Datos en Day 12+"
            />
            <MetricTile
              icon={Layers}
              accent="violet"
              label="Integraciones"
              value="1"
              hint="Channex configurado"
            />
            <MetricTile
              icon={TrendingUp}
              accent="indigo"
              label="Reservas 24h"
              value="—"
              hint="Datos en Day 12+"
            />
          </div>
        </section>

        {/* ── Quick links to areas ─────────────────────────────────────── */}
        <section>
          <SectionHeader title="Áreas de trabajo" subtitle="Acceso rápido a los módulos del consultor" />
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
        </section>

        {/* ── Impersonation cross-link banner ──────────────────────────── */}
        <section>
          <ImpersonationBanner />
        </section>
      </div>
    </NovaShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Welcome hero card — gradient mesh + tonal depth
// ═══════════════════════════════════════════════════════════════════════════

function WelcomeCard({ orgName, propertyCount }: { orgName: string; propertyCount: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Gradient mesh background — Apple-style depth */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(16,185,129,0.10) 0%, transparent 50%),' +
            'radial-gradient(circle at 100% 100%, rgba(99,102,241,0.06) 0%, transparent 50%)',
        }}
        aria-hidden
      />
      <div className="relative p-6 lg:p-7">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">
              Cliente activo
              <Chip variant="success" intent="subtle" size="sm" pulse>
                LIVE
              </Chip>
            </div>
            <h2 className="mt-1 text-[22px] lg:text-[24px] font-semibold text-slate-900 tracking-tight leading-tight">
              {orgName}
            </h2>
            <p className="mt-2 text-[13px] text-slate-600 max-w-2xl leading-relaxed">
              Operando con tu identidad real (auditoría preservada).
              Para acciones <span className="font-medium text-slate-900">en nombre del cliente</span>,
              activa impersonation desde el flow correspondiente — el banner amber aparecerá
              persistente en toda tu sesión.
            </p>
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
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Section header — tipografía editorial
// ═══════════════════════════════════════════════════════════════════════════

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">{title}</h3>
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Metric tile — Tufte high data-ink ratio
// ═══════════════════════════════════════════════════════════════════════════

type Accent = 'emerald' | 'sky' | 'violet' | 'indigo' | 'amber' | 'red'

const ACCENT_TINT: Record<Accent, string> = {
  emerald: 'from-emerald-500/8 to-emerald-500/0 text-emerald-700 ring-emerald-100',
  sky: 'from-sky-500/8 to-sky-500/0 text-sky-700 ring-sky-100',
  violet: 'from-violet-500/8 to-violet-500/0 text-violet-700 ring-violet-100',
  indigo: 'from-indigo-500/8 to-indigo-500/0 text-indigo-700 ring-indigo-100',
  amber: 'from-amber-500/8 to-amber-500/0 text-amber-700 ring-amber-100',
  red: 'from-red-500/8 to-red-500/0 text-red-700 ring-red-100',
}

const ACCENT_ICON_BG: Record<Accent, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
}

interface MetricTileProps {
  icon: LucideIcon
  accent: Accent
  label: string
  value: string | number
  hint?: string
}

function MetricTile({ icon: Icon, accent, label, value, hint }: MetricTileProps) {
  return (
    <div
      className={
        'group relative overflow-hidden rounded-xl border border-slate-200 bg-white ' +
        'shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_20px_-4px_rgba(15,23,42,0.08)] ' +
        'transition-all duration-200'
      }
    >
      {/* Subtle accent gradient — Material 3 tonal surface */}
      <div
        className={'absolute inset-0 bg-gradient-to-br pointer-events-none ' + ACCENT_TINT[accent].split(' ').slice(0, 2).join(' ')}
        aria-hidden
      />
      <div className="relative p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div
            className={
              'inline-flex items-center justify-center w-8 h-8 rounded-lg ' + ACCENT_ICON_BG[accent]
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
        </div>
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {label}
          </div>
          <div className="mt-1 text-[24px] font-semibold text-slate-900 leading-none tabular-nums tracking-tight">
            {value}
          </div>
          {hint && <div className="mt-1 text-[10px] text-slate-500">{hint}</div>}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// QuickLink card — accent bar + hover lift
// ═══════════════════════════════════════════════════════════════════════════

interface QuickLinkCardProps {
  to: string
  icon: LucideIcon
  accent: Accent
  title: string
  desc: string
  status?: string
}

const ACCENT_BAR: Record<Accent, string> = {
  emerald: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  sky: 'bg-gradient-to-b from-sky-400 to-sky-600',
  violet: 'bg-gradient-to-b from-violet-400 to-violet-600',
  indigo: 'bg-gradient-to-b from-indigo-400 to-indigo-600',
  amber: 'bg-gradient-to-b from-amber-400 to-amber-600',
  red: 'bg-gradient-to-b from-red-400 to-red-600',
}

function QuickLinkCard({ to, icon: Icon, accent, title, desc, status }: QuickLinkCardProps) {
  return (
    <Link
      to={to}
      className={
        'group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 ' +
        'shadow-[0_1px_2px_rgba(15,23,42,0.03)] ' +
        'hover:shadow-[0_8px_24px_-6px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 hover:border-slate-300 ' +
        'transition-all duration-200'
      }
    >
      {/* Accent bar lateral izquierdo — appears on hover */}
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
            'w-10 h-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ' +
            ACCENT_ICON_BG[accent]
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-slate-950 transition-colors">
              {title}
            </h4>
            <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </div>
          <p className="mt-1 text-[12px] text-slate-600 line-clamp-2 leading-snug">{desc}</p>
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
    </Link>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Impersonation banner — informative cross-link
// ═══════════════════════════════════════════════════════════════════════════

function ImpersonationBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600" aria-hidden />
      <div className="relative p-4 pl-5 flex items-start gap-3">
        <ExternalLink className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[13px] font-semibold text-slate-900">
              Vista cliente — PMS en <span className="font-mono text-emerald-700">app.zenix.com</span>
            </h3>
            <Chip variant="progress" intent="subtle" size="sm">
              DAY 14+
            </Chip>
          </div>
          <p className="mt-1 text-[12px] text-slate-600 leading-relaxed">
            Para ver lo mismo que ve el recepcionista del hotel (calendar, check-in,
            housekeeping), usa el flow de impersonation. Generará token short-lived
            + banner amber persistente sticky top mientras operes en nombre del cliente.
          </p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Empty state — sin org seleccionada
// ═══════════════════════════════════════════════════════════════════════════

function EmptyOrgState() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-md mx-auto">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200">
        <Building2 className="h-5 w-5 text-slate-500" aria-hidden />
      </div>
      <h2 className="mt-3 text-[16px] font-semibold text-slate-900 tracking-tight">
        Sin cliente seleccionado
      </h2>
      <p className="mt-1 text-[13px] text-slate-600">Para empezar a operar, elige primero un cliente.</p>
      <Link
        to="/nova/clientes"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-[13px] font-medium transition-colors shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]"
      >
        <Building2 className="h-4 w-4" />
        Elegir cliente
      </Link>
    </div>
  )
}
