/**
 * La tableta de recepción: teclear el código, confirmar, firmar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PARA QUIÉN ESTÁ DISEÑADA
 *
 * Para una persona de pie, con una tableta en una mano y un huésped delante
 * esperando. Eso manda sobre todo lo demás:
 *
 *   · **Un paso por pantalla.** Nada de un formulario largo con todo a la vez.
 *   · **Texto grande.** Se lee a un brazo de distancia, no a treinta
 *     centímetros como un escritorio.
 *   · **Objetivos de 44 px o más** (WCAG 2.5.8), y más grandes aún en el
 *     teclado del código: fallar un toque con el huésped mirando es peor que
 *     en cualquier otra pantalla del sistema.
 *   · **El código en mayúsculas y separado**, porque se dicta en voz alta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LO QUE ESTA PANTALLA NO HACE, Y ES DELIBERADO
 *
 * · **No enseña el número de identificación completo** ni el correo entero. El
 *   recepcionista CONFIRMA con el huésped, no transcribe. Enseñarlo todo
 *   convertiría cada búsqueda en una fuga de datos con testigos.
 * · **No enseña el código de un solo uso.** Se envía al huésped y él lo dicta.
 *   Si saliera en la pantalla, el recepcionista podría teclearlo solo — y
 *   entonces el código dejaría de probar lo único que prueba: que el huésped
 *   controla su contacto.
 * · **No deja firmar dos veces.** Si ya hay carta, lo dice y para.
 */
import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle2, Loader2, PenLine, RotateCcw, Search } from 'lucide-react'
import { api, ApiError } from '@/api/client'

interface Reserva {
  estanciaId: string
  codigo: string
  referencia: string
  huesped: { nombre: string; correo: string | null; telefono: string | null; identificacion: string | null }
  estancia: { entrada: string; salida: string; yaRegistrado: boolean }
  importe: { total: string; moneda: string; estado: string }
  cartaFirmadaEn: string | null
}

type Paso = 'buscar' | 'confirmar' | 'firmar' | 'hecho'

/** Hash SHA-256 de los BYTES del PNG. Es lo que se sella, no la URL. */
async function hashDeImagen(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function RecepcionRegistroPage() {
  const [paso, setPaso] = useState<Paso>('buscar')
  const [codigo, setCodigo] = useState('')
  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [otp, setOtp] = useState('')
  const [otpEnviado, setOtpEnviado] = useState<string | null>(null)

  const buscar = useMutation({
    mutationFn: (c: string) => api.get<Reserva>(`/v1/recepcion/estancias/${encodeURIComponent(c)}`),
    onSuccess: (r) => {
      setReserva(r)
      setPaso(r.cartaFirmadaEn ? 'hecho' : 'confirmar')
    },
    onError: (e) => {
      const s = e instanceof ApiError ? e.status : 0
      toast.error(
        s === 400 ? 'Ese código no es válido. Revísalo.'
          : s === 403 ? 'Demasiadas búsquedas sin resultado. Espera un momento.'
          : 'No hay ninguna reserva con ese código en este hotel.',
      )
    },
  })

  const enviarOtp = useMutation({
    mutationFn: (canal: 'correo' | 'sms') =>
      api.post(`/v1/recepcion/estancias/${reserva!.estanciaId}/codigo`, { canal }),
    onSuccess: (_d, canal) => {
      setOtpEnviado(canal)
      toast.success(`Código enviado por ${canal}. Pídeselo al huésped.`)
    },
    onError: () => toast.error('No se pudo enviar el código.'),
  })

  if (paso === 'buscar') {
    return (
      <Marco titulo="Registro de huésped">
        <p className="text-lg text-slate-600 mb-6">Teclea el código de la reserva.</p>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 8))}
          onKeyDown={(e) => { if (e.key === 'Enter' && codigo) buscar.mutate(codigo) }}
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Código de la reserva"
          placeholder="A B C 2 3 X"
          className="w-full text-center text-5xl font-mono tracking-[0.35em] min-h-[88px]
                     rounded-2xl border-2 border-slate-300 focus:border-indigo-600 outline-none"
        />
        <p className="text-sm text-slate-400 mt-3 text-center">
          Seis caracteres. No hay ceros, oes, unos ni eles.
        </p>
        <Boton onClick={() => buscar.mutate(codigo)} disabled={codigo.length < 6 || buscar.isPending}>
          {buscar.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Search className="h-6 w-6" />}
          Buscar reserva
        </Boton>
      </Marco>
    )
  }

  if (paso === 'hecho' || (reserva && reserva.cartaFirmadaEn && paso !== 'firmar')) {
    return (
      <Marco titulo="Listo">
        <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
        <p className="text-xl text-slate-800 mb-2">
          {reserva?.cartaFirmadaEn ? 'Esta reserva ya tiene su carta firmada.' : 'Carta firmada y sellada.'}
        </p>
        <p className="text-slate-500 mb-8">
          {/* Una estancia, una carta: dos serían dos versiones de lo que firmó. */}
          No hace falta volver a firmarla.
        </p>
        <Boton onClick={() => { setPaso('buscar'); setCodigo(''); setReserva(null); setOtp(''); setOtpEnviado(null) }}>
          Registrar a otro huésped
        </Boton>
      </Marco>
    )
  }

  if (paso === 'confirmar' && reserva) {
    return (
      <Marco titulo="Confirma con el huésped">
        <dl className="w-full space-y-4 mb-8">
          <Dato termino="Nombre" valor={reserva.huesped.nombre} grande />
          <Dato termino="Identificación" valor={reserva.huesped.identificacion ?? '— sin registrar —'} />
          <Dato termino="Correo" valor={reserva.huesped.correo ?? '—'} />
          <Dato termino="Entrada" valor={new Date(reserva.estancia.entrada).toLocaleDateString('es-MX')} />
          <Dato termino="Salida" valor={new Date(reserva.estancia.salida).toLocaleDateString('es-MX')} />
          <Dato
            termino="Total"
            valor={`${reserva.importe.total} ${reserva.importe.moneda}`}
            grande
          />
        </dl>

        <div className="w-full rounded-2xl bg-slate-50 p-4 mb-6">
          <p className="text-sm text-slate-600 mb-3">
            {/* El código es lo que acredita que el huésped controla su contacto.
                Por eso lo dicta él y no aparece en esta pantalla. */}
            Opcional pero recomendado: envíale un código y pídeselo.
          </p>
          {otpEnviado ? (
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              aria-label="Código que dictó el huésped"
              placeholder="· · · · · ·"
              className="w-full text-center text-3xl font-mono tracking-[0.3em] min-h-[64px]
                         rounded-xl border-2 border-slate-300"
            />
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => enviarOtp.mutate('correo')}
                disabled={enviarOtp.isPending || !reserva.huesped.correo}
                className="flex-1 min-h-[56px] rounded-xl border-2 border-slate-300 text-lg disabled:opacity-40"
              >
                Por correo
              </button>
              <button
                onClick={() => enviarOtp.mutate('sms')}
                disabled={enviarOtp.isPending || !reserva.huesped.telefono}
                className="flex-1 min-h-[56px] rounded-xl border-2 border-slate-300 text-lg disabled:opacity-40"
              >
                Por SMS
              </button>
            </div>
          )}
        </div>

        <Boton onClick={() => setPaso('firmar')}>
          <PenLine className="h-6 w-6" /> Los datos son correctos, firmar
        </Boton>
      </Marco>
    )
  }

  return <PantallaDeFirma reserva={reserva!} otp={otp} onListo={() => setPaso('hecho')} />
}

/** El lienzo de la firma. Táctil, grande, y con «repetir» siempre a mano. */
function PantallaDeFirma({
  reserva, otp, onListo,
}: { reserva: Reserva; otp: string; onListo: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [hayTrazo, setHayTrazo] = useState(false)
  const dibujando = useRef(false)

  const ctx = () => lienzo.current?.getContext('2d') ?? null

  function punto(e: React.PointerEvent) {
    const r = lienzo.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const firmar = useMutation({
    mutationFn: async () => {
      const blob: Blob = await new Promise((ok) => lienzo.current!.toBlob((b) => ok(b!), 'image/png'))
      // El hash se calcula aquí sobre los BYTES del PNG, pero es sólo para
      // CONTRASTAR: el servidor relee lo guardado y calcula el suyo, que es el
      // que vale. Nada que venga del navegador es un hecho.
      const firmaHash = await hashDeImagen(blob)
      const firmaBase64 = await new Promise<string>((ok) => {
        const fr = new FileReader()
        fr.onload = () => ok(String(fr.result))
        fr.readAsDataURL(blob)
      })
      return api.post(`/v1/recepcion/estancias/${reserva.estanciaId}/carta`, {
        firmaBase64, firmaHash, ...(otp ? { otp } : {}),
      })
    },
    onSuccess: () => { toast.success('Carta firmada y sellada.'); onListo() },
    onError: () => toast.error('No se pudo guardar la firma. Inténtalo otra vez.'),
  })

  return (
    <Marco titulo="Firma del huésped">
      <p className="text-lg text-slate-600 mb-4">
        {reserva.huesped.nombre}, firma con el dedo en el recuadro.
      </p>
      <canvas
        ref={lienzo}
        width={900}
        height={320}
        aria-label="Recuadro para firmar"
        onPointerDown={(e) => {
          dibujando.current = true
          const c = ctx()!
          c.lineWidth = 3
          c.lineCap = 'round'
          c.strokeStyle = '#0f172a'
          const p = punto(e)
          c.beginPath()
          c.moveTo(p.x, p.y)
          setHayTrazo(true)
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return
          const p = punto(e)
          ctx()!.lineTo(p.x, p.y)
          ctx()!.stroke()
        }}
        onPointerUp={() => { dibujando.current = false }}
        onPointerLeave={() => { dibujando.current = false }}
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white touch-none"
      />
      <div className="flex gap-3 w-full mt-4">
        <button
          onClick={() => {
            ctx()!.clearRect(0, 0, lienzo.current!.width, lienzo.current!.height)
            setHayTrazo(false)
          }}
          className="min-h-[56px] px-6 rounded-xl border-2 border-slate-300 text-lg inline-flex items-center gap-2"
        >
          <RotateCcw className="h-5 w-5" /> Repetir
        </button>
        <button
          onClick={() => firmar.mutate()}
          disabled={!hayTrazo || firmar.isPending}
          className="flex-1 min-h-[56px] rounded-xl bg-indigo-600 text-white text-lg font-medium disabled:opacity-40"
        >
          {firmar.isPending ? 'Guardando…' : 'Guardar la firma'}
        </button>
      </div>
    </Marco>
  )
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-sm p-8 flex flex-col items-center">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6 self-start">{titulo}</h1>
        {children}
      </div>
    </div>
  )
}

function Dato({ termino, valor, grande }: { termino: string; valor: string; grande?: boolean }) {
  return (
    <div className="flex justify-between items-baseline border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{termino}</dt>
      <dd className={grande ? 'text-2xl font-semibold text-slate-900' : 'text-lg text-slate-800'}>
        {valor}
      </dd>
    </div>
  )
}

function Boton({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-[64px] mt-8 rounded-2xl bg-indigo-600 text-white text-xl font-medium
                 inline-flex items-center justify-center gap-3 disabled:opacity-40 hover:bg-indigo-700"
    >
      {children}
    </button>
  )
}
