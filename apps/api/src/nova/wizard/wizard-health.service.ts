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
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import type {
  HealthCheckChannexDto,
  HealthCheckPacDto,
  HealthCheckResponse,
  HealthCheckSmtpDto,
  HealthCheckStripeDto,
} from './dto/wizard-dto'

@Injectable()
export class WizardHealthService {
  private readonly logger = new Logger(WizardHealthService.name)

  constructor(private readonly channex: ChannexGateway) {}

  // ─── Channex (REAL) ──────────────────────────────────────────────

  async checkChannex(dto: HealthCheckChannexDto): Promise<HealthCheckResponse> {
    const start = Date.now()
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

  // ─── Stripe (STUB Day 16) ────────────────────────────────────────

  async checkStripe(_dto: HealthCheckStripeDto): Promise<HealthCheckResponse> {
    const start = Date.now()
    await this.simulateLatency(500, 900)
    const latencyMs = Date.now() - start
    // Day 17 wirea: stripe.charges.create({amount: 100, currency: 'usd'}) + immediate refund
    return {
      status: 'success',
      message: 'Test charge $1 USD procesado y reembolsado (stub — Day 17 wirea Stripe SDK)',
      latencyMs,
      detail: { stub: true, chargeId: `ch_test_${Date.now()}` },
    }
  }

  // ─── PAC (STUB Day 16) ──────────────────────────────────────────

  async checkPac(dto: HealthCheckPacDto): Promise<HealthCheckResponse> {
    const start = Date.now()
    await this.simulateLatency(700, 1400)
    const latencyMs = Date.now() - start
    // Day 17 wirea: PAC adapter strategy (Facturama/SW Sapien/DIAN/SUNAT) con CFDI mock
    // El caso más común al activar es "cliente aún no contrató PAC" → warning con override
    return {
      status: 'warning',
      message: `PAC sandbox ${dto.pacAdapter} no responde con esas credenciales. El cliente puede activar sin PAC y contratarlo después (los folios quedarán con requiresFiscalReview=true hasta entonces).`,
      latencyMs,
      detail: { stub: true, pacAdapter: dto.pacAdapter, allowOverride: true },
    }
  }

  // ─── SMTP (STUB Day 16) ─────────────────────────────────────────

  async checkSmtp(dto: HealthCheckSmtpDto): Promise<HealthCheckResponse> {
    const start = Date.now()
    await this.simulateLatency(400, 800)
    const latencyMs = Date.now() - start
    // Day 17 wirea: Resend API con DKIM check + delivery confirmation
    return {
      status: 'success',
      message: `Email test entregado a ${dto.toAddress} (stub — Day 17 wirea Resend con DKIM check)`,
      latencyMs,
      detail: { stub: true, recipient: dto.toAddress },
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const wait = minMs + Math.random() * (maxMs - minMs)
    return new Promise((r) => setTimeout(r, wait))
  }
}
