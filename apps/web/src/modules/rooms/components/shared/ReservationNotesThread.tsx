/**
 * ReservationNotesThread — Sprint EDIT-RESERVATION
 *
 * Bitácora chat-style per reserva. Patrón análogo a CommentsThread del módulo
 * Maintenance (consistencia UX cross-módulo).
 *
 * Reglas UX:
 *   - Listado cronológico ascendente (oldest top), composer al final — Slack pattern.
 *   - Cmd/Ctrl+Enter envía. Respeta IME composition (acentos español, CJK) —
 *     fix W2-06 del módulo Maintenance.
 *   - Optimistic UI: la nota aparece instantánea con opacity reducida, se
 *     reemplaza al confirmar. Si falla rollback + restore en composer.
 *   - Edit window 5min (mismo autor) — botón "Editar" inline en la nota.
 *     Pasada la ventana, botón desaparece (audit trail).
 *   - Channel selector: GENERAL / GUEST_REQUEST / HOUSEKEEPING / INTERNAL.
 *     Coloreado per-channel para scan visual rápido (Treisman 1980 pre-attentive).
 *   - Draft persisted en localStorage per-stay — MAINT-4 pattern (sobrevive
 *     close/reopen del sheet).
 *   - Auto-scroll al fondo en append.
 *
 * Performance:
 *   - allNotes computado solo cuando cambian listas (no en cada render).
 *   - Pendientes se limpian por SSE matching (content + 30s window).
 *   - No usa context/zustand — todo local + react-query.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Send } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  useGuestStayNotes,
  useCreateGuestStayNote,
  useEditGuestStayNote,
} from '../../hooks/useGuestStays'
import type { NoteChannel } from '../../api/guest-stays.api'
import { useShakeOnInvalid } from '@/hooks/useShakeOnInvalid'

interface Props {
  stayId:        string
  currentUserId: string
  /** Compact mode para sidebars angostos. */
  compact?:      boolean
}

const CHANNEL_META: Record<NoteChannel, { label: string; chip: string; dot: string }> = {
  GENERAL:       { label: 'General',       chip: 'bg-slate-100 text-slate-700',     dot: 'bg-slate-400' },
  GUEST_REQUEST: { label: 'Petición',      chip: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  HOUSEKEEPING:  { label: 'Limpieza',      chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INTERNAL:      { label: 'Interno',       chip: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
}

const DRAFT_KEY = (stayId: string) => `reservation-note-draft:${stayId}`
const EDIT_WINDOW_MS = 5 * 60 * 1000 // mirror del backend

type DisplayNote = {
  id:        string
  authorId:  string
  content:   string
  channel:   NoteChannel
  createdAt: string
  editedAt:  string | null
  __pending?: boolean
}

export function ReservationNotesThread({ stayId, currentUserId, compact = false }: Props) {
  const notesQuery  = useGuestStayNotes(stayId)
  const createMut   = useCreateGuestStayNote(stayId)
  const editMut     = useEditGuestStayNote(stayId)

  // Draft persistence per-stay (MAINT-4 pattern).
  const [draft, setDraft] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return window.localStorage.getItem(DRAFT_KEY(stayId)) ?? '' } catch { return '' }
  })
  const [channel, setChannel] = useState<NoteChannel>('GENERAL')
  const [pending, setPending] = useState<DisplayNote[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const listEndRef = useRef<HTMLDivElement>(null)
  const { shakeClass, trigger: triggerShake } = useShakeOnInvalid()

  // Persist draft on change. Storage write es barato; sin debounce.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (draft.length === 0) window.localStorage.removeItem(DRAFT_KEY(stayId))
      else window.localStorage.setItem(DRAFT_KEY(stayId), draft)
    } catch { /* quota / private mode */ }
  }, [draft, stayId])

  // Combinar notas server + pendientes (memoized).
  const serverNotes = notesQuery.data ?? []
  const allNotes: DisplayNote[] = useMemo(() => {
    return [...serverNotes, ...pending]
  }, [serverNotes, pending])

  // Limpiar pendientes que ya llegaron por SSE — match content + 30s.
  useEffect(() => {
    if (pending.length === 0) return
    setPending((prev) =>
      prev.filter((p) => {
        const arrived = serverNotes.some(
          (s) =>
            s.content === p.content &&
            s.authorId === currentUserId &&
            Math.abs(new Date(s.createdAt).getTime() - new Date(p.createdAt).getTime()) < 30_000,
        )
        return !arrived
      }),
    )
  }, [serverNotes, currentUserId, pending.length])

  // Auto-scroll al fondo en append.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [allNotes.length])

  function submit() {
    if (createMut.isPending) return
    const content = draft.trim()
    if (content.length === 0) {
      triggerShake()
      return
    }

    const optimistic: DisplayNote = {
      id:        `optimistic-${Date.now()}`,
      authorId:  currentUserId,
      content,
      channel,
      createdAt: new Date().toISOString(),
      editedAt:  null,
      __pending: true,
    }
    setPending((p) => [...p, optimistic])
    const sentDraft = draft
    setDraft('')

    createMut.mutate(
      { content, channel },
      {
        onError: () => {
          // Rollback + restore draft con el texto preservado.
          setPending((p) => p.filter((n) => n.id !== optimistic.id))
          setDraft(sentDraft)
        },
      },
    )
  }

  function startEditNote(note: DisplayNote) {
    if (note.__pending) return
    if (note.authorId !== currentUserId) return
    const ageMs = Date.now() - new Date(note.createdAt).getTime()
    if (ageMs > EDIT_WINDOW_MS) return
    setEditingId(note.id)
    setEditDraft(note.content)
  }

  function commitEditNote() {
    if (!editingId) return
    const content = editDraft.trim()
    if (content.length === 0) {
      triggerShake()
      return
    }
    editMut.mutate(
      { noteId: editingId, content },
      {
        onSettled: () => {
          setEditingId(null)
          setEditDraft('')
        },
      },
    )
  }

  return (
    <div className={cn('flex flex-col', compact ? 'h-72' : 'h-full')}>
      {/* Lista */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {notesQuery.isLoading ? (
          <p className="text-xs text-slate-400 py-4 text-center">Cargando…</p>
        ) : allNotes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Sin notas todavía. Agrega la primera entrada al historial.
          </p>
        ) : (
          allNotes.map((n) => {
            const mine = n.authorId === currentUserId
            const meta = CHANNEL_META[n.channel] ?? CHANNEL_META.GENERAL
            const ageMs = Date.now() - new Date(n.createdAt).getTime()
            const canEdit = !n.__pending && mine && ageMs < EDIT_WINDOW_MS
            const isEditing = editingId === n.id

            return (
              <div
                key={n.id}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  mine ? 'bg-emerald-50/50 border-emerald-100 ml-6' : 'bg-slate-50 border-slate-100 mr-6',
                  n.__pending && 'opacity-60',
                )}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700">
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', meta.dot)} />
                    {mine ? 'Tú' : `Staff ${n.authorId.slice(0, 4)}`}
                    <span className={cn('px-1.5 py-0 rounded text-[9px] font-medium', meta.chip)}>
                      {meta.label}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {n.__pending
                      ? 'Enviando…'
                      : format(parseISO(n.createdAt), 'd MMM HH:mm', { locale: es })}
                    {n.editedAt && !n.__pending && <span className="italic ml-1">(editada)</span>}
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="w-full text-sm border border-emerald-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      autoFocus
                    />
                    <div className="flex gap-1.5 justify-end">
                      <Button
                        type="button" size="sm" variant="ghost"
                        onClick={() => { setEditingId(null); setEditDraft('') }}
                        disabled={editMut.isPending}
                        className="text-xs h-7"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button" size="sm"
                        onClick={commitEditNote}
                        disabled={editMut.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7"
                      >
                        {editMut.isPending ? 'Guardando…' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap flex-1">{n.content}</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEditNote(n)}
                        className="text-slate-300 hover:text-slate-600 p-0.5 -mr-1 flex-shrink-0"
                        title="Editar nota (5 min)"
                        aria-label="Editar nota"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
        {/* Channel selector (chips, sin dropdown — Fitts 1954: targets grandes) */}
        <div className="flex gap-1 flex-wrap">
          {(Object.entries(CHANNEL_META) as Array<[NoteChannel, typeof CHANNEL_META.GENERAL]>).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setChannel(key)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium',
                'transition-colors motion-reduce:transition-none',
                channel === key
                  ? meta.chip
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300',
              )}
            >
              <span className={cn('inline-block w-1.5 h-1.5 rounded-full', meta.dot)} />
              {meta.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // IME composition fix (W2-06): no submit mid-acento/CJK.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Escribe una nota… (⌘/Ctrl + Enter envía)"
            rows={2}
            maxLength={2000}
            className={cn(
              'flex-1 text-sm border border-slate-300 rounded-md px-2.5 py-1.5 resize-none',
              'focus:outline-none focus:ring-2 focus:ring-emerald-400',
              shakeClass,
            )}
          />
          <Button
            type="button"
            size="sm"
            disabled={createMut.isPending}
            onClick={submit}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {createMut.isPending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
