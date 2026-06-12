import { Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

const VALID_EVENTS = ['reservation.created', 'reservation.cancelled', 'availability.changed']

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
