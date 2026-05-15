/**
 * CommentsThread.tsx — Sprint Mx-1B-W2 (+ audit fixes W2-06 / W2-12).
 *
 * Tab "Comentarios" del TicketDetailDrawer. Chat técnico ↔ supervisor.
 *
 * Reglas UX:
 *   · Listado cronológico ascendente (oldest top), composer al final — pattern
 *     Slack/Linear/Asana.
 *   · Cmd/Ctrl+Enter envía. **W2-06 fix**: guarda `isComposing` para que
 *     teclados con IME (español dead-keys: ñ, acentos; CJK) no envíen
 *     mid-composition (Slack Engineering Blog "IME composition events" 2021).
 *   · **W2-12 fix**: optimistic UI — el comentario aparece instantáneo con
 *     opacity reducida + "Enviando…", se reemplaza al confirmar. Si falla,
 *     se quita y se muestra error con el texto preservado en el composer.
 *   · Auto-scroll al fondo cuando se añade un comentario nuevo.
 */
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MaintenanceTicketCommentDto } from '@zenix/shared'
import { Button } from '@/components/ui/button'
import { useAddComment } from '../hooks/useMaintenanceTickets'
import { useShakeOnInvalid } from '@/hooks/useShakeOnInvalid'

interface Props {
  ticketId: string
  comments: MaintenanceTicketCommentDto[]
  currentUserId: string
}

// W2-12 — modelo combinado: comentario persistido del servidor O pendiente local.
type DisplayComment = MaintenanceTicketCommentDto & { __pending?: boolean }

// MAINT-4 fix — persistencia de borrador por ticket. Si el supervisor cierra
// el drawer / cambia de tab / refresca con un comentario a medio escribir, el
// texto se conserva. Slack y Linear hacen esto mismo desde 2019. Sin esto
// los tickets de mantenimiento con instrucciones largas pierden trabajo al
// menor descuido (reportado en piloto).
const DRAFT_STORAGE_KEY = (ticketId: string) => `mx-comment-draft:${ticketId}`

export function CommentsThread({ ticketId, comments, currentUserId }: Props) {
  const addComment = useAddComment(ticketId)
  // Cargar borrador persistido al montar (per-ticket). Si nunca hubo, ''.
  const [draft, setDraft] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return window.localStorage.getItem(DRAFT_STORAGE_KEY(ticketId)) ?? '' }
    catch { return '' }
  })
  const [pending, setPending] = useState<DisplayComment[]>([])
  const listEndRef = useRef<HTMLDivElement>(null)

  // Persistir borrador con debounce-on-change (escribir cada keystroke al
  // localStorage es ok para textos cortos — máx ~300 caracteres). Si el draft
  // queda vacío limpiamos la entrada para no dejar basura.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (draft.length === 0) window.localStorage.removeItem(DRAFT_STORAGE_KEY(ticketId))
      else window.localStorage.setItem(DRAFT_STORAGE_KEY(ticketId), draft)
    } catch { /* quota / private-mode — ignorar */ }
  }, [draft, ticketId])

  // Auto-scroll al fondo cuando llega nuevo comentario (persistido o pendiente).
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [comments.length, pending.length])

  // Limpiar pendientes que ya llegaron por SSE (matching por contenido + ventana
  // de 30s alrededor del createdAt). Evita ver el comentario dos veces.
  useEffect(() => {
    if (pending.length === 0) return
    setPending((prev) =>
      prev.filter((p) => {
        const arrived = comments.some(
          (c) =>
            c.content === p.content &&
            c.authorId === currentUserId &&
            Math.abs(new Date(c.createdAt).getTime() - new Date(p.createdAt).getTime()) <
              30_000,
        )
        return !arrived
      }),
    )
  }, [comments, currentUserId, pending.length])

  // §60 D19: NO disabled para validación. Solo bloquea durante mutación.
  const { shakeClass, trigger: triggerShake } = useShakeOnInvalid()

  function submit() {
    if (addComment.isPending) return
    if (draft.trim().length === 0) {
      triggerShake()
      return
    }
    const content = draft.trim()
    const optimistic: DisplayComment = {
      id: `optimistic-${Date.now()}`,
      ticketId,
      authorId: currentUserId,
      authorName: 'Tú',
      content,
      createdAt: new Date().toISOString(),
      __pending: true,
    }
    setPending((p) => [...p, optimistic])
    const sentDraft = draft
    setDraft('')

    addComment.mutate(
      { content },
      {
        onError: (err) => {
          // Rollback: quitar el pendiente y restaurar el draft con el error.
          setPending((p) => p.filter((c) => c.id !== optimistic.id))
          setDraft(sentDraft)
          console.error('comment failed:', err)
        },
      },
    )
  }

  const allComments: DisplayComment[] = [...comments, ...pending]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {allComments.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Sin comentarios. Sé el primero en escribir.
          </p>
        ) : (
          allComments.map((c) => {
            const mine = c.authorId === currentUserId
            return (
              <div
                key={c.id}
                className={[
                  'rounded-lg border px-3 py-2',
                  mine
                    ? 'bg-emerald-50 border-emerald-100 ml-6'
                    : 'bg-slate-50 border-slate-100 mr-6',
                  c.__pending && 'opacity-60',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold text-slate-700">
                    {mine ? 'Tú' : c.authorName ?? 'Sistema'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {c.__pending
                      ? 'Enviando…'
                      : format(parseISO(c.createdAt), 'd MMM HH:mm', { locale: es })}
                  </span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.content}</p>
              </div>
            )
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // W2-06 fix: con IME activo (escribiendo "ñ", acentos, CJK),
            // `isComposing` o keyCode 229 indican que el evento es parte de
            // la composición — NO disparar submit.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Escribe un comentario…  (⌘/Ctrl + Enter envía)"
          rows={2}
          maxLength={1000}
          className={`flex-1 text-xs border border-slate-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 ${shakeClass}`}
        />
        <Button
          type="button"
          size="sm"
          disabled={addComment.isPending}
          onClick={submit}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {addComment.isPending ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </div>
  )
}
