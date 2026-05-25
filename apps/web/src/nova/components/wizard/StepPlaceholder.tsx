/**
 * StepPlaceholder — para steps 5-8 que se completan Day 15.
 *
 * Marca el paso como "scaffolding listo" para que el flow del wizard
 * sea navegable end-to-end (UX completo) aunque la lógica backend
 * aún no esté wireada.
 */
import { Sparkles, AlertCircle } from 'lucide-react'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Caption, Chip } from '../../design-system'

export function StepPlaceholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <WizardLayout title={title} description="Step UI completo en Day 15.">
      <Surface variant="raised" radius="lg" padding="lg" tone="info">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex-shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Body className="font-semibold text-slate-900">Día 15 — scaffolding pendiente</Body>
              <Chip variant="progress" intent="subtle" size="sm">
                Day 15
              </Chip>
            </div>
            <Caption tone="secondary" className="block mt-1.5 leading-relaxed">
              {description}
            </Caption>
            <div className="mt-3 p-3 rounded-md bg-white border border-slate-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <Caption tone="secondary" className="text-[12px]">
                  El wizard se puede navegar hasta acá pero la activación final (Step 8) requiere
                  los endpoints backend que Day 15 expone — sin esos, "Activar" devolverá un stub
                  feedback informativo.
                </Caption>
              </div>
            </div>
          </div>
        </div>
      </Surface>
    </WizardLayout>
  )
}
