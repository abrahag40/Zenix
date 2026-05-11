/**
 * CommentsThread.tsx — Sprint Mx-1B-W2
 *
 * Tab "Comentarios" del TicketDetailDrawer. Chat técnico ↔ supervisor.
 *
 * Reglas UX:
 *   · Listado cronológico ascendente (oldest top), composer al final — pattern
 *     Slack/Linear/Asana. El usuario lee la historia y escribe al final.
 *   · Cmd/Ctrl+Enter envía (atajos esperados por power users).
 *   · Ctrl+Enter mínimo 1 char, sin upper-bound visible aparte del 1000 cap
 *     (backend valida).
 *   · Auto-scroll al fondo cuando se añade un comentario nuevo (propio o de
 *     otro vía SSE).
 */
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MaintenanceTicketCommentDto } from '@zenix/shared'
import { Button } from '@/components/ui/button'
import { useAddComment } from '../hooks/useMaintenanceTickets'

interface Props {
  ticketId: string
  comments: MaintenanceTicketCommentDto[]
  currentUserId: string
}

export function CommentsThread({ ticketId, comments, currentUserId }: Props) {
  const addComment = useAddComment(ticketId)
  const [draft, setDraft] = useState('')
  const listEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al fondo cuando llega nuevo comentario (SSE-driven invalidation).
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [comments.length])

  const canSend = draft.trim().length > 0 && !addComment.isPending

  function submit() {
    if (!canSend) return
    const content = draft.trim()
    addComment.mutate(
      { content },
      {
        onSuccess: () => setDraft(''),
      },
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Lista */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {comments.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Sin comentarios. Sé el primero en escribir.
          </p>
        ) : (
          comments.map((c) => {
            const mine = c.authorId === currentUserId
            return (
              <div
                key={c.id}
                className={
                  mine
                    ? 'rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 ml-6'
                    : 'rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 mr-6'
                }
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold text-slate-700">
                    {mine ? 'Tú' : c.authorName ?? 'Sistema'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {format(parseISO(c.createdAt), "d MMM HH:mm", { locale: es })}
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
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Escribe un comentario…  (⌘/Ctrl + Enter envía)"
          rows={2}
          maxLength={1000}
          className="flex-1 text-xs border border-slate-300 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <Button
          type="button"
          size="sm"
          disabled={!canSend}
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
