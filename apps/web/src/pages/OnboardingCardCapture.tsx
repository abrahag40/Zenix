/**
 * OnboardingCardCapture — Netflix-style trial flow Day 2.
 *
 * Route: /onboarding/card
 *
 * Aparece después del SetupPage password step. El Org Owner ya tiene JWT
 * (auto-login post-password). Lleva al cliente a Stripe Checkout (mode=setup)
 * que valida la tarjeta con $0 SetupIntent. Al volver, espera al webhook
 * setup_intent.succeeded → activación de Subscription real → /dashboard.
 *
 * State machine:
 *   idle              — primera vista: card "Agrega tu tarjeta" + botón
 *   creating_session  — POST /v1/billing/setup-checkout en curso
 *   redirecting       — window.location.replace(stripe_url) — usuario sale
 *   returning         — detectó ?payment=success en URL (volvió de Stripe)
 *   polling           — fetcheando /v1/billing/subscription cada 2s
 *   activated         — sub.status === 'trialing' → navigate /dashboard
 *   cancelled         — ?payment=cancel — usuario abandonó Checkout
 *   error             — fallo en API o polling timeout
 *
 * UX standards:
 *   · Focus-mode layout (no sidebar, no distractions)
 *   · Brand emerald (acción positiva, paso final del onboarding)
 *   · Trust signals: "validación de $0 — Stripe gestiona los datos de tu tarjeta"
 *   · Polling con timeout de 60s para evitar quedar colgado si webhook falla
 *
 * Apple HIG aplicado:
 *   · Una sola acción primary visible (Hick's Law)
 *   · Mensajes de estado claros en cada transición (NN/g H1)
 *   · No motion en transiciones — feedback instant
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CreditCard,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api, ApiError } from '../api/client'
import { useAuthStore } from '../store/auth'

interface SubscriptionStatus {
  id: string
  status: string
  planTier: string
  trialEndsAt: string | null
  cardCapturedAt: string | null
}

interface SetupCheckoutResponse {
  url: string
  sessionId: string
  customerId: string
}

type Stage =
  | 'idle'
  | 'creating_session'
  | 'redirecting'
  | 'returning'
  | 'polling'
  | 'activated'
  | 'cancelled'
  | 'error'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60_000

export function OnboardingCardCapture() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useAuthStore((s) => s.accessToken)

  const [stage, setStage] = useState<Stage>(() => {
    const payment = searchParams.get('payment')
    if (payment === 'success') return 'returning'
    if (payment === 'cancel') return 'cancelled'
    return 'idle'
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollStartRef = useRef<number | null>(null)

  // Guard: sin token → fuera a /login (no debería pasar — SetupPage hace auto-login)
  useEffect(() => {
    if (!token) {
      toast.error('Sesión expirada — vuelve a abrir el link de setup')
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  // Cuando llegamos como `returning`, inicia el polling automáticamente.
  useEffect(() => {
    if (stage !== 'returning') return
    setStage('polling')
    pollStartRef.current = Date.now()
  }, [stage])

  // Polling loop — checa Subscription.status hasta 'trialing' o timeout
  useEffect(() => {
    if (stage !== 'polling') return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const sub = await api.get<SubscriptionStatus | null>('/v1/billing/subscription')
        if (cancelled) return
        if (sub && (sub.status === 'trialing' || sub.status === 'active')) {
          clearInterval(interval)
          setStage('activated')
          toast.success('¡Tarjeta validada! Activando tu cuenta…', { duration: 2500 })
          setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
          return
        }
        // Timeout
        if (pollStartRef.current && Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
          clearInterval(interval)
          setStage('error')
          setErrorMsg(
            'La activación está tardando más de lo normal. Tu tarjeta SÍ fue validada — recarga en unos segundos o contacta soporte.',
          )
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          clearInterval(interval)
          setStage('error')
          setErrorMsg('Tu sesión expiró — vuelve a iniciar desde el link del email.')
        }
        // Otros errores: el polling sigue, podría ser flake transitorio
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [stage, navigate])

  const handleAddCard = async () => {
    setStage('creating_session')
    setErrorMsg(null)
    try {
      const origin = window.location.origin
      const successUrl = `${origin}/onboarding/card?payment=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}/onboarding/card?payment=cancel`
      const res = await api.post<SetupCheckoutResponse>('/v1/billing/setup-checkout', {
        successUrl,
        cancelUrl,
      })
      if (!res.url) {
        throw new Error('Stripe no devolvió URL — intenta de nuevo')
      }
      setStage('redirecting')
      // Apple HIG: instant feedback antes del redirect
      window.location.replace(res.url)
    } catch (err) {
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar el flujo de pago')
    }
  }

  const handleRetryAfterCancel = () => {
    setStage('idle')
    setErrorMsg(null)
    // Limpia query params para evitar loop
    window.history.replaceState({}, '', '/onboarding/card')
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
            Último paso para activar tu cuenta
          </div>
          <div className="text-[13px] text-slate-500 mt-1.5">
            Valida tu tarjeta para comenzar tu período de prueba
          </div>
        </div>

        {/* Idle / first view: ofrecer el botón */}
        {stage === 'idle' && (
          <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-7 space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-[13px] text-emerald-900 leading-relaxed">
                <div className="font-semibold mb-1">No hay cobro hasta que termine tu prueba</div>
                Stripe hace una validación de <strong>$0</strong> para confirmar que la tarjeta
                funciona. El primer cobro ocurre al finalizar tu período de prueba.
              </div>
            </div>

            <div className="space-y-2 text-[13px] text-slate-600">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>Datos protegidos por Stripe (PCI-DSS Level 1)</div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>Cancela en cualquier momento antes del primer cobro</div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>Zenix nunca verá ni almacenará tu tarjeta</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddCard}
              className="w-full h-11 rounded-lg text-[14px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.4)] transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Agregar tarjeta y activar
            </button>

            <div className="text-center text-[11px] text-slate-400">
              Serás redirigido al checkout seguro de Stripe.
            </div>
          </div>
        )}

        {(stage === 'creating_session' || stage === 'redirecting') && (
          <LoadingCard
            title={stage === 'creating_session' ? 'Generando link seguro…' : 'Redirigiendo a Stripe…'}
            subtitle="No cierres esta pestaña."
          />
        )}

        {stage === 'polling' && (
          <LoadingCard
            title="Validando tu tarjeta…"
            subtitle="Esto toma unos segundos. Ya casi entras a Zenix."
          />
        )}

        {stage === 'activated' && (
          <SuccessCard
            title="¡Cuenta activada!"
            message="Te estamos llevando a tu dashboard."
          />
        )}

        {stage === 'cancelled' && (
          <ErrorOrCancelCard
            tone="warning"
            title="Pago no completado"
            message="No agregaste tu tarjeta — tu cuenta aún no está activa. Puedes intentar de nuevo cuando quieras."
            ctaLabel="Volver a intentar"
            onCta={handleRetryAfterCancel}
          />
        )}

        {stage === 'error' && (
          <ErrorOrCancelCard
            tone="danger"
            title="Algo salió mal"
            message={errorMsg ?? 'No se pudo completar el paso. Contacta a tu consultor o soporte.'}
            ctaLabel="Volver a intentar"
            onCta={handleRetryAfterCancel}
          />
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

function LoadingCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-8 text-center space-y-3">
      <Loader2 className="h-6 w-6 text-emerald-600 animate-spin mx-auto" />
      <div className="text-[15px] font-semibold text-slate-900">{title}</div>
      <div className="text-[13px] text-slate-600">{subtitle}</div>
    </div>
  )
}

function SuccessCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-8 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white mx-auto">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <div className="text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="text-[13px] text-slate-600 leading-relaxed">{message}</div>
    </div>
  )
}

function ErrorOrCancelCard({
  tone,
  title,
  message,
  ctaLabel,
  onCta,
}: {
  tone: 'warning' | 'danger'
  title: string
  message: string
  ctaLabel: string
  onCta: () => void
}) {
  const bg = tone === 'warning' ? 'from-amber-400 to-amber-700' : 'from-red-400 to-red-700'
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)] p-7 text-center space-y-4">
      <div
        className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${bg} text-white mx-auto`}
      >
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="text-[13px] text-slate-600 leading-relaxed">{message}</div>
      <button
        type="button"
        onClick={onCta}
        className="w-full h-10 rounded-lg text-[14px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
