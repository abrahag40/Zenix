/**
 * PacStatusBanner — banner sticky cliente-facing del estado del PAC.
 *
 * Sprint PAC-CLIENT-WARNING (2026-05-29). Resuelve el gap operativo:
 * si el consultor skipea el health-check PAC en wizard Step 8, el cliente
 * llega a /dashboard sin saber que su facturación electrónica no funciona
 * hasta que intenta emitir un CFDI con un huésped frente al counter.
 *
 * Aparece SOLO cuando `pacStatus !== 'CONFIGURED'`. Pattern Apple HIG H4
 * (visibility of system status) + Nielsen H1 (status feedback).
 *
 * Position: stripe directamente debajo del Sidebar fijo (h-14). Apunta
 * a /settings/legal-entity para que el cliente acceda a las instrucciones.
 *
 * Compliance: GDPR Art. 13 (right to be informed) + LFPDPPP Art. 16
 * (información clara sobre uso de servicios) — el cliente debe saber
 * que NO puede facturar todavía.
 */
import { Link } from 'react-router-dom'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { cn } from '@/lib/utils'

interface LegalEntityStatus {
  legalEntityId: string | null
  pacStatus: 'CONFIGURED' | 'PENDING' | 'FAILED' | 'NOT_REQUIRED'
  pacStatusUpdatedAt: string | null
  pacStatusReason: string | null
  countryCode: string | null
  legalEntityName: string | null
}

// Países que requieren PAC para facturación (MX hoy; CO/PE/CR en v1.0.x DLC)
const PAC_REQUIRED_COUNTRIES = ['MX']

export function PacStatusBanner() {
  const token = useAuthStore((s) => s.token)
  const [dismissedInSession, setDismissedInSession] = useState(false)

  const { data } = useQuery<LegalEntityStatus>({
    queryKey: ['legal-entity-status'],
    queryFn: () => api.get<LegalEntityStatus>('/v1/settings/legal-entity-status'),
    // Refresh cada 5min — si el consultor configura PAC desde Nova mientras
    // el cliente tiene el tab abierto, el banner desaparece automáticamente
    refetchInterval: 5 * 60_000,
    // Sólo intenta si hay token (post-login)
    enabled: !!token,
    // Si el endpoint falla (e.g. pre-migration), no romper la app
    retry: false,
  })

  if (!data) return null
  // Países sin PAC requirement no muestran banner
  if (data.countryCode && !PAC_REQUIRED_COUNTRIES.includes(data.countryCode)) return null
  // PAC OK → no banner
  if (data.pacStatus === 'CONFIGURED' || data.pacStatus === 'NOT_REQUIRED') return null
  // Dismissed por el usuario en esta sesión (decisión consciente)
  if (dismissedInSession) return null

  const isFailed = data.pacStatus === 'FAILED'

  return (
    <div
      className={cn(
        'border-b shadow-[0_2px_8px_rgba(15,23,42,0.06)]',
        isFailed
          ? 'bg-red-50 border-red-200 text-red-900'
          : 'bg-amber-50 border-amber-200 text-amber-900',
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
        <AlertTriangle
          className={cn('h-4 w-4 shrink-0', isFailed ? 'text-red-600' : 'text-amber-600')}
          aria-hidden
        />

        <div className="flex-1 min-w-0">
          <span className="text-xs sm:text-sm font-medium">
            {isFailed ? (
              <>
                Facturación electrónica con error.{' '}
                <span className="hidden sm:inline opacity-80">
                  Las credenciales del PAC no pasaron la validación.
                </span>
              </>
            ) : (
              <>
                Facturación electrónica pendiente.{' '}
                <span className="hidden sm:inline opacity-80">
                  Configura tu PAC antes de emitir el primer CFDI.
                </span>
              </>
            )}
          </span>
        </div>

        <Link
          to="/settings/legal-entity"
          className={cn(
            'inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2.5 py-1 transition-colors',
            isFailed
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-600 text-white hover:bg-amber-700',
          )}
        >
          Configurar ahora
          <ChevronRight className="h-3 w-3" />
        </Link>

        <button
          type="button"
          onClick={() => setDismissedInSession(true)}
          aria-label="Ocultar mensaje (volverá a aparecer en tu próxima sesión)"
          className={cn(
            'shrink-0 rounded-md p-1 transition-colors',
            isFailed
              ? 'text-red-700 hover:bg-red-100'
              : 'text-amber-700 hover:bg-amber-100',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
