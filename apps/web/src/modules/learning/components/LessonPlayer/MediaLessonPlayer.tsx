/**
 * MediaLessonPlayer.tsx — Audio + Video + PDF players con tracking de progress.
 *
 * Tracking pattern:
 *   - HTML5 <audio>/<video> emit ontimeupdate → debounced 5s → onProgressTick(currentTime)
 *   - PDF: scroll position approximation (no exacto sin pdf.js completo — Fase 1.2 mejora)
 *
 * Para WCAG 2.1 AA:
 *   - Audio: transcript link visible siempre
 *   - Video: caption preferences respetadas (browser native)
 *   - PDF: alternative download link
 */
import { useEffect, useRef, useState } from 'react'
import { FileText, Volume2 } from 'lucide-react'

interface MediaPlayerProps {
  url: string
  initialBookmarkPosition?: number
  onProgressTick: (positionSeconds: number, isCompleted: boolean) => void
}

// ──────────────────────────── Audio ────────────────────────────────────

export function AudioLessonPlayer({
  url,
  transcriptText,
  initialBookmarkPosition,
  onProgressTick,
}: MediaPlayerProps & { transcriptText?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !initialBookmarkPosition) return
    audio.currentTime = initialBookmarkPosition
  }, [initialBookmarkPosition])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <Volume2 className="h-4 w-4 text-emerald-600" />
          Audio lesson
        </div>
        <audio
          ref={audioRef}
          src={url}
          controls
          className="w-full"
          preload="metadata"
          onTimeUpdate={(e) => {
            const audio = e.currentTarget
            // Debounce vía rAF — track cada ~5s aprox
            if (audio.currentTime > 0 && Math.floor(audio.currentTime) % 5 === 0) {
              const isCompleted = audio.duration > 0 && audio.currentTime / audio.duration >= 0.95
              onProgressTick(audio.currentTime, isCompleted)
            }
          }}
          onEnded={(e) => onProgressTick(e.currentTarget.duration, true)}
        />
      </div>

      {transcriptText && (
        <details
          className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
          open={showTranscript}
          onToggle={(e) => setShowTranscript(e.currentTarget.open)}
        >
          <summary className="cursor-pointer font-medium text-slate-700">
            Transcripción
          </summary>
          <div className="mt-3 whitespace-pre-wrap text-slate-700">{transcriptText}</div>
        </details>
      )}
    </div>
  )
}

// ──────────────────────────── Video ────────────────────────────────────

export function VideoLessonPlayer({
  url,
  transcriptText,
  initialBookmarkPosition,
  onProgressTick,
}: MediaPlayerProps & { transcriptText?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !initialBookmarkPosition) return
    video.currentTime = initialBookmarkPosition
  }, [initialBookmarkPosition])

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        className="w-full rounded-lg bg-black"
        preload="metadata"
        onTimeUpdate={(e) => {
          const video = e.currentTarget
          if (video.currentTime > 0 && Math.floor(video.currentTime) % 5 === 0) {
            const isCompleted =
              video.duration > 0 && video.currentTime / video.duration >= 0.95
            onProgressTick(video.currentTime, isCompleted)
          }
        }}
        onEnded={(e) => onProgressTick(e.currentTarget.duration, true)}
      />

      {transcriptText && (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            Transcripción
          </summary>
          <div className="mt-3 whitespace-pre-wrap text-slate-700">{transcriptText}</div>
        </details>
      )}
    </div>
  )
}

// ──────────────────────────── PDF ──────────────────────────────────────

export function PdfLessonPlayer({
  url,
  onProgressTick,
}: MediaPlayerProps) {
  // Fase 1.1 — iframe básico. Fase 1.2 mobile + web mejora con pdf.js para
  // scroll tracking exacto + annotations.
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white">
        <iframe
          src={url}
          title="PDF lesson"
          className="h-[70vh] w-full rounded-lg"
        />
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-emerald-700 underline"
        >
          <FileText className="h-4 w-4" /> Descargar PDF
        </a>
        <button
          type="button"
          onClick={() => onProgressTick(0, true)}
          className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50"
        >
          Marcar como leído
        </button>
      </div>
    </div>
  )
}
