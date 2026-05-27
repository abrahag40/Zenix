/**
 * BillingEmailService — wrapper para enviar emails transaccionales
 * relacionados con billing (receipt, payment failed, trial ending,
 * subscription cancelled).
 *
 * Sprint BILLING-CORE post-Day 8 — wires the receipt template a Resend
 * y al webhook handler de Stripe.
 *
 * Pattern:
 *   1. Webhook handler recibe evento Stripe (e.g. invoice.paid)
 *   2. Llama a billingEmailService.sendReceipt(invoiceData)
 *   3. Service mapea Stripe Invoice → BillingReceiptInput (variables del template)
 *   4. Service llama renderBillingReceipt(input) → { subject, html, text }
 *   5. Service envía via Resend REST API
 *   6. AuditLog del send
 *
 * Idempotency: el deduping del webhook (StripeWebhookEvent.processedAt)
 * previene re-sends por re-delivery de Stripe. No re-check aquí.
 */
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../nova/audit/audit-log.service'
import {
  renderBillingReceipt,
  type BillingReceiptInput,
} from '../templates/email/billing'

// ─────────────────────────────────────────────────────────────────────
// Tipos Stripe locales (workaround namespace issues SDK v22)
// ─────────────────────────────────────────────────────────────────────

interface StripeInvoiceForReceipt {
  id: string
  number: string | null
  receipt_number: string | null
  customer: string
  customer_email: string | null
  amount_paid: number // en centavos
  currency: string
  status: string
  status_transitions: { paid_at: number | null }
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  subscription: string | null
  lines: {
    data: Array<{
      description: string | null
      quantity: number | null
      amount: number
      period: { start: number; end: number }
    }>
  }
  charge: string | null
  payment_intent: string | null
}

export interface SendReceiptResult {
  sent: boolean
  resendMessageId?: string
  reason?: 'no-key' | 'no-email' | 'api-error' | 'network'
}

// ─────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────

@Injectable()
export class BillingEmailService {
  private readonly logger = new Logger(BillingEmailService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Envía email de recibo a partir de un Stripe Invoice paid.
   *
   * Mapeo Stripe → template variables:
   *   invoice.customer_email                        → to
   *   organization.name (via Subscription FK)       → organizationName
   *   invoice.amount_paid / 100 + currency          → amountDisplay
   *   invoice.status_transitions.paid_at            → paidAt
   *   invoice.number                                → invoiceNumber
   *   invoice.receipt_number                        → receiptNumber
   *   charge.payment_method_details                 → paymentMethodLabel
   *   invoice.hosted_invoice_url                    → hostedInvoiceUrl
   *   invoice.invoice_pdf                           → hostedReceiptUrl
   *   invoice.lines.data                            → lineItems
   */
  async sendReceipt(invoice: StripeInvoiceForReceipt): Promise<SendReceiptResult> {
    // ── Resolver destinatario ──
    const to = invoice.customer_email
    if (!to) {
      this.logger.warn(
        `[BillingEmail] Receipt skip — invoice ${invoice.id} sin customer_email`,
      )
      return { sent: false, reason: 'no-email' }
    }

    // ── Resolver organization name desde Subscription FK ──
    let organizationName = 'tu cuenta de Zenix'
    if (invoice.subscription) {
      const sub = await this.prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription },
        include: { organization: { select: { name: true } } },
      })
      if (sub?.organization?.name) {
        organizationName = sub.organization.name
      }
    }

    // ── Resolver payment method label ──
    // Stripe Invoice no expone payment_method_details directo. Para
    // simplificar Day 1 wiring, usamos "Tarjeta" como label genérico.
    // Día 18 (Trial reminders) podemos enriquecer con el charge.expand para
    // mostrar "Visa •••• 4242" estilo Anthropic.
    const paymentMethodLabel = 'Tarjeta registrada en Stripe'

    // ── Resolver customer portal URL ──
    // Customer Portal session se genera bajo demanda, por seguridad no
    // mandamos URL pre-generada en email (caduca en 5min — Issue F del
    // stripe-best-practices doc). En su lugar, el customer entra a Zenix
    // y desde Settings/Billing genera la URL fresh.
    const customerPortalUrl = `${process.env.APP_BASE_URL || 'https://app.zenix.com'}/settings/billing`

    // ── Construir input (variables del template) ──
    const input: BillingReceiptInput = {
      to,
      organizationName,
      amountDisplay: this.formatAmount(invoice.amount_paid, invoice.currency),
      paidAt: invoice.status_transitions.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : new Date(),
      invoiceNumber: invoice.number ?? invoice.id,
      receiptNumber: invoice.receipt_number ?? invoice.id,
      paymentMethodLabel,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? '',
      hostedReceiptUrl: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? '',
      lineItems: invoice.lines.data.map((line) => ({
        description: line.description ?? 'Suscripción Zenix',
        periodStart: new Date(line.period.start * 1000),
        periodEnd: new Date(line.period.end * 1000),
        quantity: line.quantity ?? 1,
        amountDisplay: this.formatAmount(line.amount, invoice.currency),
      })),
      totalDisplay: this.formatAmount(invoice.amount_paid, invoice.currency),
      customerPortalUrl,
    }

    // ── Render template (substitución de variables) ──
    const email = renderBillingReceipt(input)

    // ── Send via Resend ──
    const apiKey = process.env.RESEND_API_KEY
    const fromAddress =
      process.env.RESEND_BILLING_FROM ||
      process.env.RESEND_FROM_ADDRESS ||
      'Zenix Billing <billing@zenix.app>'

    if (!apiKey) {
      this.logger.warn(
        `[BillingEmail] RESEND_API_KEY no configurado — receipt a ${to} NO enviado. ` +
          `Invoice ID: ${invoice.id}, Amount: ${input.amountDisplay}.`,
      )
      return { sent: false, reason: 'no-key' }
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: input.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
          tags: [
            { name: 'kind', value: 'billing-receipt' },
            { name: 'stripe_invoice_id', value: invoice.id },
            { name: 'stripe_subscription_id', value: invoice.subscription || '' },
          ],
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>')
        this.logger.error(
          `[BillingEmail] Resend API error ${res.status}: ${errText.slice(0, 300)}. Invoice: ${invoice.id}`,
        )
        return { sent: false, reason: 'api-error' }
      }

      const json = (await res.json()) as { id?: string }
      this.logger.log(
        `[BillingEmail] Receipt enviado a ${to} · invoice ${invoice.id} · resend_id=${json.id}`,
      )

      // AuditLog del send (best-effort)
      await this.safeAuditLog(invoice, json.id)

      return { sent: true, resendMessageId: json.id }
    } catch (err) {
      this.logger.error(
        `[BillingEmail] Network error enviando receipt: ${String(err).slice(0, 200)}`,
      )
      return { sent: false, reason: 'network' }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  /**
   * Format Stripe amount (cents) → "MXN $1,800.00" pattern.
   */
  private formatAmount(cents: number, currency: string): string {
    const amount = cents / 100
    const cur = currency.toUpperCase()
    // Currencies sin decimales (JPY, CLP, COP — Stripe minor units)
    const noDecimal = ['JPY', 'KRW', 'CLP', 'COP', 'VND']
    const fractionDigits = noDecimal.includes(cur) ? 0 : 2
    return `${cur} $${amount.toLocaleString('es-MX', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}`
  }

  private async safeAuditLog(
    invoice: StripeInvoiceForReceipt,
    resendId?: string,
  ): Promise<void> {
    // Resolver organizationId via subscription
    if (!invoice.subscription) return
    try {
      const sub = await this.prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription },
        select: { organizationId: true },
      })
      if (!sub) return
      await this.auditLog.write({
        organizationId: sub.organizationId,
        actorRealId: 'SYSTEM',
        actorRealRole: 'PLATFORM_ADMIN' as any,
        action: 'BILLING_RECEIPT_SENT',
        target: invoice.id,
        payload: {
          stripeInvoiceId: invoice.id,
          stripeSubscriptionId: invoice.subscription,
          invoiceNumber: invoice.number,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          customerEmail: invoice.customer_email,
          resendMessageId: resendId,
        },
        status: 'SUCCESS' as any,
        retentionPolicy: 'PERMANENT' as any,
      })
    } catch (err) {
      this.logger.warn(`[BillingEmail] AuditLog write failed: ${String(err).slice(0, 200)}`)
    }
  }
}
