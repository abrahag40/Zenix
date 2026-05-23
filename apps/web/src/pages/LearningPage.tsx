/**
 * LearningPage.tsx — Sprint LEARNING-CORE Fase 1.1
 *
 * Dashboard learner principal — Continue + Due + Assigned + Recommended.
 * Pattern Docebo + NN/g (doc 05 §1).
 *
 * Tabs internos para no abusar de routes:
 *   - Mi aprendizaje (default) — el dashboard
 *   - Catálogo — exploración + fuzzy search
 *
 * Si el actor es SUPERVISOR, aparece tab adicional:
 *   - Mi equipo — manager dashboard scope-aware
 *
 * Si el DLC LEARNING_CORE NO está activo, esta página muestra un empty state
 * con CTA "Activar Zenix Learning" → /settings/dlc/LEARNING_CORE.
 * Detection: la primera query retorna 402 + ApiError.code = 'DLC_NOT_ACTIVATED'
 * o 'DLC_NOT_ACTIVE'.
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, GraduationCap, Search, Users } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '../store/auth'
import {
  useLearningCourses,
  useLearningDashboard,
  useManagerEnrollments,
} from '../modules/learning/hooks/useLearning'
import type { LearningEnrollmentSummary } from '../modules/learning/api/learning.api'

type Tab = 'mylearning' | 'catalog' | 'team'

export function LearningPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = useAuthStore((s) => s.user?.role)
  const isSupervisor = role === 'SUPERVISOR'

  const initialTab = (searchParams.get('tab') as Tab) ?? 'mylearning'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [search, setSearch] = useState('')

  const setTabAndUrl = (next: Tab) => {
    setTab(next)
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Aprendizaje</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cursos, certificaciones y compliance STPS.
          </p>
        </header>

        <nav className="mb-6 flex gap-1 border-b border-slate-200">
          <TabButton
            label="Mi aprendizaje"
            icon={<GraduationCap className="h-4 w-4" />}
            active={tab === 'mylearning'}
            onClick={() => setTabAndUrl('mylearning')}
          />
          <TabButton
            label="Catálogo"
            icon={<BookOpen className="h-4 w-4" />}
            active={tab === 'catalog'}
            onClick={() => setTabAndUrl('catalog')}
          />
          {isSupervisor && (
            <TabButton
              label="Mi equipo"
              icon={<Users className="h-4 w-4" />}
              active={tab === 'team'}
              onClick={() => setTabAndUrl('team')}
            />
          )}
        </nav>

        {tab === 'mylearning' && <MyLearningTab />}
        {tab === 'catalog' && (
          <CatalogTab search={search} onSearchChange={setSearch} />
        )}
        {tab === 'team' && isSupervisor && <ManagerTab />}
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function TabButton(props: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
        props.active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {props.icon}
      {props.label}
    </button>
  )
}

function MyLearningTab() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useLearningDashboard()

  if (isLoading) return <SkeletonGrid />
  if (error) return <DlcNotActiveBanner error={error as Error & { code?: string }} />
  if (!data) return null

  const hasAny =
    data.continueLearning ||
    data.dueSoon.length > 0 ||
    data.assigned.length > 0 ||
    data.recommended.length > 0

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <GraduationCap className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-3 text-base font-medium text-slate-900">
          Aún no tienes cursos asignados
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Explora el catálogo para encontrar capacitaciones relevantes a tu rol.
        </p>
        <Button
          className="mt-4"
          onClick={() => navigate('/learning?tab=catalog')}
        >
          Ver catálogo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Continue learning — hero strip */}
      {data.continueLearning && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-600">
            Continuar aprendiendo
          </h2>
          <EnrollmentHeroCard enrollment={data.continueLearning} />
        </section>
      )}

      {/* Due soon — compliance deadlines */}
      {data.dueSoon.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="destructive">{data.dueSoon.length} próximo a vencer</Badge>
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
              Compliance — vence pronto
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.dueSoon.map((e) => (
              <EnrollmentCard key={e.id} enrollment={e} variant="due" />
            ))}
          </div>
        </section>
      )}

      {/* Assigned — manager push */}
      {data.assigned.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-600">
            Asignados por tu supervisor
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.assigned.map((e) => (
              <EnrollmentCard key={e.id} enrollment={e} variant="assigned" />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CatalogTab(props: {
  search: string
  onSearchChange: (v: string) => void
}) {
  const navigate = useNavigate()
  const { data: courses, isLoading, error } = useLearningCourses({
    search: props.search.length >= 2 ? props.search : undefined,
  })

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar cursos…"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <SkeletonGrid />}
      {error && <DlcNotActiveBanner error={error as Error & { code?: string }} />}

      {courses && courses.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onClick={() => navigate(`/learning/courses/${c.slug}`)}
            />
          ))}
        </div>
      )}

      {courses && courses.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          No hay cursos que coincidan.
        </div>
      )}
    </div>
  )
}

function ManagerTab() {
  const { data, isLoading, error } = useManagerEnrollments({ overdue: false })

  if (isLoading) return <SkeletonGrid />
  if (error) return <DlcNotActiveBanner error={error as Error & { code?: string }} />
  if (!data) return null

  // Group by status
  const overdue = data.filter(
    (e) =>
      e.status !== 'COMPLETED' &&
      e.expiresAt &&
      new Date(e.expiresAt) < new Date(),
  )
  const inProgress = data.filter((e) => e.status === 'IN_PROGRESS')
  const completed = data.filter((e) => e.status === 'COMPLETED')

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Vencidos"
          value={overdue.length}
          tone="destructive"
        />
        <StatCard
          label="En progreso"
          value={inProgress.length}
          tone="default"
        />
        <StatCard
          label="Completados"
          value={completed.length}
          tone="success"
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-600">
          Quién se está atrasando
        </h2>
        {overdue.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Tu equipo está al día. Sin atrasos.
          </div>
        ) : (
          <div className="space-y-2">
            {overdue.map((e) => (
              <StaffOverdueRow key={e.id} enrollment={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── UI primitives ──────────────────────────────────────────────────────────

function EnrollmentHeroCard(props: { enrollment: LearningEnrollmentSummary }) {
  const navigate = useNavigate()
  const e = props.enrollment
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-medium text-slate-900">{e.course.title}</h3>
          </div>
          {e.course.estimatedHours && (
            <p className="mt-1 text-xs text-slate-500">
              ~{e.course.estimatedHours} hrs estimadas
            </p>
          )}
        </div>
        <Button
          onClick={() => navigate(`/learning/courses/${e.course.slug}`)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          Continuar
        </Button>
      </div>
    </div>
  )
}

function EnrollmentCard(props: {
  enrollment: LearningEnrollmentSummary
  variant: 'due' | 'assigned'
}) {
  const navigate = useNavigate()
  const e = props.enrollment
  const daysUntilDue = e.expiresAt
    ? Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  return (
    <button
      type="button"
      onClick={() => navigate(`/learning/courses/${e.course.slug}`)}
      className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm"
    >
      <h4 className="text-sm font-medium text-slate-900">{e.course.title}</h4>
      {props.variant === 'due' && daysUntilDue !== null && (
        <p className="mt-2 text-xs text-red-600">
          Vence en {daysUntilDue} día{daysUntilDue !== 1 ? 's' : ''}
        </p>
      )}
      {props.variant === 'assigned' && (
        <p className="mt-2 text-xs text-slate-500">
          {e.status === 'IN_PROGRESS' ? 'En progreso' : 'Sin abrir'}
        </p>
      )}
    </button>
  )
}

function CourseCard(props: {
  course: { id: string; slug: string; title: string; shortDescription: string; estimatedHours: string; tier: string; category: string }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline">{props.course.tier}</Badge>
        <span className="text-xs text-slate-500">{props.course.category}</span>
      </div>
      <h4 className="mt-2 text-sm font-medium text-slate-900">{props.course.title}</h4>
      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
        {props.course.shortDescription}
      </p>
      <p className="mt-2 text-xs text-slate-500">~{props.course.estimatedHours} hrs</p>
    </button>
  )
}

function StaffOverdueRow(props: { enrollment: LearningEnrollmentSummary }) {
  const e = props.enrollment
  const daysOverdue = e.expiresAt
    ? Math.floor((Date.now() - new Date(e.expiresAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Staff #{e.staffId.slice(0, 8)}</p>
        <p className="text-xs text-slate-500">{e.course.title}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-red-600">{daysOverdue}d vencido</p>
        <Button size="sm" variant="outline" className="mt-1 text-xs">
          Recordar
        </Button>
      </div>
    </div>
  )
}

function StatCard(props: {
  label: string
  value: number
  tone: 'default' | 'success' | 'destructive'
}) {
  const toneClass =
    props.tone === 'destructive'
      ? 'border-red-200 bg-red-50 text-red-700'
      : props.tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-white text-slate-700'
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold">{props.value}</p>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}

function DlcNotActiveBanner(props: { error: Error & { code?: string; status?: number } }) {
  const navigate = useNavigate()
  const isDlcIssue =
    props.error.status === 402 ||
    props.error.code?.startsWith('DLC_')
  if (!isDlcIssue) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Error: {props.error.message}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
      <BookOpen className="mx-auto h-10 w-10 text-amber-600" />
      <h3 className="mt-3 text-base font-medium text-amber-900">
        Zenix Learning no está activo
      </h3>
      <p className="mt-1 text-sm text-amber-800">
        Activa el módulo desde Settings &gt; Add-Ons. Si ya lo tenías y lo cancelaste, tu data se preserva.
      </p>
      <Button
        className="mt-4 bg-amber-600 hover:bg-amber-700"
        onClick={() => navigate('/settings/dlc')}
      >
        Ir a Add-Ons
      </Button>
    </div>
  )
}
