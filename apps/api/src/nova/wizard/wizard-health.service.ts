/**
 * WizardHealthService — 4 health-checks pre-activación (§173 D-NOVA-15).
 *
 *   (a) Channex API ping — usa ChannexGateway.listProperties() real
 *   (b) Stripe test charge $1 + refund — STUB Day 16 (Day 17 wirea Stripe SDK)
 *   (c) PAC sandbox stamp — STUB Day 16 (Day 17 wirea Facturama/SW Sapien adapters)
 *   (d) SMTP test email — STUB Day 16 (Day 17 wirea Resend)
 *
 * Estado de los stubs:
 *   · Channex: REAL — falla si api-key inválida o property no accesible
 *   · Stripe: stub success (latencia 500-900ms simulada)
 *   · PAC: stub warning (alineado con frontend mock — "credenciales no configuradas"
 *          es el caso operativo más común al activar primer cliente)
 *   · SMTP: stub success
 *
 * Cuando se ejecuta el sprint OPS-α v1.0.4 con Stripe SDK + PAC adapters
 * reales + Resend wirea, estos stubs se reemplazan por llamadas live sin
 * cambiar la interface del controller (frontend no se entera).
 */
import { Injectable, Logger } from '@nestjs/common'
import Stripe = require('stripe')
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { ActivationEmailService } from './activation-email.service'
import { PacAdapterRegistry } from './pac/pac-adapter.registry'
import type {
  HealthCheckChannexDto,
  HealthCheckPacDto,
  HealthCheckResponse,
  HealthCheckSmtpDto,
  HealthCheckStripeDto,
} from './dto/wizard-dto'

type StripeInstance = InstanceType<typeof Stripe>

@Injectable()
export class WizardHealthService {
  private readonly logger = new Logger(WizardHealthService.name)
  private stripe: StripeInstance | null = null

  constructor(
    private readonly channex: ChannexGateway,
    private readonly emailService: ActivationEmailService,
    private readonly pacRegistry: PacAdapterRegistry,
  ) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })
    } else {
      this.logger.warn('[WizardHealth] STRIPE_SECRET_KEY no configurado — stripe check queda en modo stub')
    }
  }

  // ─── Channex (REAL) ──────────────────────────────────────────────

  async checkChannex(dto: HealthCheckChannexDto): Promise<HealthCheckResponse> {
    const start = Date.now()
    // v0.1.0: sin CHANNEX_API_KEY el Channel Manager (OTAs) queda inactivo — eso
    // NO es un error que bloquee la activación, es un warning overridable (el
    // cliente activa el PMS ahora y conecta Channex en v0.2.0). Patrón de Stripe.
    if (!process.env.CHANNEX_API_KEY) {
      return {
        status: 'warning',
        message:
          'CHANNEX_API_KEY no configurado — el Channel Manager (OTAs) queda inactivo. El cliente puede activar el PMS ahora; se conecta Channex después (v0.2.0).',
        latencyMs: 0,
        detail: { configured: false },
      }
    }
    try {
      const properties = await this.channex.listProperties()
      const latencyMs = Date.now() - start

      if (dto.channexPropertyId) {
        const match = properties.find((p) => p.id === dto.channexPropertyId)
        if (!match) {
          return {
            status: 'error',
            message: `Property ${dto.channexPropertyId.slice(0, 8)}… no accesible con la api-key configurada. Revisa el property mapping en Channex extranet.`,
            latencyMs,
            detail: { propertiesAccessible: properties.length },
          }
        }
        return {
          status: 'success',
          message: `Property ${match.title} accesible · ${match.currency} · ${match.timezone}`,
          latencyMs,
          detail: { propertyId: match.id, currency: match.currency, timezone: match.timezone },
        }
      }

      // Sin propertyId — devolvemos status general de la api-key
      if (properties.length === 0) {
        return {
          status: 'warning',
          message: 'API-key funciona pero no hay properties accesibles. Configura mapping en Channex.',
          latencyMs,
          detail: { propertiesAccessible: 0 },
        }
      }
      return {
        status: 'success',
        message: `${properties.length} ${properties.length === 1 ? 'property accesible' : 'properties accesibles'} con la api-key configurada`,
        latencyMs,
        detail: { propertiesAccessible: properties.length },
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      this.logger.warn(`[WizardHealth] Channex ping failed: ${String(err)}`)
      return {
        status: 'error',
        message:
          err instanceof Error && err.message.includes('401')
            ? 'API-key inválida o expirada. Genera una nueva en Channex extranet → API.'
            : err instanceof Error
              ? `Channex API no responde: ${err.message.slice(0, 120)}`
              : 'Error desconocido al contactar Channex',
        latencyMs,
      }
    }
  }

  // ─── Stripe (REAL Day 18) ────────────────────────────────────────

  async checkStripe(_dto: HealthCheckStripeDto): Promise<HealthCheckResponse> {
    const start = Date.now()

    if (!this.stripe) {
      const latencyMs = Date.now() - start
      return {
        status: 'warning',
        message:
          'STRIPE_SECRET_KEY no configurado en el server — Stripe queda en modo stub. El cliente puede activar pero NO cobrará tarjetas hasta configurar.',
        latencyMs,
        detail: { stub: true },
      }
    }

    try {
      // Stripe best practice: usar Balance retrieve como health check.
      // NO crear test charges reales — generan ruido en el dashboard del cliente
      // y consumen rate-limit. Balance es read-only, idempotente, gratis.
      // Si retrieve funciona → credenciales son válidas + cuenta accesible.
      const balance = await this.stripe.balance.retrieve()
      const latencyMs = Date.now() - start
      const totalAvailable = balance.available.reduce((sum, b) => sum + b.amount, 0)

      return {
        status: 'success',
        message: `Stripe accesible · balance ${(totalAvailable / 100).toFixed(2)} ${balance.available[0]?.currency?.toUpperCase() || 'USD'}`,
        latencyMs,
        detail: {
          mode: 'live',
          currencies: balance.available.map((b) => b.currency),
        },
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      const e = err as { type?: string; message: string }
      this.logger.warn(`[WizardHealth] Stripe check failed: ${e.message}`)
      return {
        status: 'error',
        message:
          e.type === 'StripeAuthenticationError'
            ? 'API key Stripe inválida. Verifica STRIPE_SECRET_KEY en server config.'
            : `Stripe API error: ${e.message.slice(0, 120)}`,
        latencyMs,
        detail: { errorType: e.type },
      }
    }
  }

  // ─── PAC (REAL Day 19 — adapter Strategy pattern) ─────────────

  async checkPac(dto: HealthCheckPacDto): Promise<HealthCheckResponse> {
    const adapter = this.pacRegistry.find(dto.pacAdapter)
    if (!adapter) {
      return {
        status: 'error',
        message: `PAC adapter "${dto.pacAdapter}" no soportado. Adapters disponibles: ${this.pacRegistry.list().map((m) => m.id).join(', ')}`,
        latencyMs: 0,
      }
    }

    // Day 19: el wizard NO tiene aún la pacCredentials del cliente (esa
    // configuración llega post-activación cuando contrate Facturama).
    // healthCheck(null) devuelve warning con copy operativo correcto.
    // El consultor puede activar con override; el cliente configura PAC
    // después desde /nova/settings/legal-entities.
    const result = await adapter.healthCheck(null)
    return {
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs,
      detail: { pacAdapter: dto.pacAdapter, ...result.detail },
    }
  }

  // ─── SMTP (REAL Day 18 — Resend) ───────────────────────────────

  async checkSmtp(dto: HealthCheckSmtpDto): Promise<HealthCheckResponse> {
    const result = await this.emailService.sendHealthCheckEmail(dto.toAddress)
    return {
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs,
      detail: { provider: 'resend', recipient: dto.toAddress },
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const wait = minMs + Math.random() * (maxMs - minMs)
    return new Promise((r) => setTimeout(r, wait))
  }
}
