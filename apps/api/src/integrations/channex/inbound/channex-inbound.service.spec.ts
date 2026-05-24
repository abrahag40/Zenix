/**
 * ChannexInboundService — Day 1 audit log + Day 2 outbox enqueue.
 *
 * acceptDelivery escribe ChannexWebhookLog + ChannexOutbox en MISMA
 * transacción (transactional outbox pattern D-CHX10). Dedup: si llega
 * un retry con la misma revisionId, el log SÍ se escribe (forense) pero
 * no se encola un job duplicado.
 */

import { Test } from '@nestjs/testing'
import { ChannexInboundService } from './channex-inbound.service'
import { PrismaService } from '../../../prisma/prisma.service'

type Mock = jest.Mock

function makePrismaMock() {
  const channexWebhookLog = { create: jest.fn().mockResolvedValue({ id: 'log-1' }) }
  const channexOutbox = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
  }
  const $transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ channexWebhookLog, channexOutbox }),
  )
  return { channexWebhookLog, channexOutbox, $transaction }
}

describe('ChannexInboundService', () => {
  let svc: ChannexInboundService
  let prisma: ReturnType<typeof makePrismaMock>

  beforeEach(async () => {
    prisma = makePrismaMock()
    const module = await Test.createTestingModule({
      providers: [
        ChannexInboundService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    svc = module.get(ChannexInboundService)
  })

  describe('acceptDelivery (Day 2)', () => {
    it('escribe log + outbox en MISMA transacción y retorna ambos ids', async () => {
      const result = await svc.acceptDelivery({
        propertyId: 'prop-1',
        eventType: 'booking_new',
        channexBookingId: 'b-1',
        channexRevisionId: 'r-1',
        payload: { event: 'booking_new' },
        signatureValid: true,
      })

      expect(result).toEqual({ logId: 'log-1', outboxId: 'outbox-1' })
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect((prisma.channexWebhookLog.create as Mock)).toHaveBeenCalled()
      expect((prisma.channexOutbox.create as Mock)).toHaveBeenCalledWith({
        data: {
          propertyId: 'prop-1',
          eventType: 'booking_new',
          channexBookingId: 'b-1',
          channexRevisionId: 'r-1',
          webhookLogId: 'log-1',
          status: 'PENDING',
          attempts: 0,
        },
        select: { id: true },
      })
    })

    it('dedup: retry con misma revisionId NO encola job, pero SÍ escribe el log', async () => {
      ;(prisma.channexOutbox.findFirst as Mock).mockResolvedValueOnce({
        id: 'outbox-existing',
        status: 'PENDING',
      })

      const result = await svc.acceptDelivery({
        propertyId: 'prop-1',
        eventType: 'booking_new',
        channexBookingId: 'b-1',
        channexRevisionId: 'r-1',
        payload: { event: 'booking_new' },
        signatureValid: true,
      })

      expect(result.logId).toBe('log-1')
      expect(result.outboxId).toBeNull()
      expect(prisma.channexWebhookLog.create).toHaveBeenCalled()
      expect(prisma.channexOutbox.create).not.toHaveBeenCalled()
    })

    it('cuando revisionId es null, encola igual (bare event send_data:false)', async () => {
      const result = await svc.acceptDelivery({
        propertyId: 'prop-1',
        eventType: 'booking_new',
        channexBookingId: null,
        channexRevisionId: null,
        payload: { event: 'booking_new' },
        signatureValid: false,
      })

      expect(result.outboxId).toBe('outbox-1')
      expect(prisma.channexOutbox.findFirst).not.toHaveBeenCalled() // skip dedup
      expect(prisma.channexOutbox.create).toHaveBeenCalled()
    })
  })

  describe('recordDelivery (Day 1 legacy)', () => {
    it('escribe solo el audit log', async () => {
      const result = await svc.recordDelivery({
        propertyId: 'prop-1',
        eventType: 'booking_new',
        channexBookingId: 'b-1',
        payload: { event: 'booking_new' },
        signatureValid: false,
      })
      expect(result).toEqual({ logId: 'log-1' })
    })
  })
})
