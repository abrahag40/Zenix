/**
 * DocumentPhotoCapture — captura de foto del documento del huésped.
 *
 * Componente aislado, reusable. Tres estados:
 *  (1) IDLE — empty state card dashed con CTA cámara + cargar archivo.
 *  (2) STREAMING — preview en vivo de la webcam con Capturar + Cancelar.
 *  (3) CAPTURED — preview de la foto + footer "DOCUMENTO CAPTURADO" +
 *      acciones Reemplazar · Subir archivo (formato pixel-perfect del 3er
 *      mockup aprobado por owner 2026-05-29).
 *
 * Visa CRR 13.1/13.7 chargeback evidence: el componente garantiza que la
 * foto resultante tenga resolución suficiente (1280x720 ideal) y formato
 * JPEG 0.85 quality (~150-250KB base64).
 *
 * Sprint CHECK-IN C1.11 (2026-05-29) — extraído de ConfirmCheckinDialog
 * para reuso futuro (CheckInDialog walk-in, BookingDetailSheet edit, etc).
 *
 * Pattern Apple HIG card preview + Material Design 3 outlined CTAs.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { Camera, Upload, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DocumentPhotoCaptureProps = {
  /** data URI base64 de la foto capturada, o null si idle */
  photoDataUrl: string | null
  /** ref al input file hidden — el caller lo gestiona para integrarse con
   *  su propio handler (e.g. confirmCheckin DTO recibe photoDataUrl) */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** disparado cuando el user sube archivo o captura con cámara */
  onChange:     (e: React.ChangeEvent<HTMLInputElement>) => void
  /** disparado al quitar la foto capturada */
  onRemove:     () => void
  /** altura mínima del estado idle (default 220px). Útil para igualar
   *  alturas con cards hermanas (e.g. card de identidad) en layouts grid. */
  minHeight?:   string
  /** mostrar header con label "FOTO DEL DOCUMENTO * — Visa CRR evidence".
   *  Default true; ponlo false si el caller ya provee su propio header. */
  showHeader?:  boolean
  /** CHECK-IN C1.18 — true cuando el caller intentó confirmar sin foto.
   *  Render: border rojo en el card idle + shake animation. */
  hasError?:    boolean
  /** Counter que incrementa cada intento de confirm inválido. Cambio del
   *  valor retriggea la animación shake (key prop interna). */
  shakeNonce?:  number
}

export const DocumentPhotoCapture = memo(function DocumentPhotoCapture({
  photoDataUrl, fileInputRef, onChange, onRemove,
  minHeight = '220px',
  showHeader = true,
  hasError = false,
  shakeNonce = 0,
}: DocumentPhotoCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // CHECK-IN C1.17 (2026-05-29) — bug fix REC prematuro / black screen.
  // Antes: REC badge aparecía instant cuando setStream(), pero el primer
  // frame podía tardar 300-1500ms en decodificar → user veía black.
  // Fix: track `videoReady` = video.onPlaying. REC y captureFrame solo
  // disponibles cuando el video DE VERDAD está reproduciendo frames.
  const [videoReady, setVideoReady] = useState(false)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Cleanup del stream al desmontar (libera la webcam LED)
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  // CHECK-IN C1.17 — wire srcObject + play() en useEffect post-mount del
  // <video>. Antes usábamos requestAnimationFrame inmediatamente después
  // de setStream, lo cual podía correr ANTES de que React montara el
  // <video> en DOM (videoRef.current = null). useEffect garantiza que
  // el elemento ya está en DOM y videoRef.current es válido.
  useEffect(() => {
    if (!stream || !videoRef.current) return
    const video = videoRef.current
    video.srcObject = stream
    // play() retorna Promise; el .catch evita unhandled rejection en autoplay
    // bloqueado (raro en laptop, común en algunos navegadores móviles).
    void video.play().catch(() => { /* user interaction ya pasó (startCamera click) */ })
  }, [stream])

  async function startCamera() {
    setCameraError(null)
    setVideoReady(false)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      setStream(mediaStream)
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Permiso de cámara denegado. Usa "Subir archivo" como alternativa.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No se detectó cámara. Usa "Subir archivo".')
      } else {
        setCameraError('No se pudo iniciar la cámara. Usa "Subir archivo".')
      }
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    setVideoReady(false)
  }

  function captureFrame() {
    // CHECK-IN C1.17 — gate por videoReady: si el user spamea Capturar
    // antes de que el video tenga frames, evita salvar imagen 0×0.
    if (!videoRef.current || !canvasRef.current || !stream || !videoReady) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `documento-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        const syntheticEvent = {
          target: fileInputRef.current,
        } as unknown as React.ChangeEvent<HTMLInputElement>
        onChange(syntheticEvent)
      }
      stopCamera()
    }, 'image/jpeg', 0.85)
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {showHeader && (
        <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 px-0.5 flex items-center gap-1.5">
          <Camera className="h-3 w-3 text-slate-400" />
          Foto del documento
          <span className="text-rose-500 normal-case font-normal">*</span>
        </h3>
      )}

      {/* Estado CAPTURED — preview centrado + footer Reemplazar · Subir archivo.
          Pattern pixel-perfect del mockup aprobado: imagen 4:3 contained,
          footer rounded con divider central. Apple HIG photos card style. */}
      {photoDataUrl ? (
        <div className="flex-1 rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="relative flex-1 bg-slate-50 flex items-center justify-center min-h-[180px]">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              title="Ver en grande"
              className="block w-full h-full flex items-center justify-center cursor-zoom-in"
            >
              <img
                src={photoDataUrl}
                alt="Documento del huésped"
                className="max-w-full max-h-full object-contain p-2"
              />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 bg-white/95 hover:bg-white text-slate-700 rounded-full p-1.5 shadow-sm border border-slate-200 transition-colors"
              aria-label="Quitar foto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="border-t border-slate-100 px-2 py-2.5 flex flex-col items-center text-center gap-2">
            <div className="inline-flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wider whitespace-nowrap">
              <Check className="h-3 w-3 shrink-0" />
              Capturado
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 whitespace-nowrap">
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-1 hover:text-emerald-700 transition-colors"
              >
                <Camera className="h-3 w-3" />
                Reemplazar
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 hover:text-emerald-700 transition-colors"
              >
                <Upload className="h-3 w-3" />
                Subir
              </button>
            </div>
          </div>
        </div>
      ) : stream ? (
        /* Estado STREAMING — cámara activa con preview en vivo.
           CHECK-IN C1.17: loading state + videoReady gate evitan "black
           screen" engañoso. REC y Capturar SOLO disponibles cuando el video
           reproduce frames reales (onPlaying event). */
        <div className="flex-1 space-y-2">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-300">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onPlaying={() => setVideoReady(true)}
              onLoadedData={() => setVideoReady(true)}
              className="w-full max-h-64 object-contain bg-black"
            />
            {/* REC badge — SOLO cuando hay frames reales reproduciendo */}
            {videoReady && (
              <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                REC
              </div>
            )}
            {/* Loading overlay — mientras la cámara inicializa frames */}
            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-white">
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
                <span className="text-[11px] font-medium">Iniciando cámara…</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={captureFrame}
              disabled={!videoReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-medium h-9 rounded-md flex items-center justify-center gap-1.5 transition-colors"
            >
              <Camera className="h-4 w-4" />
              Capturar
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium h-9 rounded-md transition-colors"
            >
              Cancelar
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      ) : (
        /* Estado IDLE — empty state card dashed con CTAs.
           CHECK-IN C1.18: red border + shake cuando hasError (estándar Zenix
           para campos requeridos no llenados al click confirmar). */
        <div
          key={`idle-${shakeNonce}`}
          className={cn(
            'flex-1 rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center gap-3 transition-colors',
            hasError
              ? 'border-red-400 bg-red-50/40 shake-x'
              : 'border-slate-200 bg-slate-50/50',
          )}
          style={{ minHeight }}
        >
          <div className="h-14 w-14 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Camera className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">Sin foto del documento</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug max-w-[280px]">
              Capturada al check-in como evidencia (Visa §5.9.2). Cárgala ahora.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-[260px]">
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center justify-center gap-1.5 rounded-full
                         bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold
                         px-3 py-2 shadow-sm transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              Tomar con cámara
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full
                         bg-white hover:bg-slate-100 border border-slate-200
                         text-slate-700 text-xs font-semibold px-3 py-2 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Cargar archivo
            </button>
          </div>
          {cameraError && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug max-w-[280px]">
              {cameraError}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
      />

      {/* Lightbox — click foto thumbnail abre vista grande full-viewport.
          Click overlay o Esc cierra. Pattern Apple Photos / Google Photos. */}
      {lightboxOpen && photoDataUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxOpen(false)}
          role="dialog"
          aria-label="Vista ampliada del documento"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
            aria-label="Cerrar"
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={photoDataUrl}
            alt="Documento del huésped (ampliado)"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
})
