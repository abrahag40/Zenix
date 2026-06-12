import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

const VALID_EVENTS = ['reservation.created', 'reservation.cancelled', 'availability.changed']

/**
 * Valida la URL del webhook contra SSRF: exige http(s) y rechaza hosts internos
 * (loopback, link-local cloud-metadata 169.254, rangos privados RFC1918). El
 * dispatcher hace fetch server-side → sin esto un consultor podría apuntar a
 * `http://169.254.169.254/...` (metadata IAM) o a `localhost`. Chequeo sintáctico
 * (sin resolución DNS — un atacante con DNS-rebinding requeriría más; mitigación
 * base suficiente para el piloto con consultores de confianza).
 */
function assertSafeWebhookUrl(raw: string): void {
  let u: URL
  try { u = new URL(raw) } catch { throw new BadRequestException('URL de webhook inválida') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new BadRequestException('El webhook debe usar http(s)')
  }
  const host = u.hostname.toLowerCase()
  const blocked =
    host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.localhost') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.internal') || host.endsWith('.local')
  if (blocked) throw new BadRequestException(`Host de webhook no permitido: ${host}`)
}

/**
 * WebhookSubscriptionService — BOOKING-ENGINE B3.
 *
 * CRUD de subscriptions del website del hotel. Lo consume la UI del consultor
 * (Nova, B4) — análogo a la gestión de API keys. El `secret` se genera y se
 * devuelve UNA vez (el developer lo guarda para verificar X-Zenix-Signature).
 */
@Injectable()
export class WebhookSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(propertyId: string, url: string, events: string[]) {
    assertSafeWebhookUrl(url)
    const filtered = events.filter((e) => VALID_EVENTS.includes(e))
    const secret = `whsec_${randomBytes(24).toString('hex')}`
    const sub = await this.prisma.webhookSubscription.create({
      data: { propertyId, url, events: filtered.length ? filtered : VALID_EVENTS, secret },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    })
    return { ...sub, secret } // secret sólo en la respuesta de creación
  }

  async list(propertyId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { propertyId },
      select: { id: true, url: true, events: true, active: true, failureCount: true, lastDeliveryAt: true, disabledAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async setActive(propertyId: string, id: string, active: boolean) {
    const sub = await this.prisma.webhookSubscription.findFirst({ where: { id, propertyId } })
    if (!sub) throw new NotFoundException('Webhook no encontrado')
    return this.prisma.webhookSubscription.update({
      where: { id },
      data: { active, disabledAt: active ? null : new Date() },
      select: { id: true, active: true },
    })
  }
}
