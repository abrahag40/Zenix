/**
 * PrecheckinPage — Sprint AUTO-CHECKIN Fase 2 (mini web-app del huésped).
 *
 * Ruta PÚBLICA `/precheckin/:token` que el huésped abre desde su celular (link
 * del email pre-arrival). Muestra sus datos PRE-CARGADOS de Channex para que los
 * confirme/corrija + captura una foto de su ID desde la cámara del móvil. Al
 * enviar, el backend escribe los datos en la reserva (write-back con
 * `guestVerifiedFields`) → agiliza el check-in en recepción.
 *
 * Seguridad/privacidad: el token (en la URL) es el único gate; el ID interno
 * nunca se expone. Aviso de privacidad + consentimiento obligatorio (LFPDPPP).
 * La carga es OPCIONAL — si el huésped no la completa, el check-in es el normal.
 *
 * Mobile-first. Estados: loading / ready / expired / notfound / submitted / error.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { cn } from '@/lib/utils'

interface PrecheckinContext {
  guestFirstName: string | null
  guestLastName: string | null
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  nationality: string | null
  guestSex: string | null
  documentType: string | null
  propertyName: string | null
  checkIn: string
  checkOut: string
  alreadySubmitted: boolean
  photoCaptured: boolean
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; ctx: PrecheckinContext }
  | { kind: 'expired'; message: string }
  | { kind: 'notfound' }
  | { kind: 'submitted'; photoCaptured: boolean }

const DOC_TYPES = [
  { value: 'passport', label: 'Pasaporte' },
  { value: 'ine', label: 'INE / Credencial de elector' },
  { value: 'id_card', label: 'Cédula / DNI' },
  { value: 'license', label: 'Licencia de conducir' },
  { value: 'other', label: 'Otro documento oficial' },
]

/** Comprime una imagen a JPEG ~1600px / calidad 0.8 → data URI. El backend
 *  re-procesa con Sharp; esto solo reduce el payload del móvil. */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Imagen inválida'))
      img.onload = () => {
        const MAX = 1600
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const r = Math.min(MAX / width, MAX / height)
          width = Math.round(width * r)
          height = Math.round(height * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas no disponible'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function PrecheckinPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  // Form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nationality, setNationality] = useState('')
  const [docType, setDocType] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [propertyName, setPropertyName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ctx = await api.get<PrecheckinContext>(`/v1/precheckin/${token}`)
        if (!active) return
        setFirstName(ctx.guestFirstName ?? '')
        setLastName(ctx.guestLastName ?? '')
        setEmail(ctx.guestEmail ?? '')
        setPhone(ctx.guestPhone ?? '')
        setNationality(ctx.nationality ?? '')
        setDocType(ctx.documentType ?? '')
        setPropertyName(ctx.propertyName)
        setState(ctx.alreadySubmitted ? { kind: 'submitted', photoCaptured: ctx.photoCaptured } : { kind: 'ready', ctx })
      } catch (err) {
        if (!active) return
        // Mapeo de estados: 410 = expirado/cancelado/checkout (link válido pero
        // ya no usable) → "expirado". 404 (no existe) y 400 (token corto/
        // truncado) → "inválido". Cualquier otro (red/500) → "inválido" con copy
        // de reintento. Bug-hunt 2026-06-11: antes un token <32 char (400) caía
        // en el else y mostraba "expirado" en vez de "inválido".
        const status = err instanceof ApiError ? err.status : 0
        if (status === 410) setState({ kind: 'expired', message: '' })
        else setState({ kind: 'notfound' })
      }
    })()
    return () => { active = false }
  }, [token])

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    if (file.size > 15 * 1024 * 1024) { setPhotoError('La imagen es muy grande (máx 15MB).'); return }
    try {
      setPhoto(await compressImage(file))
    } catch {
      setPhotoError('No se pudo procesar la imagen. Intenta otra foto.')
    }
  }

  async function onSubmit() {
    if (!consent) { setSubmitError('Acepta el aviso de privacidad para continuar.'); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await api.post<{ ok: boolean; photoCaptured: boolean }>(`/v1/precheckin/${token}`, {
        guestFirstName: firstName || undefined,
        guestLastName: lastName || undefined,
        guestEmail: email || undefined,
        guestPhone: phone || undefined,
        nationality: nationality || undefined,
        documentType: docType || undefined,
        photoBase64: photo || undefined,
        consentAccepted: true,
      })
      setState({ kind: 'submitted', photoCaptured: res.photoCaptured })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
        setState({ kind: 'expired', message: err.message })
      } else {
        setSubmitError(err instanceof ApiError ? err.message : 'No se pudo enviar. Intenta de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center px-4 py-6">
      <div className="w-full max-w-md">
        {state.kind === 'loading' && <LoadingScreen />}

        {state.kind === 'notfound' && (
          <StatusScreen tone="warn" propertyName={propertyName}
            title="Este link no es válido"
            body="No pudimos reconocer tu link de pre-check-in. Es posible que esté incompleto — vuelve a abrirlo desde tu correo, o escríbele a tu hotel." />
        )}

        {state.kind === 'expired' && (
          <StatusScreen tone="warn" propertyName={propertyName}
            title="Tu link expiró"
            body="Por seguridad, los links de pre-check-in caducan. Pídele uno nuevo a tu hotel y lo completas en un minuto." />
        )}

        {state.kind === 'submitted' && (
          <StatusScreen tone="ok" propertyName={propertyName}
            title="¡Pre-check-in completo!"
            body={state.photoCaptured
              ? 'Tu identidad y tu documento quedaron registrados. Tu llegada será mucho más rápida — solo pasa a recepción por tu llave.'
              : 'Tus datos quedaron registrados. Recuerda traer tu identificación para mostrarla al llegar a recepción.'}
            sub={propertyName ? `Nos vemos pronto en ${propertyName}` : 'Nos vemos pronto'} />
        )}

        {state.kind === 'ready' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl overflow-hidden shadow bg-gradient-to-br from-emerald-600 to-emerald-500 p-5 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-50">{state.ctx.propertyName ?? 'Tu hotel'}</div>
              <h1 className="text-xl font-extrabold mt-1">Pre-check-in</h1>
              <p className="text-emerald-50 text-sm mt-1">
                Llegada {fmtDate(state.ctx.checkIn)} · Salida {fmtDate(state.ctx.checkOut)}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow p-5 space-y-4">
              <p className="text-sm text-slate-600">
                Confirma tus datos (los pre-cargamos de tu reserva) y sube una foto de tu identificación.
                Es <strong>opcional</strong> pero te ahorra tiempo en recepción.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre(s)"><input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} /></Field>
                <Field label="Apellido(s)"><input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} /></Field>
              </div>
              <Field label="Email"><input type="email" inputMode="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono"><input type="tel" inputMode="tel" className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
                <Field label="Nacionalidad (país)"><input className={inputCls} maxLength={2} placeholder="MX" value={nationality} onChange={e => setNationality(e.target.value.toUpperCase())} /></Field>
              </div>
              <Field label="Tipo de documento">
                <select className={inputCls} value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </Field>

              {/* Photo capture */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1.5">Foto de tu identificación</div>
                {photo ? (
                  <div className="relative">
                    <img src={photo} alt="ID" className="w-full rounded-xl border border-slate-200 object-cover max-h-56" />
                    <button onClick={() => setPhoto(null)}
                      className="absolute top-2 right-2 bg-black/60 text-white text-xs rounded-full px-3 py-1">Cambiar</button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-emerald-300 rounded-xl py-7 cursor-pointer bg-emerald-50/40 active:bg-emerald-50">
                    <span className="text-2xl">📷</span>
                    <span className="text-sm font-semibold text-emerald-700">Tomar / subir foto</span>
                    <span className="text-[11px] text-slate-500">Pasaporte, INE o ID oficial</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
                  </label>
                )}
                {photoError && <p className="text-xs text-rose-600 mt-1">{photoError}</p>}
              </div>

              {/* Privacy + consent */}
              <label className="flex items-start gap-2.5 pt-1">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span className="text-[12px] text-slate-500 leading-snug">
                  Acepto que mis datos e identificación se usen únicamente para gestionar mi hospedaje, conforme al aviso de privacidad (LFPDPPP). Mis datos no se comparten con terceros con fines comerciales.
                </span>
              </label>

              {submitError && <p className="text-sm text-rose-600">{submitError}</p>}

              <button onClick={onSubmit} disabled={submitting || !consent}
                className="w-full bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl py-3 active:bg-emerald-700">
                {submitting ? 'Enviando…' : 'Enviar mi pre-check-in'}
              </button>
              <p className="text-center text-[11px] text-slate-400">Zenix nunca te pedirá tu contraseña ni datos de pago por este medio.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inputCls = 'w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

/** Spinner branded mientras carga el contexto (no el "Cargando…" plano). */
function LoadingScreen() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 rounded-full border-[3px] border-emerald-200 border-t-emerald-600 animate-spin" />
      <p className="text-sm text-slate-400">Preparando tu pre-check-in…</p>
    </div>
  )
}

/**
 * Pantalla de estado profesional (éxito / aviso) — reemplaza las tarjetas
 * genéricas con emoji. Icono SVG en anillo con halo, jerarquía tipográfica,
 * eyebrow con la propiedad, microcopy de apoyo y firma de marca.
 */
function StatusScreen({
  tone, title, body, sub, propertyName,
}: { tone: 'ok' | 'warn'; title: string; body: string; sub?: string; propertyName?: string | null }) {
  const ok = tone === 'ok'
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-3">
      {propertyName && (
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-7">{propertyName}</div>
      )}
      <div className="relative mb-7">
        <div className={cn('absolute inset-0 rounded-full blur-2xl opacity-40', ok ? 'bg-emerald-400' : 'bg-amber-300')} />
        <div className={cn(
          'relative h-[88px] w-[88px] rounded-full flex items-center justify-center shadow-xl ring-8',
          ok ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 ring-emerald-500/10'
             : 'bg-gradient-to-br from-amber-400 to-amber-500 ring-amber-400/10',
        )}>
          {ok ? <CheckIcon /> : <AlertIcon />}
        </div>
      </div>
      <h1 className="text-[23px] font-extrabold tracking-tight text-slate-800 max-w-[300px]">{title}</h1>
      <p className="text-[15px] text-slate-500 mt-3 max-w-[320px] leading-relaxed">{body}</p>
      {sub && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white shadow-sm ring-1 ring-slate-200/70 px-4 py-2 text-[12.5px] font-semibold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {sub}
        </div>
      )}
      <div className="mt-12 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-300">
        <ShieldIcon /> Pre-check-in seguro · Zenix
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" /><path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  )
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}
