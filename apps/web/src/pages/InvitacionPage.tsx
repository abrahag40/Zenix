/**
 * InvitacionPage — el personal del hotel fija su propia contraseña.
 *
 * Ruta: /invitacion/:token
 *
 * 🔴 ES LA PRIMERA PANTALLA QUE VE UN CLIENTE, y llega a ella sin cuenta.
 * Por eso no hay barra lateral, ni menú, ni nada que invite a irse: sólo lo
 * que ha venido a hacer.
 *
 * Es hermana de `SetupPage` —el alta del propietario— pero habla con otro
 * endpoint: `/v1/auth/invitacion/:token`, el del personal. Se escribe aparte
 * en vez de parametrizar aquella: son dos flujos que se parecen HOY y no
 * tienen por qué seguir pareciéndose —el propietario entra a facturación, el
 * personal a operación—, y fundirlos ataría los dos a la forma del otro.
 *
 * Lo que NO hace, a propósito: **no inicia sesión solo al terminar.** El alta
 * del propietario sí lo hace, porque viene de un flujo que ya lo identificó.
 * Aquí la persona acaba de elegir una contraseña; que la escriba una vez la
 * fija en la memoria y confirma que quedó como cree.
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { api, ApiError } from '../api/client'

interface Metadatos {
  email: string
  nombre: string
  propiedad: string
  horasRestantes: number
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'lista'; meta: Metadatos }
  | { tipo: 'invalida'; mensaje: string }
  | { tipo: 'caducada'; mensaje: string }
  | { tipo: 'hecha'; email: string }

const MINIMO = 10

export default function InvitacionPage() {
  const { token } = useParams<{ token: string }>()
  const navegar = useNavigate()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const meta = await api.get<Metadatos>(`/v1/auth/invitacion/${token}`)
        if (vivo) setEstado({ tipo: 'lista', meta })
      } catch (e) {
        if (!vivo) return
        const codigo = e instanceof ApiError ? e.status : 0
        // 410 y 404 se distinguen para el usuario —«caducó» se arregla pidiendo
        // otro enlace, «inválido» no— pero el servidor NO revela si el token
        // existió alguna vez.
        setEstado(
          codigo === 410
            ? { tipo: 'caducada', mensaje: 'Este enlace ya se usó o caducó.' }
            : { tipo: 'invalida', mensaje: 'Este enlace no es válido.' },
        )
      }
    })()
    return () => { vivo = false }
  }, [token])

  const coinciden = pw.length > 0 && pw === pw2
  const valida = pw.length >= MINIMO && coinciden

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valida || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await api.post<{ email: string }>(`/v1/auth/invitacion/${token}`, {
        contrasena: pw,
      })
      setEstado({ tipo: 'hecha', email: r.email })
    } catch (err) {
      const codigo = err instanceof ApiError ? err.status : 0
      setError(
        codigo === 410
          ? 'Este enlace acaba de usarse. Pide uno nuevo.'
          : 'No se pudo completar el alta. Inténtalo de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (estado.tipo === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Cargando" />
      </div>
    )
  }

  if (estado.tipo === 'invalida' || estado.tipo === 'caducada') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">{estado.mensaje}</h1>
          <p className="text-slate-600 text-sm">
            Los enlaces sirven una sola vez y duran 72 horas. Pide otro a quien te lo envió.
          </p>
        </div>
      </div>
    )
  }

  if (estado.tipo === 'hecha') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Tu acceso está listo</h1>
          <p className="text-slate-600 text-sm mb-6">
            Entra con <strong>{estado.email}</strong> y la contraseña que acabas de elegir.
          </p>
          <button
            onClick={() => navegar('/login')}
            className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            Ir a entrar
          </button>
        </div>
      </div>
    )
  }

  const { meta } = estado
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8">
        <ShieldCheck className="h-9 w-9 text-emerald-600 mb-4" />
        <h1 className="text-xl font-semibold text-slate-900">Elige tu contraseña</h1>
        <p className="text-slate-600 text-sm mt-2 mb-6">
          {meta.nombre}, vas a entrar a <strong>{meta.propiedad}</strong> como{' '}
          <strong>{meta.email}</strong>.{' '}
          {/* Se dice el plazo restante para que nadie deje el enlace para mañana
              sin saber que mañana puede ser tarde. */}
          Este enlace caduca en {meta.horasRestantes} h.
        </p>

        <form onSubmit={enviar} noValidate>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="pw">
            Contraseña
          </label>
          <div className="relative mb-1">
            <input
              id="pw"
              type={ver ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 pr-11"
              aria-describedby="pw-ayuda"
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500"
              aria-label={ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
            >
              {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Una sola regla, y dicha antes de fallar. No se exigen mayúsculas ni
              símbolos: NIST SP 800-63B §5.1.1.2 los desaconseja porque empujan a
              patrones predecibles sin ganar entropía. */}
          <p id="pw-ayuda" className="text-xs text-slate-500 mb-4">
            Al menos {MINIMO} caracteres. Mejor larga y fácil de recordar que corta y rara.
          </p>

          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="pw2">
            Repítela
          </label>
          <input
            id="pw2"
            type={ver ? 'text' : 'password'}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 mb-2"
          />
          {pw2.length > 0 && !coinciden && (
            <p className="text-xs text-red-600 mb-3" role="alert">Las dos no coinciden.</p>
          )}
          {error && (
            <p className="text-sm text-red-600 mb-3" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={!valida || enviando}
            className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50 hover:bg-emerald-700 mt-3"
          >
            {enviando ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}
