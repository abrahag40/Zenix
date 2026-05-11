/**
 * PhotoGallery.tsx — Sprint Mx-1B-W2
 *
 * Tab "Fotos" del TicketDetailDrawer. Compone:
 *   1. PhotoComposer arriba (drag-drop + selector cámara + before/after toggle)
 *   2. Grid de fotos existentes (con lightbox al clickear)
 *
 * Reglas UX:
 *   · Subida client-side comprimida (browser-image-compression, max 1920px @ 0.85)
 *   · Progreso visible mientras procesa + sube (Apple HIG feedback inmediato)
 *   · Antes/después separadas visualmente (Baymard 2022 — evidencia visual
 *     reduce disputas 73%)
 *   · Lightbox simple: full-screen overlay con cerrar por ESC o click fuera
 */
import { useCallback, useState, useRef } from 'react'
import { Camera, Upload, X, Image as ImageIcon, CheckCircle2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { MaintenanceTicketPhotoDto } from '@zenix/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { uploadsApi } from '../../../api/uploads.api'
import { useAddPhoto } from '../hooks/useMaintenanceTickets'

interface Props {
  ticketId: string
  photos: MaintenanceTicketPhotoDto[]
  /** En RESOLVED, el supervisor verifica calidad — la UI sugiere "Después". */
  suggestAfterPhoto: boolean
}

export function PhotoGallery({ ticketId, photos, suggestAfterPhoto }: Props) {
  const addPhoto = useAddPhoto(ticketId)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isAfter, setIsAfter] = useState(suggestAfterPhoto)
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(
    async (file: File) => {
      if (uploading) return
      if (!file.type.startsWith('image/')) {
        toast.error('Solo se permiten imágenes (JPEG, PNG, WebP).')
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
        // Reset hidden file input para permitir re-elegir mismo archivo
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo subir la foto', { id })
      } finally {
        setUploading(false)
      }
    },
    [uploading, addPhoto, isAfter, caption],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void upload(file)
    },
    [upload],
  )

  // Separar antes/después visualmente
  const beforePhotos = photos.filter((p) => !p.isAfterPhoto)
  const afterPhotos = photos.filter((p) => p.isAfterPhoto)

  return (
    <div className="space-y-4 text-sm">
      {/* Composer */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-4 transition-colors',
          dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50',
          uploading && 'opacity-60 pointer-events-none',
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="h-6 w-6 text-slate-400" aria-hidden />
          <div>
            <p className="text-xs font-medium text-slate-700">
              Arrastra una imagen o selecciona archivo
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              JPEG / PNG / WebP · máx. 5MB · se comprime automáticamente
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
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
            disabled={uploading}
          >
            <Camera className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? 'Procesando…' : 'Elegir archivo'}
          </Button>
        </div>

        {/* Opciones de la próxima subida */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
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
      </div>

      {/* Galerías separadas antes/después */}
      {photos.length === 0 ? (
        <div className="text-center text-xs text-slate-400 py-4">
          <ImageIcon className="h-5 w-5 mx-auto mb-1 opacity-50" />
          Sin fotos todavía.
        </div>
      ) : (
        <>
          <PhotoGrid title="Antes" photos={beforePhotos} onOpen={setLightboxUrl} />
          <PhotoGrid title="Después" photos={afterPhotos} onOpen={setLightboxUrl} icon="after" />
        </>
      )}

      {/* Lightbox */}
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
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
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
  icon,
}: {
  title: string
  photos: MaintenanceTicketPhotoDto[]
  onOpen: (url: string) => void
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
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.url)}
            className="block rounded-lg overflow-hidden border border-slate-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <img src={p.url} alt={p.caption ?? ''} className="w-full h-28 object-cover" />
            <div className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50 text-left truncate">
              {p.caption ?? format(parseISO(p.createdAt), 'd MMM HH:mm', { locale: es })}
              {p.uploadedByName && ` · ${p.uploadedByName}`}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
