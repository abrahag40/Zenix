/**
 * PhotoGallery.tsx — Sprint Mx-1B-W2 (+ audit fixes W2-03/04/05/10/11).
 *
 * Tab "Fotos" del TicketDetailDrawer. Compone:
 *   1. PhotoComposer arriba (drag-drop + selector cámara + before/after toggle)
 *   2. Grid de fotos existentes (con lightbox al clickear + delete inline)
 *
 * Reglas UX (Mx-1B-W2 audit):
 *   · W2-03 Límite hard 3 fotos (forensic three-shot rule ASTM E2825 + Sweller
 *     cognitive load). Composer se deshabilita al llegar al límite.
 *   · W2-04 Soft-delete con patrón Instagram (30d retention vía cron Mx-1C).
 *     Solo SUPERVISOR o uploader original ve el botón eliminar.
 *   · W2-05 Toggle isAfter se RESETEA tras cada upload (no atrapa al user).
 *   · W2-10 Drop zone min-h-[140px] siguiendo Apple HIG / Baymard 2022.
 *   · W2-11 "🔚 Después" en vez de "✓ Después" (✓ implica "completado").
 */
import { useCallback, useState, useRef } from 'react'
import { Camera, Upload, X, Image as ImageIcon, CheckCircle2, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { JwtPayload, MaintenanceTicketPhotoDto } from '@zenix/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { uploadsApi, UploadValidationError } from '../../../api/uploads.api'
import { useAddPhoto, useDeletePhoto } from '../hooks/useMaintenanceTickets'

interface Props {
  ticketId: string
  photos: MaintenanceTicketPhotoDto[]
  /** En RESOLVED, el supervisor verifica calidad — la UI sugiere "Después". */
  suggestAfterPhoto: boolean
  actor: JwtPayload
}

const PHOTO_LIMIT = 3 // ver investigación en backend addPhoto: "three-shot rule"

export function PhotoGallery({ ticketId, photos, suggestAfterPhoto, actor }: Props) {
  const addPhoto = useAddPhoto(ticketId)
  const deletePhoto = useDeletePhoto(ticketId)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isAfter, setIsAfter] = useState(suggestAfterPhoto)
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const atLimit = photos.length >= PHOTO_LIMIT

  const upload = useCallback(
    async (file: File) => {
      if (uploading) return
      if (atLimit) {
        toast.error(`Máximo ${PHOTO_LIMIT} fotos por ticket. Elimina una para subir otra.`)
        return
      }
      setUploading(true)
      const id = toast.loading('Procesando imagen…')
      try {
        const uploaded = await uploadsApi.uploadImage(file, 'maintenance')
        toast.loading('Adjuntando al ticket…', { id })
        await addPhoto.mutateAsync({
          url: uploaded.url,
          isAfterPhoto: isAfter,
          caption: caption.trim() || undefined,
        })
        toast.success('Foto añadida', { id })
        setCaption('')
        // W2-05 fix — reset toggle al default (no atrapar al user en isAfter
        // sticky entre fotos consecutivas con contexto distinto).
        setIsAfter(suggestAfterPhoto)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (err) {
        const msg =
          err instanceof UploadValidationError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'No se pudo subir la foto'
        toast.error(msg, { id })
      } finally {
        setUploading(false)
      }
    },
    [uploading, atLimit, addPhoto, isAfter, caption, suggestAfterPhoto],
  )

  // W2-03 fix — drag-drop con N archivos: subir el primero + avisar.
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      if (files.length > 1) {
        toast(
          `Sube las imágenes una por una. Tomamos solo "${files[0].name}".`,
          { icon: 'ℹ️' },
        )
      }
      void upload(files[0])
    },
    [upload],
  )

  function onDeletePhoto(photo: MaintenanceTicketPhotoDto) {
    const ok = window.confirm(
      `¿Eliminar esta foto? Queda en histórico 30 días por si la necesitas recuperar.`,
    )
    if (!ok) return
    deletePhoto.mutate(photo.id)
  }

  const beforePhotos = photos.filter((p) => !p.isAfterPhoto)
  const afterPhotos = photos.filter((p) => p.isAfterPhoto)

  return (
    // Apple HIG spacing: section gap 20-24pt + composer 24pt padding.
    // Testing T-pixel-perfect: increased breathing room across the panel.
    <div className="flex flex-col gap-5 text-sm min-h-full">
      {/* Composer */}
      <div
        onDragOver={(e) => {
          if (atLimit) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (atLimit) {
            e.preventDefault()
            return
          }
          onDrop(e)
        }}
        className={cn(
          'border-2 border-dashed rounded-xl px-6 py-7 flex flex-col items-center justify-center transition-colors shrink-0',
          atLimit
            ? 'border-slate-200 bg-slate-100/60 opacity-60'
            : dragOver
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-300 bg-slate-50',
          uploading && 'opacity-60 pointer-events-none',
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Upload className="h-7 w-7 text-slate-400" aria-hidden />
          <div>
            <p className="text-xs font-medium text-slate-700">
              {atLimit
                ? `Límite de ${PHOTO_LIMIT} fotos alcanzado`
                : 'Arrastra una imagen o selecciona archivo'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {atLimit
                ? 'Elimina una existente para subir otra'
                : 'JPEG / PNG / WebP / HEIC · máx. 5 MB · se comprime automáticamente'}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || atLimit}
          >
            <Camera className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? 'Procesando…' : 'Elegir archivo'}
          </Button>
          <p className="text-[10px] text-slate-400 mt-1">
            {photos.length}/{PHOTO_LIMIT} fotos
          </p>
        </div>

        {!atLimit && (
          <div className="mt-4 pt-4 border-t border-slate-200 w-full flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={isAfter}
                onChange={(e) => setIsAfter(e.target.checked)}
                className="rounded"
              />
              Marcar como foto <strong>después</strong>
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Descripción opcional…"
              maxLength={120}
              className="flex-1 min-w-[160px] text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        // Testing T-tab-body-height: empty state ocupa el espacio restante
        // (flex-1) y centra visualmente — Apple HIG empty state pattern,
        // como Mail "No Messages" o Notes "No Notes".
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <ImageIcon className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">Sin fotos todavía</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            Sube hasta 3 fotos del problema o del trabajo terminado.
            Aparecerán aquí ordenadas por momento de captura.
          </p>
        </div>
      ) : (
        <>
          <PhotoGrid
            title="Antes"
            photos={beforePhotos}
            onOpen={setLightboxUrl}
            onDelete={onDeletePhoto}
            currentUserId={actor.sub}
            isSupervisor={actor.role === 'SUPERVISOR'}
          />
          <PhotoGrid
            title="Después"
            photos={afterPhotos}
            onOpen={setLightboxUrl}
            onDelete={onDeletePhoto}
            currentUserId={actor.sub}
            isSupervisor={actor.role === 'SUPERVISOR'}
            icon="after"
          />
        </>
      )}

      {lightboxUrl && (
        <div
          role="dialog"
          aria-label="Vista ampliada"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
          tabIndex={-1}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain cursor-default rounded-lg"
          />
        </div>
      )}
    </div>
  )
}

function PhotoGrid({
  title,
  photos,
  onOpen,
  onDelete,
  currentUserId,
  isSupervisor,
  icon,
}: {
  title: string
  photos: MaintenanceTicketPhotoDto[]
  onOpen: (url: string) => void
  onDelete: (p: MaintenanceTicketPhotoDto) => void
  currentUserId: string
  isSupervisor: boolean
  icon?: 'after'
}) {
  if (photos.length === 0) return null
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
        {icon === 'after' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
        {title} · {photos.length}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p) => {
          const canDelete = isSupervisor || p.uploadedById === currentUserId
          return (
            <div
              key={p.id}
              className="relative rounded-lg overflow-hidden border border-slate-200 group"
            >
              <button
                type="button"
                onClick={() => onOpen(p.url)}
                className="block w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <img
                  src={p.url}
                  alt={p.caption ?? ''}
                  className="w-full h-28 object-cover bg-slate-100"
                  onError={(e) => {
                    // Si la imagen no carga (404, CORS, etc), mostrar un
                    // placeholder con la URL para debug. Testing T-photo-web:
                    // sin esto el usuario veía "nada" sin entender por qué.
                    const img = e.currentTarget
                    img.style.display = 'none'
                    const parent = img.parentElement
                    if (parent && !parent.querySelector('.img-error-fallback')) {
                      const fb = document.createElement('div')
                      fb.className =
                        'img-error-fallback w-full h-28 bg-red-50 border border-red-200 ' +
                        'flex flex-col items-center justify-center text-[10px] text-red-700 p-1 text-center'
                      fb.innerHTML = `<div>⚠️ No se pudo cargar</div><div class="font-mono text-[9px] mt-1 truncate max-w-full">${p.url}</div>`
                      parent.appendChild(fb)
                    }
                  }}
                />
                <div className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50 text-left truncate">
                  {p.caption ?? format(parseISO(p.createdAt), 'd MMM HH:mm', { locale: es })}
                  {p.uploadedByName && ` · ${p.uploadedByName}`}
                </div>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(p)}
                  aria-label="Eliminar foto"
                  className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/55 text-white hover:bg-red-600/90 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
