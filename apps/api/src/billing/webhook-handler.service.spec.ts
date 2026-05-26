/**
 * WebhookHandlerService — unit tests (Day 2).
 *
 * Cobertura:
 *   · Idempotency via stripeEventId UNIQUE
 *   · Event type dispatching (subscription + invoice)
 *   · Unknown event type — graceful skip
 *   · Skip when subscription no existe local (created antes que activate)
 *   · UNIQUE constraint violation — idempotent skip (P2002 swallowed)
 *   · Error throw para que controller responda 500 (Stripe retry)
 */
import { WebhookHandlerService } from './webhook-handler.service'

function makeEvent(overrides: Partial<{ id: string; type: string; object: unknown }> = {}) {
  return {
    id: overrides.id ?? `evt_test_${Math.random().toString(36).slice(2, 10)}`,
    type: overrides.type ?? 'customer.subscription.updated',
    data: { object: overrides.object ?? { id: 'sub_test_default' } },
  } as never
}

function makePrismaMock(opts: { existingEvent?: boolean; existingSub?: boolean; throwP2002?: boolean } = {}) {
  return {
    subscriptionEvent: {
      findUnique: jest.fn().mockResolvedValue(opts.existingEvent ? { id: 'evt-row-1' } : null),
      create: jest.fn().mockImplementation(async () => {
        if (opts.throwP2002) {
          const err = new Error('Unique constraint violation') as Error & { code: string }
          err.code = 'P2002'
          throw err
        }
        return { id: 'new-evt-row' }
      }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(
        opts.existingSub ? { id: 'local-sub-id-1' } : null,
      ),
    },
  } as never
}

describe('WebhookHandlerService', () => {
  describe('idempotency', () => {
    it('skip si stripeEventId ya existe en DB', async () => {
      const prisma = makePrismaMock({ existingEvent: true })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(makeEvent({ id: 'evt_dup' }))
      expect(result).toEqual({ handled: false, idempotent: true })
      expect((prisma as never as { subscriptionEvent: { create: jest.Mock } }).subscriptionEvent.create).not.toHaveBeenCalled()
    })

    it('UNIQUE constraint P2002 al insertar — swallow + idempotent', async () => {
      const prisma = makePrismaMock({ existingEvent: false, existingSub: true, throwP2002: true })
      const service = new WebhookHandlerService(prisma)
      // No throws — el handler P2002 lo swallow
      const result = await service.handle(
        makeEvent({
          type: 'customer.subscription.updated',
          object: {
            id: 'sub_t',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        }),
      )
      expect(result.handled).toBe(true)
    })
  })

  describe('dispatch', () => {
    it('routes customer.subscription.created', async () => {
      const prisma = makePrismaMock({ existingSub: true })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({
          type: 'customer.subscription.created',
          object: { id: 'sub_x', status: 'active' },
        }),
      )
      expect(result.handled).toBe(true)
    })

    it('routes customer.subscription.updated con sub local existente', async () => {
      const prisma = makePrismaMock({ existingSub: true })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({
          type: 'customer.subscription.updated',
          object: {
            id: 'sub_x',
            status: 'past_due',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        }),
      )
      expect(result.handled).toBe(true)
    })

    it('skip customer.subscription.updated si sub local NO existe', async () => {
      const prisma = makePrismaMock({ existingSub: false })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({
          type: 'customer.subscription.updated',
          object: {
            id: 'sub_unknown',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        }),
      )
      expect(result).toEqual({ handled: false, idempotent: false })
    })

    it('routes invoice.paid', async () => {
      const prisma = makePrismaMock({ existingSub: true })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({
          type: 'invoice.paid',
          object: {
            id: 'in_x',
            subscription: 'sub_test',
            status: 'paid',
            total: 240000, // $2400 MXN en centavos
            currency: 'mxn',
            status_transitions: { paid_at: 1700000000 },
          },
        }),
      )
      expect(result.handled).toBe(true)
    })

    it('routes invoice.payment_failed', async () => {
      const prisma = makePrismaMock({ existingSub: true })
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({
          type: 'invoice.payment_failed',
          object: {
            id: 'in_x',
            subscription: 'sub_test',
            status: 'open',
            total: 240000,
            currency: 'mxn',
            attempt_count: 1,
            next_payment_attempt: 1700259200,
            status_transitions: { paid_at: null },
          },
        }),
      )
      expect(result.handled).toBe(true)
    })

    it('graceful skip para event type desconocido', async () => {
      const prisma = makePrismaMock()
      const service = new WebhookHandlerService(prisma)
      const result = await service.handle(
        makeEvent({ type: 'charge.captured', object: {} }),
      )
      expect(result).toEqual({ handled: false, idempotent: false })
    })
  })

  describe('error propagation', () => {
    it('re-throws errores no-P2002 para que Stripe reintente', async () => {
      const prisma = {
        subscriptionEvent: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockRejectedValue(new Error('DB connection lost')),
        },
        subscription: {
          findUnique: jest.fn().mockResolvedValue({ id: 'local-1' }),
        },
      } as never
      const service = new WebhookHandlerService(prisma)
      await expect(
        service.handle(
          makeEvent({
            type: 'customer.subscription.updated',
            object: {
              id: 'sub_x',
              status: 'active',
              current_period_start: 1700000000,
              current_period_end: 1702592000,
              cancel_at_period_end: false,
            },
          }),
        ),
      ).rejects.toThrow('DB connection lost')
    })
  })
})
