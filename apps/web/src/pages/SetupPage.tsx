/**
 * SetupPage — Org Owner activation flow (Day 17, §174 D-NOVA-16).
 *
 * Route: /setup/:token
 *
 * Flow:
 *   1. Mount → GET /v1/auth/setup/:token para metadata
 *      · 200 → muestra form de password
 *      · 404 → "Link inválido"
 *      · 410 → "Link expirado o ya usado"
 *   2. Submit password → POST /v1/auth/setup/:token
 *      · 200 → auto-login (writeAuth + redirect /dashboard)
 *      · 400 → muestra error de password
 *      · 410 → "Token consumido entre tabs" (race)
 *
 * UI standards:
 *   · Layout focus-mode similar al wizard — sin sidebar, sin distracciones
 *   · Brand emerald (acción positiva = "activar tu cuenta")
 *   · Form validation inline: longitud ≥ 10, confirmación matching, fortaleza
 *   · Apple HIG: primary CTA bottom, secondary cancel hidden (no es cancelable)
 *   · Password meter Mehrabian-Russell — red weak / amber medium / emerald strong
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Sparkles, ShieldCheck, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'

interface SetupMetadata {
  organizationName: string
  organizationSlug: string
  ownerEmail: string
  ownerName: string
  hoursRemaining: number
  propertyCount: number
}

interface SetupActivateResponse {
  access_token: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    organizationId: string
  }
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: SetupMetadata }
  | { kind: 'invalid'; message: string }
  | { kind: 'expired'; message: string }

// Fortaleza heurística: 0-100 score
function scorePassword(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 10) score += 25
  if (pw.length >= 14) score += 15
  if (/[a-z]/.test(pw)) score += 10
  if (/[A-Z]/.test(pw)) score += 15
  if (/\d/.test(pw)) score += 15
  if (/[^A-Za-z0-9]/.test(pw)) score += 20
  return Math.min(100, score)
}

export function SetupPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid', message: 'Setup link inválido. Pídele uno nuevo a tu consultor.' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const meta = await api.get<SetupMetadata>(`/v1/auth/setup/${token}`)
        if (!cancelled) setState({ kind: 'ready', meta })
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.status === 410) {
            setState({ kind: 'expired', message: err.message })
          } else {
            setState({ kind: 'invalid', message: err.message })
          }
        } else {
          setState({
            kind: 'invalid',
            message: 'No se pudo cargar la información del setup. Intenta más tarde.',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const pwScore = scorePassword(password)
  const passwordValid = password.length >= 10 && password.length <= 200
  const confirmMatches = confirmPassword.length > 0 && password === confirmPassword
  const canSubmit = passwordValid && confirmMatches && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !token) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await api.post<SetupActivateResponse>(`/v1/auth/setup/${token}`, {
        password,
      })
      // Mapping: el setup endpoint devuelve un shape específico — lo
      // adaptamos al AuthResponse que useAuthStore.setAuth espera.
      // Property fields quedan vacíos hasta que el Org Owner elija/active
      // una property específica (post-Day 17: PropertySelectorOnLogin).
      setAuth({
        accessToken: res.access_token,
        user: {
          id: res.user.id,
          name: `${res.user.firstName} ${res.user.lastName}`.trim(),
          email: res.user.email,
          role: 'OWNER' as never, // ORG_OWNER en la 5-tier
          department: 'OPERATIONS' as never,
          propertyId: '', // resolved on first property switcher use
          propertyName: null,
        } as any,
      } as any)
      toast.success('¡Cuenta activada! Bienvenido a Zenix.', { duration: 4500 })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Activación falló'
      setSubmitError(msg)
      if (err instanceof ApiError && err.status === 410) {
        // Token consumido entre GET y POST — actualizamos state
        setState({ kind: 'expired', message: err.message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 antialiased relative overflow-hidden flex items-center justify-center px-4 py-10">
      {/* Ambient gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(900px circle at 0% 0%, rgba(16,185,129,0.06) 0%, transparent 50%),' +
            'radial-gradient(700px circle at 100% 100%, rgba(139,92,246,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-[0_4px_16px_-4px_rgba(16,185,129,0.5)] mb-3">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-[20px] font-semibold tracking-[-0.015em] text-slate-900">
            Activación de cuenta Zenix
          </div>
        </div>

        {state.kind === 'loading' && (
          <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-8 text-center">
            <Loader2 className="h-6 w-6 text-violet-600 animate-spin mx-auto mb-3" />
            <div className="text-[14px] text-slate-700">Verificando setup link…</div>
          </div>
        )}

        {state.kind === 'invalid' && (
          <ErrorCard
            title="Setup link inválido"
            message={state.message}
            tone="danger"
          />
        )}

        {state.kind === 'expired' && (
          <ErrorCard
            title="Setup link expirado o ya consumido"
            message={state.message}
            tone="warning"
          />
        )}

        {state.kind === 'ready' && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-7 space-y-5"
          >
            {/* Meta */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Cuenta del cliente
              </div>
              <div className="text-[16px] font-semibold text-slate-900 tracking-[-0.01em]">
                {state.meta.organizationName}
              </div>
              <div className="text-[13px] text-slate-600 mt-0.5">
                {state.meta.propertyCount}{' '}
                {state.meta.propertyCount === 1 ? 'property creada' : 'properties creadas'} ·{' '}
                {state.meta.hoursRemaining}h restantes para activar
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Bienvenido
              </div>
              <div className="text-[14px] font-medium text-slate-900">{state.meta.ownerName}</div>
              <div className="text-[13px] text-slate-500 font-mono">{state.meta.ownerEmail}</div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Password fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                  Crea tu contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={200}
                    required
                    placeholder="Mínimo 10 caracteres"
                    className={
                      'w-full px-3.5 pr-10 h-10 rounded-lg border text-[14px] focus:outline-none focus:ring-2 transition-colors ' +
                      (password.length === 0
                        ? 'border-slate-300 focus:ring-emerald-500/30'
                        : passwordValid
                          ? 'border-emerald-300 focus:ring-emerald-500/30'
                          : 'border-amber-300 focus:ring-amber-500/30')
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-slate-500 hover:bg-slate-100"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Strength meter */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={
                          'h-full transition-all duration-200 ' +
                          (pwScore < 50
                            ? 'bg-red-500'
                            : pwScore < 75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500')
                        }
                        style={{ width: `${pwScore}%` }}
                      />
                    </div>
                    <div className="text-[11px] mt-1 text-slate-500">
                      {pwScore < 50
                        ? 'Débil — agrega mayúsculas, números o símbolos'
                        : pwScore < 75
                          ? 'Aceptable'
                          : 'Fuerte ✓'}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
                  Confirma contraseña
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={
                    'w-full px-3.5 h-10 rounded-lg border text-[14px] focus:outline-none focus:ring-2 transition-colors ' +
                    (confirmPassword.length === 0
                      ? 'border-slate-300 focus:ring-emerald-500/30'
                      : confirmMatches
                        ? 'border-emerald-300 focus:ring-emerald-500/30'
                        : 'border-amber-300 focus:ring-amber-500/30')
                  }
                />
                {confirmPassword.length > 0 && !confirmMatches && (
                  <div className="text-[11px] mt-1 text-amber-700">
                    Las contraseñas no coinciden.
                  </div>
                )}
              </div>
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] text-red-900">{submitError}</div>
              </div>
            )}

            {/* CTA */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={
                'w-full h-10 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ' +
                (canSubmit
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.4)]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed')
              }
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {submitting ? 'Activando…' : 'Activar mi cuenta'}
            </button>

            <div className="text-center text-[11px] text-slate-400">
              Al activar, Zenix nunca conocerá tu contraseña — solo un hash bcrypt.
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="text-center mt-6 text-[12px] text-slate-500">
          ¿Problemas?{' '}
          <a href="mailto:soporte@zenix.com" className="text-emerald-700 hover:underline font-medium">
            soporte@zenix.com
          </a>
        </div>
      </div>
    </div>
  )
}

function ErrorCard({
  title,
  message,
  tone,
}: {
  title: string
  message: string
  tone: 'danger' | 'warning'
}) {
  const bg = tone === 'danger' ? 'from-red-400 to-red-700' : 'from-amber-400 to-amber-700'
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-7 text-center space-y-3">
      <div
        className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${bg} text-white mx-auto`}
      >
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="text-[13px] text-slate-600 leading-relaxed">{message}</div>
      <div className="pt-2">
        <Link
          to="/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-[13px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
