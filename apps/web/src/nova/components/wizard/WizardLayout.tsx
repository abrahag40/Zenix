/**
 * WizardLayout — layout dedicado del Wizard Zenix Activate.
 *
 * NO usa NovaShell — el wizard es focus mode (sin sidebar nav que distraiga).
 * Layout interno:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ TopBar [Cancelar wizard]              [Cliente: X]  │
 *   ├──────────────┬──────────────────────────────────────┤
 *   │ Steps        │ Step content                         │
 *   │ 1. ✓ Customer│                                       │
 *   │ 2. ▶ Brand   │ <Step component>                      │
 *   │ 3.   Legal   │                                       │
 *   │ ...          │                                       │
 *   ├──────────────┴──────────────────────────────────────┤
 *   │              [← Atrás]  [Siguiente →]              │
 *   └─────────────────────────────────────────────────────┘
 *
 * Steps sidebar: ordered list visual con check/active/idle states.
 * Apple HIG pattern para multi-step wizards (Pages Document Setup,
 * macOS Migration Assistant).
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react'
import { useNovaStore } from '../../../store/nova'
import {
  useWizardStore,
  WIZARD_STEPS,
  canCompleteStep,
  type WizardStepKey,
} from '../../../store/wizard'
import {
  Button,
  Title,
  Body,
  Eyebrow,
  Caption,
  IconButton,
  Chip,
} from '../../design-system'
import { ConfirmDialog } from '../../../modules/rooms/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'

interface WizardLayoutProps {
  title: string
  description?: string
  children: ReactNode
  /** Render acción primaria override (e.g. Step 8 "Activar" en vez de "Siguiente") */
  primaryAction?: ReactNode
  /** Disable next per page (e.g. validations específicas del step) */
  nextDisabled?: boolean
  nextLabel?: string
}

export function WizardLayout({
  title,
  description,
  children,
  primaryAction,
  nextDisabled = false,
  nextLabel = 'Siguiente',
}: WizardLayoutProps) {
  const state = useWizardStore()
  const navigate = useNavigate()
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const currentStep = state.currentStep
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === currentStep)
  const isFirst = currentIdx === 0
  const isLast = currentIdx === WIZARD_STEPS.length - 1

  /**
   * ¿Hay progreso en el wizard?
   * Heurística: cualquier campo no-vacío significa data ingresada.
   * Si !hasProgress, salir es directo sin confirmación.
   */
  const hasProgress =
    state.organizationName.trim().length > 0 ||
    state.brandEnabled ||
    state.legalEntityName.trim().length > 0 ||
    state.legalEntityTaxId.trim().length > 0 ||
    state.properties.length > 0 ||
    state.orgOwnerEmail.trim().length > 0 ||
    state.orgOwnerName.trim().length > 0 ||
    state.completedSteps.size > 0

  const handleExitRequest = () => {
    if (hasProgress) {
      setExitConfirmOpen(true)
    } else {
      navigate('/nova/clientes')
    }
  }

  const handleExitConfirm = () => {
    // Reset del wizard — la siguiente vez que se abra arranca limpio.
    state.reset()
    setExitConfirmOpen(false)
    navigate('/nova/clientes')
  }

  const goPrev = () => {
    if (isFirst) return
    const prev = WIZARD_STEPS[currentIdx - 1].key
    state.setStep(prev)
  }

  const goNext = () => {
    const check = canCompleteStep(currentStep, state)
    if (!check.ok) {
      // En producción: toast.error(check.reason). Por simplicidad inline visible.
      return
    }
    state.markCompleted(currentStep)
    if (!isLast) {
      const next = WIZARD_STEPS[currentIdx + 1].key
      state.setStep(next)
    }
  }

  const validation = canCompleteStep(currentStep, state)

  return (
    <div className="h-screen bg-slate-50 flex flex-col antialiased relative overflow-hidden">
      {/* Ambient gradient — wizard mode warm */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(800px circle at 0% 0%, rgba(139,92,246,0.05) 0%, transparent 50%),' +
            'radial-gradient(700px circle at 100% 100%, rgba(16,185,129,0.04) 0%, transparent 50%)',
        }}
        aria-hidden
      />

      {/* Top bar */}
      <header className="relative h-14 bg-white/85 backdrop-blur-md backdrop-saturate-150 border-b border-slate-200/70 flex items-center px-5 z-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-violet-600 to-violet-800 text-white shadow-[0_4px_12px_-4px_rgba(139,92,246,0.5)]">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-0.005em] text-slate-900">
              Zenix Activate
            </div>
            <Caption tone="tertiary" className="block leading-tight">
              Wizard de activación · {actingOrgName ?? 'Sin cliente'}
            </Caption>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Chip variant="progress" intent="subtle" size="md">
            Paso {currentIdx + 1} de {WIZARD_STEPS.length}
          </Chip>
          <IconButton
            icon={X}
            size="sm"
            variant="ghost"
            aria-label="Salir del wizard"
            title="Salir del wizard"
            onClick={handleExitRequest}
          />
        </div>
      </header>

      {/* Main layout — h-screen lock: sidebar fija, main scrollea */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Steps sidebar — flex column con overflow interna si steps > viewport */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-slate-200/70 bg-white/60 backdrop-blur-sm p-5 overflow-y-auto">
          <Eyebrow tone="tertiary" className="block mb-3">
            Pasos
          </Eyebrow>
          <ol className="space-y-1">
            {WIZARD_STEPS.map((step, idx) => {
              // Block forward navigation: solo se puede navegar a steps ya
              // completados o al actual. Steps futuros quedan deshabilitados
              // hasta que el consultor complete el step actual y avance con
              // "Siguiente". Pattern Apple HIG / Salesforce Setup Assistant.
              const isReachable = idx <= currentIdx || state.completedSteps.has(step.key)
              return (
                <StepNavItem
                  key={step.key}
                  step={step}
                  idx={idx}
                  isActive={step.key === currentStep}
                  isCompleted={state.completedSteps.has(step.key)}
                  isReachable={isReachable}
                  onClick={() => isReachable && state.setStep(step.key)}
                />
              )
            })}
          </ol>

          <div className="mt-auto pt-5 border-t border-slate-200/70">
            <Caption tone="tertiary" className="block">
              Progreso guardado automáticamente. Puedes cerrar y volver luego.
            </Caption>
          </div>
        </aside>

        {/* Step content column — flex column con scroll interna + footer fijo */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-5 sm:px-7 lg:px-9 py-8">
              {/* Step title */}
              <div className="mb-6">
                <Eyebrow tone="tertiary" className="text-violet-700">
                  Paso {currentIdx + 1} · {WIZARD_STEPS[currentIdx].hint}
                </Eyebrow>
                <Title as="h1" className="mt-1 text-[24px] tracking-[-0.02em]">
                  {title}
                </Title>
                {description && (
                  <Body className="mt-1.5 max-w-2xl" tone="secondary">
                    {description}
                  </Body>
                )}
              </div>

              {children}
            </div>
          </div>

          {/*
           * Footer nav — fijo al fondo de la columna (NO sticky).
           * Vive afuera del div scrollable, así no se "sube" cuando el
           * contenido del step es corto. Flex-shrink-0 garantiza altura
           * estable independiente del contenido.
           */}
          <footer className="mt-auto flex-shrink-0 bg-white/90 backdrop-blur-md backdrop-saturate-150 border-t border-slate-200/70 px-5 sm:px-7 lg:px-9 py-2.5 flex flex-col gap-1.5">
            {/* Validation hint en su propia fila — evita que el texto colapse
             *  contra los botones cuando crece. Always 18px height para
             *  estabilidad layout (no jump al toggle). */}
            <div className="h-[18px] flex items-center justify-end">
              {!validation.ok && validation.reason && (
                <Caption tone="tertiary" className="text-amber-700 text-[11.5px] leading-tight">
                  ⚠ {validation.reason}
                </Caption>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="md"
                onClick={goPrev}
                disabled={isFirst}
                iconLeft={ChevronLeft}
              >
                Atrás
              </Button>

              {primaryAction ?? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={goNext}
                  disabled={nextDisabled || !validation.ok}
                  iconRight={ChevronRight}
                >
                  {nextLabel}
                </Button>
              )}
            </div>
          </footer>
        </main>
      </div>

      {/* Exit confirmation — solo si hay progreso real (heurística hasProgress).
       *  Copy: NN/g Krug 2014 "Omit needless words". Concisión sobre completitud —
       *  el consultor entiende qué pierde sin un ensayo. */}
      <ConfirmDialog
        open={exitConfirmOpen}
        tone="warning"
        title="¿Descartar el wizard?"
        message="Perderás los datos capturados. La próxima vez que lo abras empezarás desde cero."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        onConfirm={handleExitConfirm}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </div>
  )
}

// ─── Step nav item ───────────────────────────────────────────────────

function StepNavItem({
  step,
  idx,
  isActive,
  isCompleted,
  isReachable,
  onClick,
}: {
  step: { key: WizardStepKey; label: string; hint: string }
  idx: number
  isActive: boolean
  isCompleted: boolean
  isReachable: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!isReachable}
        title={!isReachable ? 'Completa el paso actual primero' : undefined}
        className={cn(
          'w-full group flex items-start gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-150 text-left',
          isActive
            ? 'bg-gradient-to-r from-violet-50 via-violet-50/40 to-transparent ring-1 ring-inset ring-violet-200/60'
            : isReachable
              ? 'hover:bg-slate-100/60'
              : 'opacity-50 cursor-not-allowed',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold flex-shrink-0 transition-all',
            isCompleted
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_2px_6px_-2px_rgba(16,185,129,0.5)]'
              : isActive
                ? 'bg-violet-600 text-white shadow-[0_2px_6px_-2px_rgba(139,92,246,0.5)]'
                : 'bg-slate-200 text-slate-600',
          )}
        >
          {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'text-[13px] font-semibold leading-tight transition-colors',
              isActive ? 'text-violet-900' : isCompleted ? 'text-slate-900' : 'text-slate-700',
            )}
          >
            {step.label}
          </div>
          <Caption tone="tertiary" className="block leading-tight mt-0.5">
            {step.hint}
          </Caption>
        </div>
      </button>
    </li>
  )
}
