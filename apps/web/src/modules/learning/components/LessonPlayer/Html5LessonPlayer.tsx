/**
 * Html5LessonPlayer.tsx — renderiza LearningLesson con type=HTML5_NATIVE.
 *
 * El backend devuelve `contentJson` con estructura:
 *   [
 *     { kind: 'text', body: 'markdown text' },
 *     { kind: 'image', url, alt, caption },
 *     { kind: 'callout', tone: 'info'|'warning'|'success', body },
 *     { kind: 'quiz', questions: [{ id, q, options, correctMapped?, explain? }] }
 *   ]
 *
 * Quiz blocks inline (formativos) — NO usan attempts API, son self-check.
 * Para evaluación sumativa (cuenta hacia certificación) está el examen final
 * vía AttemptDialog (parent LearningLessonPage).
 */
import { useState } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

type ContentBlock =
  | { kind: 'text'; body: string }
  | { kind: 'image'; url: string; alt?: string; caption?: string }
  | { kind: 'callout'; tone?: 'info' | 'warning' | 'success'; body: string }
  | {
      kind: 'quiz'
      questions: Array<{
        id: string
        q: string
        options: string[]
        // En lessons formativas, el correctIdx VIENE del backend
        // (no es server-side scoring — es self-check inline)
        correctIdx?: number
        explain?: string
      }>
    }

export function Html5LessonPlayer({
  contentJson,
}: {
  contentJson: ContentBlock[] | null
}) {
  if (!contentJson || contentJson.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Sin contenido disponible para esta lección.
      </div>
    )
  }

  return (
    <article className="prose prose-slate max-w-none">
      {contentJson.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </article>
  )
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">
          {block.body}
        </div>
      )
    case 'image':
      return (
        <figure className="my-4">
          <img
            src={block.url}
            alt={block.alt ?? ''}
            className="rounded-md border border-slate-200"
          />
          {block.caption && (
            <figcaption className="mt-1.5 text-xs text-slate-500">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case 'callout':
      return <Callout tone={block.tone ?? 'info'} body={block.body} />
    case 'quiz':
      return <InlineQuiz questions={block.questions} />
    default:
      return null
  }
}

function Callout({
  tone,
  body,
}: {
  tone: 'info' | 'warning' | 'success'
  body: string
}) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
  const Icon = tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div className={`my-4 flex gap-2 rounded-md border p-3 text-sm ${styles[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="whitespace-pre-wrap">{body}</div>
    </div>
  )
}

function InlineQuiz({
  questions,
}: {
  questions: Array<{
    id: string
    q: string
    options: string[]
    correctIdx?: number
    explain?: string
  }>
}) {
  return (
    <div className="my-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
        Verifica tu comprensión
      </p>
      {questions.map((q) => (
        <SelfCheckQuestion key={q.id} question={q} />
      ))}
    </div>
  )
}

function SelfCheckQuestion({
  question,
}: {
  question: {
    id: string
    q: string
    options: string[]
    correctIdx?: number
    explain?: string
  }
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const isCorrect = question.correctIdx !== undefined && selected === question.correctIdx

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-900">{question.q}</p>
      <ul className="mt-3 space-y-1.5">
        {question.options.map((opt, idx) => {
          const isPicked = selected === idx
          const isThisCorrect =
            revealed && question.correctIdx !== undefined && idx === question.correctIdx
          const isPickedWrong = revealed && isPicked && !isCorrect
          return (
            <li key={idx}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => setSelected(idx)}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                  isThisCorrect
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : isPickedWrong
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : isPicked
                        ? 'border-emerald-300 bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {revealed && isThisCorrect && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                {revealed && isPickedWrong && <XCircle className="h-4 w-4 text-red-600" />}
                <span>{opt}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {!revealed && selected !== null && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-2 text-xs text-emerald-700 underline"
        >
          Verificar respuesta
        </button>
      )}
      {revealed && question.explain && (
        <p className="mt-2 text-xs text-slate-600">{question.explain}</p>
      )}
    </div>
  )
}
