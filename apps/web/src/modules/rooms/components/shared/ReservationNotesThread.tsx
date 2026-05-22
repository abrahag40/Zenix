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
  // Filtro de visualización: null = mostrar todas. Independiente del channel
  // de composición (un usuario puede filtrar por LIMPIEZA pero crear una INTERNAL).
  const [filterChannel, setFilterChannel] = useState<NoteChannel | null>(null)
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
  const allNotesUnfiltered: DisplayNote[] = useMemo(() => {
    return [...serverNotes, ...pending]
  }, [serverNotes, pending])

  // Aplicar filtro de visualización (si hay).
  const allNotes: DisplayNote[] = useMemo(() => {
    if (!filterChannel) return allNotesUnfiltered
    return allNotesUnfiltered.filter((n) => n.channel === filterChannel)
  }, [allNotesUnfiltered, filterChannel])

  // Contadores per-channel para badges en el filter row.
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of allNotesUnfiltered) {
      counts[n.channel] = (counts[n.channel] ?? 0) + 1
    }
    return counts
  }, [allNotesUnfiltered])

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
      {/* Filtro por channel — fila única horizontal-scroll si overflow.
          Apple HIG / Linear / iOS Mail pattern.
          · "Todas" muestra count total (ancla la información agregada).
          · Channel chips: solo label + dot (sin count individual) → 5 chips
            caben en una fila a 340px de sidebar.
          · `flex-nowrap` + `overflow-x-auto` con scrollbar oculto → escala
            cuando se agreguen channels nuevos. */}
      {allNotesUnfiltered.length > 0 && (
        <div className="mb-2.5 pb-2.5 border-b border-slate-100">
          <style>{`.notes-filter-row::-webkit-scrollbar { display: none; }`}</style>
          <div
            className="notes-filter-row flex gap-1 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as unknown as 'auto' }}
          >
              <button
                type="button"
                onClick={() => setFilterChannel(null)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                  filterChannel === null
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                Todas
                <span className="tabular-nums opacity-70">{allNotesUnfiltered.length}</span>
              </button>
              {(Object.entries(CHANNEL_META) as Array<[NoteChannel, typeof CHANNEL_META.GENERAL]>).map(([key, meta]) => {
                const n = channelCounts[key] ?? 0
                if (n === 0) return null
                const active = filterChannel === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterChannel(active ? null : key)}
                    aria-pressed={active}
                    title={`${meta.label} · ${n}`}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                      active
                        ? meta.chip
                        : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300',
                    )}
                  >
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', meta.dot)} />
                    {meta.label}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Lista — surface cool-blue muted (Telegram-inspired, Mehrabian-Russell
          1974 PAD: baja Arousal + alta Pleasure). Hace contrast con bubbles
          blancas de otros usuarios sin clashar con emerald de mine. */}
      <div
        className="flex-1 overflow-y-auto space-y-2 px-2.5 py-2.5 rounded-lg border border-slate-200"
        style={{ backgroundColor: '#E8EFF7' }}
      >
        {notesQuery.isLoading ? (
          <p className="text-xs text-slate-400 py-4 text-center">Cargando…</p>
        ) : allNotes.length === 0 ? (
          allNotesUnfiltered.length === 0 ? (
            // Truly empty — illustration + centered copy (Apple HIG empty state pattern).
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center px-6 py-8">
              <svg
                viewBox="0 0 96 96"
                className="w-20 h-20 mb-4"
                aria-hidden
              >
                {/* Soft mint halo */}
                <circle cx="48" cy="48" r="42" fill="#ECFDF5" />
                {/* Chat bubble — emerald stroke + dots inside (Telegram empty-state metaphor) */}
                <path
                  d="M24 38 a10 10 0 0 1 10 -10 L62 28 a10 10 0 0 1 10 10 L72 56 a10 10 0 0 1 -10 10 L44 66 L36 74 L36 66 L34 66 a10 10 0 0 1 -10 -10 Z"
                  fill="#FFFFFF"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="38" cy="47" r="2.6" fill="#10B981" />
                <circle cx="48" cy="47" r="2.6" fill="#10B981" />
                <circle cx="58" cy="47" r="2.6" fill="#10B981" />
                {/* Small accent bubble — paper plane / outgoing message hint */}
                <path
                  d="M68 22 L84 28 L78 32 L82 38 L72 36 L68 22 Z"
                  fill="#A7F3D0"
                  stroke="#059669"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-sm font-semibold text-slate-700">
                Conversación vacía
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-[220px] leading-snug">
                Inicia la bitácora del equipo — comparte solicitudes, observaciones o coordinaciones sobre esta reserva.
              </p>
            </div>
          ) : (
            // Filtro activo sin resultados — empty state secundario, compacto.
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-6 py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21 L16.65 16.65" />
                </svg>
              </div>
              <p className="text-xs font-medium text-slate-600">
                Sin notas en este filtro
              </p>
              <button
                type="button"
                onClick={() => setFilterChannel(null)}
                className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium underline-offset-2 hover:underline"
              >
                Ver todas
              </button>
            </div>
          )
        ) : (
          allNotes.map((n) => {
            const mine = n.authorId === currentUserId
            const meta = CHANNEL_META[n.channel] ?? CHANNEL_META.GENERAL
            const ageMs = Date.now() - new Date(n.createdAt).getTime()
            const canEdit = !n.__pending && mine && ageMs < EDIT_WINDOW_MS
            const isEditing = editingId === n.id

            const displayName = mine ? 'Tú' : `Staff ${n.authorId.slice(0, 4)}`
            const initials =
              (displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?')
            // Hash-derived hue para avatar de otros (BitacoraChat pattern).
            const hue =
              Array.from(n.authorId).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360
            const avatarBg = `hsl(${hue}, 65%, 55%)`

            return (
              <div
                key={n.id}
                className={cn('flex gap-1.5 items-end group', mine ? 'justify-end' : 'justify-start')}
              >
                {!mine && (
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm"
                    style={{ backgroundColor: avatarBg }}
                    title={displayName}
                  >
                    {initials}
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
                    mine
                      ? 'bg-emerald-500 text-white rounded-br-sm'
                      : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100',
                    n.__pending && 'opacity-60',
                  )}
                >
                  {/* Header inline: nombre del autor (solo other) + chip de channel.
                      Ahorra espacio vertical vs colocar el chip en su propia fila. */}
                  <div className="flex items-center gap-1.5 mb-1">
                    {!mine && (
                      <span className="text-[10px] font-semibold" style={{ color: avatarBg }}>
                        {displayName}
                      </span>
                    )}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] font-medium',
                        mine ? 'bg-white/20 text-white' : meta.chip,
                      )}
                    >
                      <span
                        className={cn('inline-block w-1 h-1 rounded-full', mine ? 'bg-white/80' : meta.dot)}
                      />
                      {meta.label}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-1.5 mt-1">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        className="w-full text-[13px] border border-emerald-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-800 bg-white"
                        autoFocus
                      />
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          type="button" size="sm" variant="ghost"
                          onClick={() => { setEditingId(null); setEditDraft('') }}
                          disabled={editMut.isPending}
                          className={cn('text-[11px] h-6 px-2', mine && 'text-white hover:bg-white/15 hover:text-white')}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button" size="sm"
                          onClick={commitEditNote}
                          disabled={editMut.isPending}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-6 px-2"
                        >
                          {editMut.isPending ? 'Guardando…' : 'Guardar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] leading-snug whitespace-pre-wrap break-words">
                      {n.content}
                    </p>
                  )}

                  {/* Footer: timestamp + edit pencil */}
                  <div
                    className={cn(
                      'text-[9.5px] tabular-nums mt-0.5 flex items-center justify-end gap-1.5',
                      mine ? 'text-emerald-50/80' : 'text-slate-400',
                    )}
                  >
                    {n.editedAt && !n.__pending && <span className="italic">editada</span>}
                    <span>
                      {n.__pending
                        ? 'Enviando…'
                        : format(parseISO(n.createdAt), 'HH:mm', { locale: es })}
                    </span>
                    {canEdit && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditNote(n)}
                        className={cn(
                          'opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity',
                          mine ? 'text-white' : 'text-slate-500',
                        )}
                        title="Editar nota (5 min)"
                        aria-label="Editar nota"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
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
              // Enter envía. Shift+Enter inserta newline (patrón Telegram/Slack).
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Escribe una nota…"
            rows={1}
            maxLength={2000}
            className={cn(
              'flex-1 text-sm border border-slate-300 rounded-full px-3.5 py-2 resize-none leading-tight',
              'focus:outline-none focus:ring-2 focus:ring-emerald-400',
              shakeClass,
            )}
          />
          <button
            type="button"
            disabled={createMut.isPending || draft.trim().length === 0}
            onClick={submit}
            aria-label={createMut.isPending ? 'Enviando' : 'Enviar nota'}
            className={cn(
              'h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95',
              'text-white flex items-center justify-center shrink-0 shadow-sm',
              'disabled:opacity-50 disabled:scale-100 transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
