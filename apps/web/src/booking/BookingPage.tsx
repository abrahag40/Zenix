/**
 * BookingPage — BOOKING-ENGINE B5. Hosted page pública `book.zenix.com/{slug}`
 * (en dev: /book/:slug). Reference implementation del motor "Zenix Booking":
 * consume la API pública (READ + slug-scoped POST, sin API key — first-party).
 *
 * Flujo single-page mobile-first: Buscar → Resultados → Checkout → Confirmación.
 * Opción B: pago en recepción (PAY_AT_HOTEL), sin cobro online en Fase 1.
 * Ruta pública (sin auth, sin shell PMS) — patrón PrecheckinPage.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'

interface PropertyInfo {
  slug: string
  name: string
  heroSubtitle: string | null
  city: string | null
  currency: string
  branding: { primaryColor: string | null; logoUrl: string | null }
  paymentPolicy: string
}
interface RoomTypeAvail {
  roomTypeId: string
  name: string
  maxOccupancy: number
  availableRooms: number
  available: boolean
  nightlyRate: number
  nights: number
  totalRate: number
  currency: string
}
interface AvailResp { nights: number; currency: string; roomTypes: RoomTypeAvail[] }
interface ReservationResp {
  reservationRef: string
  totalAmount: number
  currency: string
  message: string
  rooms: { roomType: string; checkIn: string; checkOut: string; total: number }[]
}

type Step = 'search' | 'results' | 'checkout' | 'done'

function money(n: number, ccy: string) {
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: ccy }).format(n) }
  catch { return `${ccy} ${n.toFixed(2)}` }
}
function todayPlus(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function BookingPage() {
  const { slug = '' } = useParams()
  const [info, setInfo] = useState<PropertyInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('search')

  const [checkIn, setCheckIn] = useState(todayPlus(7))
  const [checkOut, setCheckOut] = useState(todayPlus(10))
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)

  const [avail, setAvail] = useState<AvailResp | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<RoomTypeAvail | null>(null)

  const [guest, setGuest] = useState({ name: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ReservationResp | null>(null)
  // El idempotency key se renueva al cambiar de habitación o al iniciar una
  // reserva nueva (flowNonce) — así una segunda reserva no replica la primera.
  const [flowNonce, setFlowNonce] = useState(0)
  const idemKey = useMemo(() => crypto.randomUUID(), [selected, flowNonce])

  const primary = info?.branding.primaryColor || '#0f766e'

  function resetFlow() {
    setConfirmation(null); setSelected(null); setStep('search'); setFlowNonce((n) => n + 1)
  }

  useEffect(() => {
    api.get<PropertyInfo>(`/v1/public/properties/${slug}`)
      .then(setInfo)
      .catch((e) => setLoadErr(e instanceof ApiError && e.status === 404 ? 'Esta página de reservas no existe o está desactivada.' : 'No se pudo cargar el hotel.'))
  }, [slug])

  // SEO — la hosted page es indexable (reservas directas = tráfico orgánico).
  // Meta + Open Graph + schema.org Hotel inyectados al cargar el hotel.
  useEffect(() => {
    if (!info) return
    const desc = info.heroSubtitle || `Reserva directa en ${info.name}${info.city ? `, ${info.city}` : ''}. Sin comisiones.`
    document.title = `Reservar — ${info.name}`
    upsertMeta('name', 'description', desc)
    upsertMeta('property', 'og:title', info.name)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('property', 'og:type', 'website')
    if (info.branding.logoUrl) upsertMeta('property', 'og:image', info.branding.logoUrl)
    upsertJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      name: info.name,
      ...(info.city ? { address: { '@type': 'PostalAddress', addressLocality: info.city } } : {}),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      priceRange: info.currency,
    })
  }, [info])

  async function search() {
    setFormErr(null)
    if (new Date(checkOut) <= new Date(checkIn)) { setFormErr('La salida debe ser posterior a la llegada.'); return }
    setSearching(true); setAvail(null)
    try {
      const r = await api.get<AvailResp>(`/v1/public/properties/${slug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=${children}`)
      setAvail(r); setStep('results')
    } catch { setFormErr('No se pudo consultar disponibilidad.') }
    finally { setSearching(false) }
  }

  async function confirm() {
    if (!selected) return
    setFormErr(null)
    if (!guest.name.trim()) { setFormErr('Ingresa tu nombre.'); return }
    setSubmitting(true)
    try {
      // Omitir email/phone vacíos — el backend valida formato sólo si vienen.
      const cleanGuest: { name: string; email?: string; phone?: string } = { name: guest.name.trim() }
      if (guest.email.trim()) cleanGuest.email = guest.email.trim()
      if (guest.phone.trim()) cleanGuest.phone = guest.phone.trim()
      const r = await api.post<ReservationResp>(
        `/v1/public/properties/${slug}/reservations`,
        { guest: cleanGuest, rooms: [{ roomTypeId: selected.roomTypeId, checkIn, checkOut, adults, children }] },
        { headers: { 'Idempotency-Key': idemKey } },
      )
      setConfirmation(r); setStep('done')
    } catch (e) {
      setFormErr(e instanceof ApiError && e.status === 409
        ? 'Esa habitación se acaba de ocupar. Intenta con otras fechas.'
        : (e instanceof ApiError ? e.message : 'No se pudo crear la reserva.'))
    } finally { setSubmitting(false) }
  }

  if (loadErr) return <Centered><h1 className="text-lg font-semibold text-slate-800">{loadErr}</h1></Centered>
  if (!info) return <Centered><p className="text-slate-400">Cargando…</p></Centered>

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-5 py-6 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${shade(primary)})` }}>
        <div className="mx-auto max-w-lg">
          {info.branding.logoUrl && <img src={info.branding.logoUrl} alt="" className="mb-3 h-10" />}
          <h1 className="text-2xl font-bold">{info.name}</h1>
          {info.heroSubtitle && <p className="mt-1 text-sm text-white/90">{info.heroSubtitle}</p>}
          {info.city && <p className="mt-0.5 text-xs text-white/70">{info.city}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-6 space-y-5">
        {/* ── Buscar ── */}
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Llegada"><input type="date" value={checkIn} min={todayPlus(0)} onChange={(e) => setCheckIn(e.target.value)} className="input" /></Field>
            <Field label="Salida"><input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className="input" /></Field>
            <Field label="Adultos"><input type="number" min={1} value={adults} onChange={(e) => setAdults(+e.target.value)} className="input" /></Field>
            <Field label="Niños"><input type="number" min={0} value={children} onChange={(e) => setChildren(+e.target.value)} className="input" /></Field>
          </div>
          <button onClick={search} disabled={searching} className="btn-primary mt-4 w-full" style={{ background: primary }}>
            {searching ? 'Buscando…' : 'Buscar disponibilidad'}
          </button>
          {step === 'search' && formErr && <p className="mt-2 text-center text-sm text-rose-600">{formErr}</p>}
        </section>

        {/* ── Resultados ── */}
        {step !== 'search' && avail && (
          <section className="space-y-3">
            {avail.roomTypes.filter((r) => r.available).length === 0 && (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Sin disponibilidad para esas fechas. Prueba con otras.</p>
            )}
            {avail.roomTypes.filter((r) => r.available).map((rt) => (
              <div key={rt.roomTypeId} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">{rt.name}</h3>
                    <p className="text-xs text-slate-500">Hasta {rt.maxOccupancy} huéspedes · {rt.availableRooms} disponibles</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{money(rt.totalRate, rt.currency)}</p>
                    <p className="text-xs text-slate-400">{money(rt.nightlyRate, rt.currency)} × {rt.nights} noches</p>
                  </div>
                </div>
                <button onClick={() => { setSelected(rt); setStep('checkout') }} className="btn-primary mt-3 w-full" style={{ background: primary }}>Reservar</button>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* ── Checkout (sheet) ── */}
      {step === 'checkout' && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setStep('results')}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Confirmar reserva</h2>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">{selected.name}</span><strong>{money(selected.totalRate, selected.currency)}</strong></div>
              <p className="mt-1 text-xs text-slate-400">{checkIn} → {checkOut} · {adults + children} huéspedes</p>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="Nombre completo *"><input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className="input" placeholder="Tu nombre" /></Field>
              <Field label="Email"><input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} className="input" placeholder="tu@email.com" /></Field>
              <Field label="Teléfono"><input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className="input" placeholder="+52…" /></Field>
            </div>
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              💳 Tu reserva se confirma ahora. <strong>El pago se realiza al llegar al hotel.</strong>
            </div>
            {formErr && <p className="mt-2 text-sm text-rose-600">{formErr}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep('results')} className="btn-ghost flex-1">Volver</button>
              <button onClick={confirm} disabled={submitting} className="btn-primary flex-[2]" style={{ background: primary }}>{submitting ? 'Confirmando…' : 'Confirmar reserva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmación ── */}
      {step === 'done' && confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl" style={{ background: `${primary}22`, color: primary }}>✓</div>
            <h2 className="mt-3 text-xl font-bold text-slate-900">¡Reserva confirmada!</h2>
            <p className="mt-1 text-sm text-slate-500">{confirmation.message}</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <p className="text-slate-600">Número de reserva</p>
              <p className="font-mono text-base font-bold text-slate-900">{confirmation.reservationRef}</p>
              <hr className="my-3 border-slate-200" />
              {confirmation.rooms.map((r, i) => (
                <div key={i} className="flex justify-between"><span className="text-slate-600">{r.roomType}</span><span>{money(r.total, confirmation.currency)}</span></div>
              ))}
              <div className="mt-2 flex justify-between font-semibold"><span>Total (en recepción)</span><span>{money(confirmation.totalAmount, confirmation.currency)}</span></div>
            </div>
            <button onClick={resetFlow} className="btn-ghost mt-4 w-full">Hacer otra reserva</button>
          </div>
        </div>
      )}

      <style>{`
        .input{width:100%;border:1px solid #e2e8f0;border-radius:.6rem;padding:.55rem .7rem;font-size:.9rem}
        .input:focus{outline:none;border-color:${primary}}
        .btn-primary{color:#fff;font-weight:600;border-radius:.7rem;padding:.7rem 1rem;font-size:.92rem}
        .btn-primary:disabled{opacity:.6}
        .btn-ghost{background:#f1f5f9;color:#475569;font-weight:600;border-radius:.7rem;padding:.7rem 1rem;font-size:.92rem}
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>{children}</label>
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">{children}</div>
}
/** Crea o actualiza un <meta> por name/property (SEO + Open Graph). */
function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content)
}
/** Inyecta/actualiza el bloque JSON-LD schema.org Hotel. */
function upsertJsonLd(data: Record<string, unknown>) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('zenix-booking-jsonld')
  if (!el) { el = document.createElement('script'); el.id = 'zenix-booking-jsonld'; (el as HTMLScriptElement).type = 'application/ld+json'; document.head.appendChild(el) }
  el.textContent = JSON.stringify(data)
}

/** Oscurece un hex ~18% para el gradiente del hero. */
function shade(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 255) - 40), b = Math.max(0, (n & 255) - 40)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
