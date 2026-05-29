/**
 * WebhookHandlerService — dispatcher per Stripe event type.
 *
 * Sprint BILLING-CORE Day 2 — skeleton del dispatcher. Cada handler
 * específico (handleSubscriptionUpdated, handleInvoicePaid, etc.) se
 * implementa en Day 3+ cuando estén los SubscriptionService/InvoiceService.
 *
 * Idempotencia GARANTIZADA por subscription_events.stripe_event_id UNIQUE
 * constraint — si Stripe re-envía el mismo event (network glitch, retry),
 * el segundo INSERT falla y noop.
 *
 * Eventos manejados v1.1.0:
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   customer.subscription.paused
 *   customer.subscription.resumed
 *   customer.subscription.trial_will_end
 *   invoice.created
 *   invoice.paid
 *   invoice.payment_failed
 *   invoice.payment_action_required
 *   invoice.finalized
 *   invoice.voided
 *
 * Pattern: TODOS los handlers son idempotentes y reentrantes. Si el
 * proceso muere en medio del handler, el siguiente intento del webhook
 * vuelve a procesar de inicio a fin (Stripe re-envía si no recibió 2xx
 * en <30 segundos).
 */
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { BillingEmailService } from './billing-email.service'
import { SubscriptionService } from './subscription.service'

// Stripe v22 SDK no exporta types nominales (Stripe.Event, Stripe.Subscription)
// via require import. Usamos shapes mínimas inline para los handlers — al
// momento de la invocación, Stripe SDK ya validó la signature y deserializó
// el JSON, así que esta confianza está justificada. Day 3+ migrará a
// `import type Stripe from 'stripe'` consistente.
interface StripeEvent {
  id: string
  type: string
  data: { object: any }
}

interface StripeSubscription {
  id: string
  status: string
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  ended_at: number | null
  trial_end: number | null
  metadata?: Record<string, string>
}

interface StripeSetupIntent {
  id: string
  customer: string | null
  payment_method: string | null
  status: string
  metadata?: Record<string, string>
}

interface StripeInvoice {
  id: string
  number?: string | null
  receipt_number?: string | null
  customer: string
  customer_email?: string | null
  amount_paid?: number
  subscription?: string | { id: string } | null
  status: string | null
  total: number
  currency: string
  attempt_count: number
  next_payment_attempt: number | null
  status_transitions: { paid_at: number | null }
  hosted_invoice_url?: string | null
  invoice_pdf?: string | null
  charge?: string | null
  payment_intent?: string | null
  lines?: {
    data: Array<{
      description: string | null
      quantity: number | null
      amount: number
      period: { start: number; end: number }
    }>
  }
}

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingEmail: BillingEmailService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Punto de entrada del dispatcher.
   * Devuelve `{ handled: boolean, idempotent: boolean }`.
   *  - `handled=true` significa que ejecutamos lógica de negocio
   *  - `idempotent=true` significa que el event ya estaba procesado (dup)
   *
   * Throws solo si hay error de programación o DB. Errores transitorios
   * (network, etc) NO throws — re-intentamos via webhook retry de Stripe.
   */
  async handle(event: StripeEvent): Promise<{ handled: boolean; idempotent: boolean }> {
    // Idempotency check: si ya procesamos este event, noop.
    const existing = await this.prisma.subscriptionEvent.findUnique({
      where: { stripeEventId: event.id },
    })
    if (existing) {
      this.logger.log(`[WebhookHandler] Event ${event.id} (${event.type}) ya procesado — idempotent skip.`)
      return { handled: false, idempotent: true }
    }

    // Routing por tipo
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          return this.handleSubscriptionCreated(event)
        case 'customer.subscription.updated':
          return this.handleSubscriptionUpdated(event)
        case 'customer.subscription.deleted':
          return this.handleSubscriptionDeleted(event)
        case 'customer.subscription.paused':
          return this.handleSubscriptionPaused(event)
        case 'customer.subscription.resumed':
          return this.handleSubscriptionResumed(event)
        case 'customer.subscription.trial_will_end':
          return this.handleTrialWillEnd(event)
        case 'invoice.created':
        case 'invoice.finalized':
          return this.handleInvoiceUpserted(event)
        case 'invoice.paid':
          return this.handleInvoicePaid(event)
        case 'invoice.payment_failed':
          return this.handleInvoicePaymentFailed(event)
        case 'invoice.payment_action_required':
          return this.handleInvoicePaymentActionRequired(event)
        case 'invoice.voided':
          return this.handleInvoiceVoided(event)
        // Setup intent — solo procesamos los del flow Netflix (Sprint NETFLIX-TRIAL).
        // metadata.zenix_kind=NETFLIX_TRIAL_CARD_CAPTURE → SubscriptionService
        // activa Sub real post-trial card capture. Cualquier otro setup_intent
        // (Customer Portal payment method update, etc.) lo manejan los handlers
        // de customer.subscription.updated.
        //
        // NOTA HISTÓRICA: en sprints anteriores (PMS Mx-1) existía dispatch a
        // PaymentsService.onSetupIntentSucceeded para guardar tarjeta del huésped
        // al check-in para garantía de no-show. Esa feature fue eliminada
        // 2026-05-29 por estar fuera del scope del producto (Stripe solo se usa
        // para SaaS subscription Zenix + Booking Engine futuro).
        case 'setup_intent.succeeded':
          return this.handleSetupIntentSucceeded(event)
        // BILLING-DAY1 (Sprint 2026-05-29) — Stripe Checkout mode='subscription'
        // dispara este evento cuando el cobro de la primera mensualidad
        // queda exitoso. Filtramos por metadata.zenix_kind='DAY1_IMMEDIATE_CHARGE'
        // para no procesar otras checkout sessions (e.g. Customer Portal addCard).
        case 'checkout.session.completed':
          return this.handleCheckoutSessionCompleted(event)
        default:
          // Event tipo no manejado — log + return sin acción.
          // Importante: NO bloqueamos el webhook (Stripe espera 2xx).
          this.logger.debug(`[WebhookHandler] Event type ${event.type} no manejado — skip.`)
          return { handled: false, idempotent: false }
      }
    } catch (err) {
      this.logger.error(
        `[WebhookHandler] Error procesando event ${event.id} (${event.type}): ${String(err)}`,
      )
      // Re-throw para que el controller responda 500 y Stripe reintente.
      throw err
    }
  }

  // ─── Handlers — skeleton (lógica real Day 3+) ─────────────────────────

  private async handleSubscriptionCreated(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    await this.logEvent(event, dbSubId, 'CREATED', {
      stripeStatus: sub.status,
      planTier: sub.metadata?.zenix_tier ?? null,
    })
    this.logger.log(`[WebhookHandler] subscription.created ${sub.id} status=${sub.status}`)
    return { handled: true, idempotent: false }
  }

  private async handleSubscriptionUpdated(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    if (!dbSubId) {
      this.logger.warn(`[WebhookHandler] subscription.updated ${sub.id} sin row local — skip`)
      return { handled: false, idempotent: false }
    }
    // Day 3+ SubscriptionService actualiza status/period/etc local
    await this.logEvent(event, dbSubId, 'PLAN_CHANGED', {
      stripeStatus: sub.status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    })
    return { handled: true, idempotent: false }
  }

  private async handleSubscriptionDeleted(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'CANCELLED', {
      stripeStatus: sub.status,
      endedAt: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
    })
    return { handled: true, idempotent: false }
  }

  private async handleSubscriptionPaused(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PAUSED', { stripeStatus: sub.status })
    return { handled: true, idempotent: false }
  }

  private async handleSubscriptionResumed(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'RESUMED', { stripeStatus: sub.status })
    return { handled: true, idempotent: false }
  }

  private async handleTrialWillEnd(event: StripeEvent) {
    const sub = event.data.object as StripeSubscription
    const dbSubId = await this.findSubscriptionIdByStripeId(sub.id)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'REMINDER_SENT', {
      kind: 'trial_will_end',
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    })
    // Day 18 BillingReminderScheduler dispatch email D-3 trial-end al Org Owner
    return { handled: true, idempotent: false }
  }

  private async handleInvoiceUpserted(event: StripeEvent) {
    const inv = event.data.object as StripeInvoice
    const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (!stripeSubId) return { handled: false, idempotent: false }
    const dbSubId = await this.findSubscriptionIdByStripeId(stripeSubId)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PLAN_CHANGED', {
      kind: event.type, // 'invoice.created' | 'invoice.finalized'
      invoiceId: inv.id,
      status: inv.status,
      total: inv.total / 100,
      currency: inv.currency,
    })
    // Day 3+ InvoiceService crea/actualiza row local
    return { handled: true, idempotent: false }
  }

  private async handleInvoicePaid(event: StripeEvent) {
    const inv = event.data.object as StripeInvoice
    const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (!stripeSubId) return { handled: false, idempotent: false }
    const dbSubId = await this.findSubscriptionIdByStripeId(stripeSubId)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PAYMENT_SUCCEEDED', {
      invoiceId: inv.id,
      total: inv.total / 100,
      currency: inv.currency,
      paidAt: inv.status_transitions.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : new Date(),
    })

    // Send receipt email — best-effort, no falla el webhook si email errors.
    // Idempotency: el dispatcher (línea ~94) ya skip-ea events duplicados via
    // StripeWebhookEvent.processedAt, así no re-enviamos por re-delivery.
    try {
      await this.billingEmail.sendReceipt({
        id: inv.id,
        number: inv.number ?? null,
        receipt_number: inv.receipt_number ?? null,
        customer: inv.customer,
        customer_email: inv.customer_email ?? null,
        amount_paid: inv.amount_paid ?? inv.total,
        currency: inv.currency,
        status: inv.status ?? 'paid',
        status_transitions: inv.status_transitions,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
        subscription: stripeSubId,
        lines: inv.lines ?? { data: [] },
        charge: inv.charge ?? null,
        payment_intent: inv.payment_intent ?? null,
      })
    } catch (err) {
      this.logger.error(
        `[WebhookHandler] Receipt email falló para invoice ${inv.id}: ${String(err).slice(0, 200)}`,
      )
    }

    return { handled: true, idempotent: false }
  }

  private async handleInvoicePaymentFailed(event: StripeEvent) {
    const inv = event.data.object as StripeInvoice
    const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (!stripeSubId) return { handled: false, idempotent: false }
    const dbSubId = await this.findSubscriptionIdByStripeId(stripeSubId)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PAYMENT_FAILED', {
      invoiceId: inv.id,
      attemptCount: inv.attempt_count,
      nextPaymentAttempt: inv.next_payment_attempt
        ? new Date(inv.next_payment_attempt * 1000)
        : null,
    })
    // Day 20 DunningEscalationScheduler activa escalación email→WhatsApp→read-only
    return { handled: true, idempotent: false }
  }

  private async handleInvoicePaymentActionRequired(event: StripeEvent) {
    const inv = event.data.object as StripeInvoice
    const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (!stripeSubId) return { handled: false, idempotent: false }
    const dbSubId = await this.findSubscriptionIdByStripeId(stripeSubId)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PAYMENT_FAILED', {
      invoiceId: inv.id,
      kind: 'action_required',
      reason: '3DS_authentication_required_or_similar',
    })
    return { handled: true, idempotent: false }
  }

  private async handleInvoiceVoided(event: StripeEvent) {
    const inv = event.data.object as StripeInvoice
    const stripeSubId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
    if (!stripeSubId) return { handled: false, idempotent: false }
    const dbSubId = await this.findSubscriptionIdByStripeId(stripeSubId)
    if (!dbSubId) return { handled: false, idempotent: false }
    await this.logEvent(event, dbSubId, 'PLAN_CHANGED', {
      kind: 'invoice_voided',
      invoiceId: inv.id,
    })
    return { handled: true, idempotent: false }
  }

  /**
   * setup_intent.succeeded — Netflix-style trial card capture complete.
   *
   * Cliente completó Stripe Checkout en mode=setup. Stripe valida la tarjeta
   * con $0 SetupIntent y dispara este webhook con `customer` + `payment_method`
   * adjuntos. Delegamos a SubscriptionService.activateAfterSetupIntent que:
   *   1. Attach PM como default del Customer
   *   2. Crea la Stripe Subscription REAL con default_payment_method +
   *      trial_period_days (de Subscription.pendingTrialDays) +
   *      pendingCouponId si aplica
   *   3. Update local Sub: status='trialing', stripeSubscriptionId real,
   *      setupIntentId, cardCapturedAt
   *
   * Idempotency: si Sub ya tiene stripeSubscriptionId real (sin prefix
   * 'pending_'), activateAfterSetupIntent retorna sin tocar Stripe.
   */
  private async handleSetupIntentSucceeded(event: StripeEvent) {
    const intent = event.data.object as StripeSetupIntent
    // Solo procesamos los SetupIntents originados de nuestro flow Netflix
    // (metadata.zenix_kind='NETFLIX_TRIAL_CARD_CAPTURE'). Otros SetupIntents
    // pueden venir de Customer Portal (cliente actualizando método de pago en
    // sub activa) — esos los maneja `customer.subscription.updated`.
    if (intent.metadata?.zenix_kind !== 'NETFLIX_TRIAL_CARD_CAPTURE') {
      this.logger.debug(
        `[WebhookHandler] setup_intent.succeeded ${intent.id} sin zenix_kind=NETFLIX_TRIAL_CARD_CAPTURE — skip`,
      )
      return { handled: false, idempotent: false }
    }
    try {
      const result = await this.subscriptionService.activateAfterSetupIntent(intent.id)
      if (result.activated && result.subscription) {
        await this.logEvent(event, result.subscription.id, 'CREATED', {
          kind: 'netflix_trial_activation',
          setupIntentId: intent.id,
          stripeSubscriptionId: result.subscription.stripeSubscriptionId,
        })
      }
      this.logger.log(
        `[WebhookHandler] setup_intent.succeeded ${intent.id} → activated=${result.activated} reason=${(result as any).reason ?? 'ok'}`,
      )
      return { handled: result.activated, idempotent: !result.activated }
    } catch (err) {
      this.logger.error(
        `[WebhookHandler] setup_intent.succeeded ${intent.id} failed: ${String(err).slice(0, 300)}`,
      )
      throw err
    }
  }

  /**
   * BILLING-DAY1 (Sprint 2026-05-29) — checkout.session.completed
   * cuando session.mode === 'subscription'. Dispara la transición local
   * `pending_payment_method` → `active` para subscriptions creadas
   * con cobro inmediato (trialDays=0).
   *
   * Filtro: metadata.zenix_kind === 'DAY1_IMMEDIATE_CHARGE'. Otras
   * checkout sessions (Customer Portal, future direct booking engine)
   * pasarán por handlers distintos.
   *
   * Idempotencia: `activateAfterSubscriptionCheckout` chequea que la
   * Sub local no tenga ya un `stripeSubscriptionId` real antes de
   * persistir. Webhook retry-safe.
   */
  private async handleCheckoutSessionCompleted(event: StripeEvent) {
    const session = event.data.object as {
      id: string
      mode: string
      payment_status?: string
      metadata?: Record<string, string>
    }

    // Solo procesamos sessions Day-1 (mode=subscription + nuestro marker).
    // Customer Portal y otros flows tendrían distinto zenix_kind.
    if (session.mode !== 'subscription' || session.metadata?.zenix_kind !== 'DAY1_IMMEDIATE_CHARGE') {
      this.logger.debug(
        `[WebhookHandler] checkout.session.completed ${session.id} mode=${session.mode} kind=${session.metadata?.zenix_kind ?? '∅'} — skip`,
      )
      return { handled: false, idempotent: false }
    }

    try {
      const result = await this.subscriptionService.activateAfterSubscriptionCheckout(session.id)
      if (result.activated && result.subscription) {
        await this.logEvent(event, result.subscription.id, 'CREATED', {
          kind: 'day1_immediate_charge_activation',
          checkoutSessionId: session.id,
          stripeSubscriptionId: result.subscription.stripeSubscriptionId,
        })
      }
      this.logger.log(
        `[WebhookHandler] checkout.session.completed ${session.id} → activated=${result.activated} reason=${(result as any).reason ?? 'ok'}`,
      )
      return { handled: result.activated, idempotent: !result.activated }
    } catch (err) {
      this.logger.error(
        `[WebhookHandler] checkout.session.completed ${session.id} failed: ${String(err).slice(0, 300)}`,
      )
      throw err
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  private async findSubscriptionIdByStripeId(stripeSubId: string): Promise<string | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: stripeSubId },
      select: { id: true },
    })
    return sub?.id ?? null
  }

  /**
   * Append entry a subscription_events. UNIQUE constraint en stripe_event_id
   * provee idempotencia: si el mismo event llega 2 veces, el segundo INSERT
   * lanza P2002 que ignoramos.
   *
   * Si `subscriptionId` es null (evento sin subscription local existente
   * — e.g. created antes que el activate complete), skipeamos el event log
   * (no podemos insertar sin subscriptionId NOT NULL).
   */
  private async logEvent(
    event: StripeEvent,
    subscriptionId: string | null,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!subscriptionId) {
      this.logger.debug(
        `[WebhookHandler] Skip logEvent — subscriptionId null for ${event.type} ${event.id}`,
      )
      return
    }
    try {
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId,
          type,
          payload: payload as never,
          stripeEventId: event.id,
        },
      })
    } catch (err: unknown) {
      // P2002 = UNIQUE violation — idempotent skip, no error real
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        this.logger.debug(`[WebhookHandler] Event ${event.id} ya en DB — idempotent skip on insert.`)
        return
      }
      throw err
    }
  }
}
