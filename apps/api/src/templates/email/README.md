# Email templates — Zenix

Carpeta única para TODOS los emails que envía Zenix: transaccionales (Stripe-driven), de activación, y marketing futuro.

## Estructura

```
templates/email/
├── shared/              # Tokens (colores, fonts), layout wrapper, componentes reusables
│   ├── tokens.ts        # EMAIL_TOKENS — design system
│   ├── layout.ts        # renderLayout({ previewText, title, body }) — wrapper con header logo + footer
│   ├── components.ts    # renderButton, renderInfoBox, renderKvRow, renderTotalRow, etc.
│   ├── escape-html.ts   # escapeHtml(s) — anti-injection
│   └── index.ts         # re-exports públicos
│
├── activation/          # Setup link, password reset, 2FA enrollment
│   └── (Day 9 TODO: mover renderActivationHtml de activation-email.service)
│
├── billing/             # Stripe-driven emails
│   ├── receipt.ts       # ✅ Cobro confirmado (Anthropic-inspired)
│   ├── trial-ending.ts  # ⏳ Day 18 — Trial D-3 / D-1
│   ├── payment-failed.ts # ⏳ Day 20 — Dunning
│   └── subscription-cancelled.ts # ⏳ Confirmación cancelación
│
└── marketing/           # Newsletters + product announcements
    └── (sprint v1.1.x MARKETING-EMAIL)
```

## Diseño visual

Inspirado en:
- **Anthropic PBC Stripe receipt** — hero card con monto grande, metadata clean
- **Linear / Notion email patterns** — typography tight, logo header centered
- **Stripe Atlas onboarding** — accent boxes con tone semántico

## Convenciones

### Cada template:
1. Exporta `render*(input)` → `{ subject, html, text }`
2. Usa primitives de `../shared` (NO HTML inline ad-hoc)
3. Tiene plain-text version completa para clients sin HTML
4. Soporta dark-mode-safe colors (slate, no bg que se invierta raro)

### HTML email constraints
- Table-based layout (única forma cross-client confiable)
- Style inline (no `<style>` external — Gmail strip)
- Max-width 560px (mobile-friendly)
- No JavaScript, no `<form>`
- Imágenes con `width` + `height` explícitos
- Preview text en primer div invisible (Outlook + Gmail lo usan)

## Uso desde un service

```typescript
import { renderBillingReceipt } from '../../templates/email/billing'

const email = renderBillingReceipt({
  to: 'owner@cliente.com',
  organizationName: 'Hotel Tulum',
  amountDisplay: 'MXN $1,800.00',
  paidAt: new Date(),
  // ... resto
})

await this.resend.send({
  from: 'Zenix Billing <billing@zenix.app>',
  to: email.to,
  subject: email.subject,
  html: email.html,
  text: email.text,
})
```

## Verificación de templates

```bash
# Renderizar localmente y abrir en browser:
npx ts-node -e "
  import { renderBillingReceipt } from './src/templates/email/billing'
  import { writeFileSync } from 'fs'
  const out = renderBillingReceipt({
    to: 'test@hotel.com',
    organizationName: 'Hotel Demo Tulum',
    amountDisplay: 'MXN \$1,800.00',
    paidAt: new Date(),
    invoiceNumber: 'RS5GRLMA-0005',
    receiptNumber: '2698-9852-5533',
    paymentMethodLabel: 'Visa •••• 4242',
    hostedInvoiceUrl: 'https://invoice.stripe.com/...',
    hostedReceiptUrl: 'https://receipt.stripe.com/...',
    lineItems: [{
      description: 'Plan Pro · 5 propiedades',
      periodStart: new Date('2026-05-17'),
      periodEnd: new Date('2026-06-17'),
      quantity: 1,
      amountDisplay: 'MXN \$1,800.00',
    }],
    totalDisplay: 'MXN \$1,800.00',
    customerPortalUrl: 'https://billing.stripe.com/p/...',
  })
  writeFileSync('/tmp/receipt-preview.html', out.html)
  console.log('Open /tmp/receipt-preview.html in browser')
"
```
