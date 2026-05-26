/**
 * MxFacturamaAdapter — adapter PAC México vía Facturama (Day 19).
 *
 * Facturama es uno de los 2 PACs preferidos para CFDI 4.0 en Zenix
 * (junto a SW Sapien). Sandbox: https://apisandbox.facturama.mx
 * Production: https://api.facturama.mx
 *
 * Day 19 scope:
 *   · healthCheck() — wirea GET /api/Profile (endpoint público de verify
 *     credentials). Real call si credentials configuradas; warning si no.
 *   · metadata() — síncrono, devuelve display info.
 *   · stampInvoice() — Day 20+ (v1.0.2 CFDI-CORE sprint).
 *
 * Auth Facturama: HTTP Basic con username + apiKey.
 * Documentación: https://apisandbox.facturama.mx/Sandbox
 */
import { Injectable, Logger } from '@nestjs/common'
import type {
  IPacAdapter,
  PacAdapterMetadata,
  PacCredentials,
  PacHealthCheckResult,
} from './pac-adapter.interface'

interface FacturamaConfig {
  username?: string
  apiKey?: string
  sandbox?: boolean // default true en Day 19, swap a false al activar prod
}

@Injectable()
export class MxFacturamaAdapter implements IPacAdapter {
  private readonly logger = new Logger(MxFacturamaAdapter.name)

  metadata(): PacAdapterMetadata {
    return {
      id: 'MX_FACTURAMA',
      countryCode: 'MX',
      displayName: 'Facturama (México, CFDI 4.0)',
      providerHomepage: 'https://facturama.mx',
      implementationStatus: 'SANDBOX', // Day 19 — healthCheck real, stamping stub
    }
  }

  async healthCheck(credentials: PacCredentials | null): Promise<PacHealthCheckResult> {
    const start = Date.now()

    // Caso 1 — no hay credenciales configuradas todavía (wizard activate
    // Day 16 dejó pacCredentials.pendingConfiguration=true como placeholder).
    if (!credentials || !credentials.configured) {
      return {
        status: 'warning',
        message:
          'Facturama no contratado todavía — el cliente puede activar y operar sin emitir CFDI. ' +
          'Para habilitar facturación, contrata Facturama en facturama.mx, agrega username + apiKey ' +
          'en /nova/settings/legal-entities, y vuelve a correr este health check.',
        latencyMs: Date.now() - start,
        detail: { configured: false, allowOverride: true },
      }
    }

    const config = credentials.config as FacturamaConfig
    if (!config.username || !config.apiKey) {
      return {
        status: 'error',
        message:
          'pacCredentials.config faltan campos requeridos (username + apiKey). ' +
          'Revisa /nova/settings/legal-entities.',
        latencyMs: Date.now() - start,
      }
    }

    const baseUrl = config.sandbox === false
      ? 'https://api.facturama.mx'
      : 'https://apisandbox.facturama.mx'

    // Auth Basic: base64(username:apiKey)
    const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.apiKey}`).toString('base64')

    try {
      // GET /api/Profile devuelve datos del contribuyente sin emitir nada.
      // Health check ideal: read-only, idempotente, NO consume saldo de timbrado.
      const res = await fetch(`${baseUrl}/api/Profile`, {
        method: 'GET',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      })
      const latencyMs = Date.now() - start

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'error',
          message: 'Credenciales Facturama rechazadas (HTTP ' + res.status + '). Verifica username + apiKey.',
          latencyMs,
        }
      }
      if (!res.ok) {
        return {
          status: 'error',
          message: `Facturama API error HTTP ${res.status}. Reintenta o contacta soporte Facturama.`,
          latencyMs,
        }
      }

      const json = (await res.json().catch(() => ({}))) as { Rfc?: string; Name?: string }
      return {
        status: 'success',
        message: `Facturama ${config.sandbox === false ? 'PRODUCTION' : 'sandbox'} OK · RFC ${json.Rfc ?? '?'} · ${json.Name ?? 'sin nombre'}`,
        latencyMs,
        detail: { mode: config.sandbox === false ? 'production' : 'sandbox', rfc: json.Rfc },
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      this.logger.warn(`[MxFacturama] healthCheck network error: ${String(err).slice(0, 200)}`)
      return {
        status: 'error',
        message: `Network error contactando Facturama: ${String(err).slice(0, 120)}`,
        latencyMs,
      }
    }
  }
}
