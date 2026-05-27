/**
 * Billing email templates — Stripe-driven emails (receipt, payment failed,
 * trial ending, subscription cancelled, etc.).
 *
 * Cada template exporta una función `render*` que retorna { subject, html, text }.
 * El service que los dispara (BillingEmailService — pendiente) los llama
 * desde webhook handlers.
 */
export { renderBillingReceipt, type BillingReceiptInput, type BillingReceiptOutput } from './receipt'

// Futuros (Day 18 / Day 20):
// export { renderTrialEnding } from './trial-ending'
// export { renderPaymentFailed } from './payment-failed'
// export { renderSubscriptionCancelled } from './subscription-cancelled'
