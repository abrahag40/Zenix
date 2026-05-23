/**
 * AttemptDialog.tsx — examen final del curso (LearningAssessment).
 *
 * Flow:
 *   1. Click "Iniciar examen" → POST /v1/learning/attempts { enrollmentId, lessonId: null }
 *   2. Server retorna { attemptId, questions: [{ id, q, options }] } — sin correctMapped
 *   3. User responde una pregunta a la vez (anti-overwhelm, NN/g)
 *   4. Submit → POST /v1/learning/attempts/:id/submit { answers }
 *   5. Server scoring → { scorePct, passed, result }
 *   6. Result page: PASSED → certificate emit auto. FAILED → re-take countdown
 *
 * Anti-cheat: el cliente NUNCA ve `correctMapped`. Si abre devtools y modifica
 * answers payload, el server scoring contra snapshot original detecta.
 *
 * Dialog usa Radix Dialog primitives (§116 — no inventar contenedores).
 */
import { useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Award, CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '../../../api/client'

interface AttemptQuestionView {
  id: string
  q: string
  options: string[]
}

interface AttemptStarted {
  attemptId: string
  questionsTotal: number
  questions: AttemptQuestionView[]
  startedAt: string
}

interface AttemptResult {
  attemptId: string
  scorePct: number
  questionsCorrect: number
  questionsTotal: number
  passed: boolean
  result: 'PASSED' | 'FAILED'
}

export function AttemptDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enrollmentId: string
  passingScore: string // ej. "75.00"
  durationMinutes: number
  onCompleted: () => void
}) {
  const [phase, setPhase] = useState<'intro' | 'in_progress' | 'submitting' | 'result'>('intro')
  const [attempt, setAttempt] = useState<AttemptStarted | null>(null)
  const [answers, setAnswers] = useState<Map<string, number>>(new Map())
  const [currentIdx, setCurrentIdx] = useState(0)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const reset = () => {
    setPhase('intro')
    setAttempt(null)
    setAnswers(new Map())
    setCurrentIdx(0)
    setResult(null)
  }

  const handleStart = async () => {
    try {
      const data = await api.post<AttemptStarted>('/api/v1/learning/attempts', {
        enrollmentId: props.enrollmentId,
        // lessonId omitted = examen final
      })
      setAttempt(data)
      setPhase('in_progress')
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.status === 409) {
        toast.error(apiErr.message ?? 'No puedes iniciar el examen ahora.')
      } else {
        toast.error(`No se pudo iniciar: ${apiErr.message}`)
      }
    }
  }

  const handleSubmit = async () => {
    if (!attempt) return
    setPhase('submitting')
    try {
      const answersPayload = Array.from(answers.entries()).map(([qid, idx]) => ({
        questionId: qid,
        selectedOptionIdx: idx,
      }))
      const data = await api.post<AttemptResult>(
        `/api/v1/learning/attempts/${attempt.attemptId}/submit`,
        { answers: answersPayload },
      )
      setResult(data)
      setPhase('result')
      if (data.passed) props.onCompleted()
    } catch (err) {
      const apiErr = err as ApiError
      toast.error(`Error al enviar: ${apiErr.message}`)
      setPhase('in_progress')
    }
  }

  const handleClose = (open: boolean) => {
    // No permitir cerrar durante in_progress sin confirmación
    if (!open && phase === 'in_progress') {
      const ok = window.confirm(
        'Si cierras ahora pierdes este intento. ¿Confirmas?',
      )
      if (!ok) return
    }
    if (!open) reset()
    props.onOpenChange(open)
  }

  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={handleClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
              Examen final
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 py-5">
            {phase === 'intro' && (
              <IntroPhase
                passingScore={props.passingScore}
                durationMinutes={props.durationMinutes}
                onStart={handleStart}
              />
            )}
            {phase === 'in_progress' && attempt && (
              <InProgressPhase
                attempt={attempt}
                currentIdx={currentIdx}
                answers={answers}
                onSelect={(qid, idx) =>
                  setAnswers((prev) => new Map(prev).set(qid, idx))
                }
                onNext={() => setCurrentIdx((i) => Math.min(i + 1, attempt.questionsTotal - 1))}
                onPrev={() => setCurrentIdx((i) => Math.max(i - 1, 0))}
                onSubmit={handleSubmit}
              />
            )}
            {phase === 'submitting' && (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Calificando…
              </div>
            )}
            {phase === 'result' && result && (
              <ResultPhase
                result={result}
                passingScore={props.passingScore}
                onClose={() => handleClose(false)}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Phases ────────────────────────────────────────────────────────────────

function IntroPhase(props: {
  passingScore: string
  durationMinutes: number
  onStart: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Antes de empezar:</p>
        <ul className="mt-2 list-disc pl-5 text-xs">
          <li>Aprobación: <strong>{props.passingScore}%</strong></li>
          <li>Tiempo: <strong>{props.durationMinutes} minutos</strong></li>
          <li>Una vez iniciado no puedes pausar — termina o pierdes el intento</li>
          <li>Tus respuestas se califican automáticamente al enviar</li>
        </ul>
      </div>
      <Button
        onClick={props.onStart}
        className="w-full bg-emerald-600 hover:bg-emerald-700"
      >
        Iniciar examen
      </Button>
    </div>
  )
}

function InProgressPhase(props: {
  attempt: AttemptStarted
  currentIdx: number
  answers: Map<string, number>
  onSelect: (qid: string, idx: number) => void
  onNext: () => void
  onPrev: () => void
  onSubmit: () => void
}) {
  const question = props.attempt.questions[props.currentIdx]
  if (!question) return null
  const selected = props.answers.get(question.id)
  const isLast = props.currentIdx === props.attempt.questionsTotal - 1
  const answeredCount = props.answers.size

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Pregunta {props.currentIdx + 1} de {props.attempt.questionsTotal}
        </span>
        <Badge variant="outline">{answeredCount} de {props.attempt.questionsTotal} respondidas</Badge>
      </div>

      <div>
        <p className="text-base text-slate-900">{question.q}</p>
        <ul className="mt-4 space-y-2">
          {question.options.map((opt, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => props.onSelect(question.id, idx)}
                className={`w-full rounded-md border px-3 py-2.5 text-left text-sm transition ${
                  selected === idx
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-between border-t border-slate-200 pt-4">
        <Button
          variant="outline"
          onClick={props.onPrev}
          disabled={props.currentIdx === 0}
        >
          Anterior
        </Button>
        {isLast ? (
          <Button
            onClick={props.onSubmit}
            disabled={answeredCount < props.attempt.questionsTotal}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Enviar examen
          </Button>
        ) : (
          <Button onClick={props.onNext}>Siguiente</Button>
        )}
      </div>
    </div>
  )
}

function ResultPhase(props: {
  result: AttemptResult
  passingScore: string
  onClose: () => void
}) {
  const Icon = props.result.passed ? CheckCircle2 : XCircle
  const iconColor = props.result.passed ? 'text-emerald-500' : 'text-red-500'
  return (
    <div className="space-y-4 text-center">
      <Icon className={`mx-auto h-16 w-16 ${iconColor}`} />
      <div>
        <h3 className="text-xl font-semibold text-slate-900">
          {props.result.passed ? '¡Aprobado!' : 'No aprobado'}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Tu calificación: <strong>{props.result.scorePct.toFixed(1)}%</strong> (mínimo {props.passingScore}%)
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {props.result.questionsCorrect} de {props.result.questionsTotal} correctas
        </p>
      </div>
      {props.result.passed && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <Award className="mx-auto mb-1 h-5 w-5" />
          Tu certificado se está generando. Disponible en pocos minutos en tu dashboard.
        </div>
      )}
      {!props.result.passed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Espera unas horas antes del siguiente intento (política de la institución). Tu supervisor recibió notificación.
        </div>
      )}
      <Button className="w-full" onClick={props.onClose}>
        Cerrar
      </Button>
    </div>
  )
}
