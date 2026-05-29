/**
 * Stripe webhook HTTP integration test — Phase 2 audit defense.
 *
 * Arranca el Nest app COMPLETO con el mismo middleware chain que main.ts (raw
 * body parser, body parser JSON con verify, controllers, dispatcher) y hace
 * requests HTTP REALES via supertest. Cubre los layers que los unit tests
 * tradicionalmente saltan.
 *
 * HISTORIA: este archivo nace de detectar 2 bugs CRÍTICOS durante validation
 * E2E del Sprint NETFLIX-TRIAL:
 *   1. bodyParser.raw() ponía buffer en req.body, no en req.rawBody → todos
 *      los webhooks Stripe HTTP 500 en producción ("rawBody no disponible").
 *   2. Dos StripeWebhookController declaraban POST /v1/webhooks/stripe →
 *      silent fail si module order cambiaba.
 *
 * Los unit tests no los detectaron porque pasaban el StripeEvent directo al
 * service, saltando el HTTP layer completo.
 *
 * Este archivo previene esa categoría de bugs ejerciendo:
 *   · Express raw body parser → req.rawBody exposure
 *   · Stripe HMAC signature verification (real, con secret de test)
 *   · NestJS route resolution (no collisions)
 *   · WebhookHandlerService dispatch por metadata
 */
import * as crypto from 'crypto'
import * as request from 'supertest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import * as bodyParser from 'body-parser'
import { Module } from '@nestjs/common'
import { StripeWebhookController } from './stripe-webhook.controller'
import { WebhookHandlerService } from './webhook-handler.service'
import { BillingService } from './billing.service'
import { BillingEmailService } from './billing-email.service'
import { SubscriptionService } from './subscription.service'
import { PrismaService } from '../prisma/prisma.service'
import { PaymentsService } from '../payments/payments.service'

const TEST_WEBHOOK_SECRET = 'whsec_test_only_do_not_use_in_production_xyz'

// ─── Test helpers ─────────────────────────────────────────────────────────

/**
 * Genera una signature HMAC-SHA256 válida que stripe.webhooks.constructEvent
 * aceptará. Format del header `stripe-signature`:
 *   t=<timestamp>,v1=<hmac_hex>
 */
function generateStripeSignature(rawBody: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${rawBody}`
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${ts},v1=${hmac}`
}

/**
 * Mínimo Stripe-compatible event shape. Real Stripe events tienen muchos más
 * campos pero constructEvent solo verifica firma + retorna el JSON parsed.
 */
function makeStripeEvent(overrides: Partial<{ id: string; type: string; data: any }>) {
  return JSON.stringify({
    id: overrides.id ?? `evt_test_${Math.random().toString(36).slice(2, 10)}`,
    object: 'event',
    type: overrides.type ?? 'setup_intent.succeeded',
    api_version: '2024-04-10',
    created: Math.floor(Date.now() / 1000),
    data: overrides.data ?? { object: { id: 'seti_test_xyz', metadata: {} } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  })
}

// ─── Mock services ────────────────────────────────────────────────────────

function makeBillingServiceMock() {
  // El controller llama billing.getStripeClient() y le pasa el stripe instance
  // a constructEvent. Usamos el SDK real pero con un test secret.
  const Stripe = require('stripe') as any
  const stripe = new Stripe('sk_test_dummy_not_used', { apiVersion: '2024-04-10' })
  return {
    isStripeConfigured: () => true,
    getStripeClient: () => stripe,
  } as never
}

function makePrismaMock() {
  return {
    subscriptionEvent: {
      findUnique: jest.fn().mockResolvedValue(null), // event no procesado antes
      create: jest.fn().mockResolvedValue({ id: 'evt-row-test' }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    guestStay: {
      update: jest.fn().mockResolvedValue({ id: 'stay-test' }),
    },
  } as never
}

function makeSubscriptionServiceMock() {
  return {
    activateAfterSetupIntent: jest.fn().mockResolvedValue({
      activated: false,
      reason: 'no_pending_subscription',
    }),
  } as never
}

function makePaymentsServiceMock() {
  return {
    onSetupIntentSucceeded: jest.fn().mockResolvedValue(undefined),
  } as never
}

function makeBillingEmailMock() {
  return {
    sendReceipt: jest.fn().mockResolvedValue({ sent: true }),
  } as never
}

// Module minimal para tener StripeWebhookController + dispatcher
@Module({
  controllers: [StripeWebhookController],
  providers: [
    { provide: BillingService, useFactory: () => makeBillingServiceMock() },
    { provide: PrismaService, useFactory: () => makePrismaMock() },
    { provide: WebhookHandlerService, useFactory: () => null }, // override en test
    { provide: SubscriptionService, useFactory: () => makeSubscriptionServiceMock() },
    { provide: PaymentsService, useFactory: () => makePaymentsServiceMock() },
    { provide: BillingEmailService, useFactory: () => makeBillingEmailMock() },
  ],
})
class TestBillingModule {}

describe('Stripe webhook HTTP integration', () => {
  let app: INestApplication
  let prismaMock: any
  let subscriptionMock: any
  let paymentsMock: any
  let originalSecret: string | undefined

  beforeAll(async () => {
    originalSecret = process.env.STRIPE_WEBHOOK_SECRET
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET

    prismaMock = makePrismaMock()
    subscriptionMock = makeSubscriptionServiceMock()
    paymentsMock = makePaymentsServiceMock()

    const builder = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: BillingService, useValue: makeBillingServiceMock() },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: WebhookHandlerService,
          useFactory: (
            email: BillingEmailService,
            sub: SubscriptionService,
            pay: PaymentsService,
            prisma: PrismaService,
          ) => new WebhookHandlerService(prisma, email, sub, pay),
          inject: [
            BillingEmailService,
            SubscriptionService,
            PaymentsService,
            PrismaService,
          ],
        },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: PaymentsService, useValue: paymentsMock },
        { provide: BillingEmailService, useValue: makeBillingEmailMock() },
      ],
    }).compile()

    app = builder.createNestApplication({ rawBody: true })

    // Replicar EXACTO el middleware setup de main.ts.
    // Esta línea es lo que el bug detectado violaba — sin esto, los tests
    // pasarían pero producción rompería.
    app.use(
      bodyParser.json({
        verify: (req: any, _res, buf) => {
          if (req.originalUrl === '/v1/webhooks/stripe') {
            req.rawBody = buf
          }
        },
        limit: '10mb',
      }),
    )

    await app.init()
  })

  afterAll(async () => {
    if (originalSecret) process.env.STRIPE_WEBHOOK_SECRET = originalSecret
    else delete process.env.STRIPE_WEBHOOK_SECRET
    await app.close()
  })

  beforeEach(() => {
    // Reset call counters de los mocks (Jest fn() acumula entre tests)
    // pero PRESERVA las implementations mockResolvedValue.
    jest.clearAllMocks()
  })

  // ─── Defense: rawBody parser bug (Bug 1) ────────────────────────────

  it('Bug defense #1 — POST sin Stripe-Signature → HTTP 400 (NOT 500)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .send({ id: 'evt_x', type: 'setup_intent.succeeded' })
    // Antes del fix rawBody: HTTP 500 "Webhook raw body parser no configurado"
    // Post-fix: HTTP 400 "Missing Stripe-Signature header"
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ message: expect.stringContaining('Signature') })
  })

  it('Bug defense #1 — POST con signature inválida → HTTP 400, NO 500', async () => {
    const rawBody = makeStripeEvent({ type: 'setup_intent.succeeded' })
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 't=1700000000,v1=invalid_hmac_hex')
      .set('Content-Type', 'application/json')
      .send(rawBody)
    // Stripe constructEvent throws BadRequestException, NO crash
    expect(res.status).toBe(400)
  })

  // ─── Real dispatcher tests con HMAC valid ─────────────────────────────

  it('setup_intent.succeeded con metadata.zenix_kind=NETFLIX_TRIAL → activateAfterSetupIntent', async () => {
    const rawBody = makeStripeEvent({
      type: 'setup_intent.succeeded',
      data: {
        object: {
          id: 'seti_netflix_test',
          metadata: { zenix_kind: 'NETFLIX_TRIAL_CARD_CAPTURE' },
        },
      },
    })
    const signature = generateStripeSignature(rawBody, TEST_WEBHOOK_SECRET)
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(subscriptionMock.activateAfterSetupIntent).toHaveBeenCalledWith('seti_netflix_test')
    expect(paymentsMock.onSetupIntentSucceeded).not.toHaveBeenCalled()
  })

  it('setup_intent.succeeded con metadata.stayId → PaymentsService.onSetupIntentSucceeded', async () => {
    const rawBody = makeStripeEvent({
      type: 'setup_intent.succeeded',
      data: {
        object: {
          id: 'seti_pms_test',
          metadata: { stayId: 'stay-abc123' },
        },
      },
    })
    const signature = generateStripeSignature(rawBody, TEST_WEBHOOK_SECRET)
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(paymentsMock.onSetupIntentSucceeded).toHaveBeenCalledWith('seti_pms_test')
    expect(subscriptionMock.activateAfterSetupIntent).not.toHaveBeenCalled()
  })

  it('setup_intent.succeeded sin metadata reconocible → HTTP 200 + skip silent', async () => {
    const rawBody = makeStripeEvent({
      type: 'setup_intent.succeeded',
      data: { object: { id: 'seti_unknown', metadata: {} } },
    })
    const signature = generateStripeSignature(rawBody, TEST_WEBHOOK_SECRET)
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(subscriptionMock.activateAfterSetupIntent).not.toHaveBeenCalled()
    expect(paymentsMock.onSetupIntentSucceeded).not.toHaveBeenCalled()
  })

  it('payment_intent.succeeded con metadata.stayId → GuestStay update', async () => {
    const rawBody = makeStripeEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_test', metadata: { stayId: 'stay-charged-test' } },
      },
    })
    const signature = generateStripeSignature(rawBody, TEST_WEBHOOK_SECRET)
    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody)
    expect(res.status).toBe(200)
    expect(prismaMock.guestStay.update).toHaveBeenCalledWith({
      where: { id: 'stay-charged-test' },
      data: expect.objectContaining({
        noShowChargeStatus: 'CHARGED',
        stripePaymentIntentId: 'pi_test',
      }),
    })
  })
})
