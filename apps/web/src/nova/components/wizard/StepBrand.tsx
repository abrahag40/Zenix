/**
 * Step 2 — Brand (opcional skip).
 *
 * Brand es una capa OPCIONAL entre Organization y LegalEntity para
 * cuentas multi-property con marca comercial común (e.g. cadena de
 * hoteles boutique con identidad común pero entidades fiscales separadas).
 *
 * Default: skipped. Solo se activa si el cliente realmente tiene brand
 * separada del Organization (cadenas, no hostal individual).
 */
import { useRef, useState } from 'react'
import { Upload, X, ImagePlus, AlertCircle } from 'lucide-react'
import { useWizardStore } from '../../../store/wizard'
import { WizardLayout } from './WizardLayout'
import { Surface, Body, Subhead, Caption, Chip, Button } from '../../design-system'

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']

export function StepBrand() {
  const state = useWizardStore()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Heurística "ya tiene logo": cualquier valor en brandLogoUrl, sea URL http(s)
  // o data URI base64. Permite show preview + remove indistintamente.
  const hasLogo = state.brandLogoUrl.length > 0
  const isDataUri = state.brandLogoUrl.startsWith('data:image/')

  const handleFile = async (file: File | null | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!ACCEPTED_MIME.includes(file.type)) {
      setUploadError(`Formato no soportado (${file.type || 'desconocido'}). Usa PNG, JPG, SVG o WebP.`)
      return
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setUploadError(`Archivo de ${(file.size / 1024 / 1024).toFixed(1)} MB excede el máximo de 2 MB.`)
      return
    }
    // FileReader → data URI base64. Pattern MAINT-11 (mismo que Maintenance
    // photos). Migración a R2 + pre-signed URLs en sprint v1.0.4 IMG; el
    // backend acepta cualquier URL string en brandLogoUrl, sea http(s) o
    // data URI — el wizard transparente al swap futuro.
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        state.setField('brandLogoUrl', result)
      }
    }
    reader.onerror = () => setUploadError('Error leyendo el archivo. Intenta de nuevo.')
    reader.readAsDataURL(file)
  }

  return (
    <WizardLayout
      title="Brand (opcional)"
      description="Capa intermedia para cadenas con marca paraguas. Skippable para clientes single-property o sin brand corporate."
    >
      <Surface variant="raised" radius="lg" padding="lg" className="space-y-5">
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.brandEnabled}
              onChange={(e) => state.setField('brandEnabled', e.target.checked)}
              className="mt-0.5 rounded text-violet-600 focus:ring-violet-500/30 border-slate-300"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Subhead tone="primary">Habilitar Brand layer</Subhead>
                {!state.brandEnabled && (
                  <Chip variant="neutral" intent="subtle" size="sm">
                    Recomendado skip
                  </Chip>
                )}
              </div>
              <Caption tone="tertiary" className="block mt-1 leading-relaxed">
                Solo activar si el cliente es una cadena con identidad de marca compartida (logo,
                colores, dominio) sobre múltiples LegalEntities. Para boutique single-property,
                desactivar es lo correcto (Brand puede agregarse después sin migración).
              </Caption>
            </div>
          </label>
        </div>

        {state.brandEnabled && (
          <div className="space-y-4 pl-6 border-l-2 border-violet-200">
            <FieldRow label="Nombre del Brand">
              <input
                type="text"
                value={state.brandName}
                onChange={(e) => state.setField('brandName', e.target.value)}
                placeholder='Ej: "Tulum Collection Hotels"'
                className="w-full px-3.5 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </FieldRow>

            <FieldRow label="Logo del brand (opcional)">
              {/* Drag-and-drop + click-to-upload + URL paste, todo en uno */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  handleFile(e.dataTransfer.files?.[0])
                }}
                className={
                  'relative rounded-xl border-2 border-dashed transition-all p-5 ' +
                  (isDragging
                    ? 'border-violet-400 bg-violet-50/60'
                    : hasLogo
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-slate-300 bg-slate-50/40 hover:border-slate-400')
                }
              >
                {hasLogo ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-20 h-20 rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                      <img
                        src={state.brandLogoUrl}
                        alt="Logo preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-slate-900">
                        Logo cargado
                      </div>
                      <Caption tone="tertiary" className="block mt-0.5">
                        {isDataUri
                          ? `Archivo local (${Math.round(state.brandLogoUrl.length / 1024)} KB en base64)`
                          : 'URL externa'}
                      </Caption>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[12px] text-violet-700 hover:underline font-medium"
                        >
                          Reemplazar
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            state.setField('brandLogoUrl', '')
                            setUploadError(null)
                          }}
                          className="text-[12px] text-red-600 hover:underline font-medium"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-3 text-center">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200 text-slate-500 mb-2 shadow-sm">
                      <ImagePlus className="h-5 w-5" />
                    </div>
                    <div className="text-[13px] font-medium text-slate-700">
                      Arrastra el logo aquí
                    </div>
                    <Caption tone="tertiary" className="block mt-0.5">
                      PNG · JPG · SVG · WebP, máximo 2 MB
                    </Caption>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconLeft={Upload}
                      className="mt-3"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Elegir archivo
                    </Button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MIME.join(',')}
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>

              {uploadError && (
                <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
                  <Caption tone="secondary" className="text-[11px] text-red-900">
                    {uploadError}
                  </Caption>
                </div>
              )}

              {/* URL paste fallback — para CDNs que ya tiene el cliente */}
              <details className="mt-3 group">
                <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700 list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                  ¿Tienes el logo en una URL pública? Pégala aquí
                </summary>
                <input
                  type="url"
                  value={isDataUri ? '' : state.brandLogoUrl}
                  onChange={(e) => state.setField('brandLogoUrl', e.target.value)}
                  placeholder="https://cdn.cliente.com/logo.png"
                  className="mt-2 w-full px-3.5 h-9 rounded-lg border border-slate-300 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <Caption tone="tertiary" className="block mt-1 text-[10px]">
                  Útil si el cliente ya tiene el logo hospedado (Cloudinary, S3, Imgur, etc.).
                  Migración futura a R2 con pre-signed URLs en sprint v1.0.4 IMG.
                </Caption>
              </details>
            </FieldRow>
          </div>
        )}

        {!state.brandEnabled && (
          <Surface variant="sunken" radius="md" padding="md">
            <Body tone="secondary" className="text-[12px]">
              <span className="font-semibold text-slate-900">Brand desactivado:</span> la Organization
              creada en Step 1 actuará como root identity. Si más tarde el cliente quiere agregar
              Brand layer, se hace con un{' '}
              <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">UPDATE</code> sin
              data migration.
            </Body>
          </Surface>
        )}
      </Surface>
    </WizardLayout>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Subhead tone="secondary" className="block mb-1.5">
        {label}
      </Subhead>
      {children}
    </label>
  )
}
