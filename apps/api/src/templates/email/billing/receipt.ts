/**
 * Receipt email template — confirmación de cobro exitoso.
 *
 * Inspirado en Anthropic PBC / Stripe hosted receipt:
 *   · Card hero con monto grande + fecha de cobro
 *   · Download invoice / receipt links (Stripe hosted URLs)
 *   · Receipt number + Invoice number + Payment method
 *   · Line items con periodo (ej "May 17–Jun 17, 2026")
 *   · Total + Amount paid
 *   · Footer link a support
 *
 * Se dispara desde el webhook `invoice.paid` cuando Stripe confirma cobro
 * exitoso. Reemplaza el receipt automático nativo de Stripe (deshabilitar
 * en Dashboard → Settings → Emails → Successful payment receipt OFF) para
 * tener control total de branding Zenix.
 */
import { EMAIL_TOKENS as T, escapeHtml, renderLayout } from '../shared'

export interface BillingReceiptInput {
  /** Org Owner email (recipient). */
  to: string
  /** Nombre del cliente (e.g. "Hotel Boutique Tulum"). */
  organizationName: string
  /** Monto cobrado en formato de display (ej "MXN $1,800.00"). */
  amountDisplay: string
  /** Fecha del cobro confirmado (Stripe paid_at). */
  paidAt: Date
  /** Stripe Invoice number (ej "RS5GRLMA-0005"). */
  invoiceNumber: string
  /** Stripe Receipt number (ej "2698-9852-5533"). */
  receiptNumber: string
  /** Payment method display (ej "Visa •••• 4242" / "Link" / "OXXO"). */
  paymentMethodLabel: string
  /** Stripe hosted invoice URL (para download). */
  hostedInvoiceUrl: string
  /** Stripe hosted receipt URL (para download). */
  hostedReceiptUrl: string
  /** Line items del invoice. */
  lineItems: Array<{
    description: string // "Plan Pro · 5 propiedades"
    periodStart: Date
    periodEnd: Date
    quantity: number
    amountDisplay: string // "MXN $1,800.00"
  }>
  /** Total final (debe matchear amountDisplay después de descuentos). */
  totalDisplay: string
  /** URL del Customer Portal (para gestionar suscripción). */
  customerPortalUrl?: string
}

export interface BillingReceiptOutput {
  subject: string
  html: string
  text: string
}

const DATE_FMT = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function fmtDate(d: Date): string {
  return DATE_FMT.format(d).replace('.', '')
}

function fmtPeriod(start: Date, end: Date): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

export function renderBillingReceipt(input: BillingReceiptInput): BillingReceiptOutput {
  const subject = `Recibo de Zenix · ${input.amountDisplay} · ${input.organizationName}`
  const previewText = `Cobro confirmado por ${input.amountDisplay} el ${fmtDate(input.paidAt)}.`

  const body = `
    <!-- HERO: monto grande + fecha + download links -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${T.brand.accentBg};border:1px solid ${T.brand.accentBorder};border-radius:14px;margin:0 0 24px;">
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 6px;font-size:13px;color:${T.ink.tertiary};">
            Recibo de Zenix
          </p>
          <p style="margin:0 0 4px;font-size:36px;font-weight:700;color:${T.ink.primary};letter-spacing:-0.02em;line-height:1.1;" class="tabular">
            ${escapeHtml(input.amountDisplay)}
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:${T.ink.tertiary};">
            Pagado · ${fmtDate(input.paidAt)}
          </p>

          <!-- Download links inline -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding-right:18px;">
                <a href="${escapeHtml(input.hostedInvoiceUrl)}" style="font-size:13px;font-weight:500;color:${T.brand.primaryDark};text-decoration:none;">
                  ↓ Descargar factura
                </a>
              </td>
              <td>
                <a href="${escapeHtml(input.hostedReceiptUrl)}" style="font-size:13px;font-weight:500;color:${T.brand.primaryDark};text-decoration:none;">
                  ↓ Descargar recibo
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Metadata block: Receipt # / Invoice # / Payment method -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:${T.ink.tertiary};">Receipt number</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:${T.ink.primary};font-family:${T.font.mono};" class="tabular">
          ${escapeHtml(input.receiptNumber)}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:${T.ink.tertiary};">Invoice number</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:${T.ink.primary};font-family:${T.font.mono};" class="tabular">
          ${escapeHtml(input.invoiceNumber)}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:${T.ink.tertiary};">Método de pago</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:${T.ink.primary};">
          ${escapeHtml(input.paymentMethodLabel)}
        </td>
      </tr>
    </table>

    <!-- Line items detail -->
    <h2 style="margin:0 0 14px;font-size:16px;font-weight:600;color:${T.ink.primary};letter-spacing:-0.005em;">
      Recibo #${escapeHtml(input.receiptNumber)}
    </h2>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;">
      ${input.lineItems
        .map(
          (item) => `
        <tr>
          <td style="padding:10px 0;">
            <div style="font-size:13px;color:${T.ink.tertiary};">
              ${escapeHtml(fmtPeriod(item.periodStart, item.periodEnd))}
            </div>
            <div style="font-size:14px;font-weight:500;color:${T.ink.primary};margin-top:2px;">
              ${escapeHtml(item.description)}
            </div>
            ${item.quantity !== 1 ? `<div style="font-size:12px;color:${T.ink.tertiary};margin-top:2px;">Cantidad: ${item.quantity}</div>` : ''}
          </td>
          <td align="right" style="padding:10px 0;font-size:14px;font-weight:600;color:${T.ink.primary};vertical-align:top;" class="tabular">
            ${escapeHtml(item.amountDisplay)}
          </td>
        </tr>`
        )
        .join('')}
    </table>

    <!-- Total -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid ${T.surface.divider};margin:0 0 8px;">
      <tr>
        <td style="padding:14px 0 8px;font-size:14px;font-weight:600;color:${T.ink.primary};">Total</td>
        <td align="right" style="padding:14px 0 8px;font-size:14px;font-weight:600;color:${T.ink.primary};" class="tabular">
          ${escapeHtml(input.totalDisplay)}
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 8px;font-size:14px;font-weight:600;color:${T.ink.primary};">Pagado</td>
        <td align="right" style="padding:0 0 8px;font-size:14px;font-weight:600;color:${T.success.cta};" class="tabular">
          ${escapeHtml(input.amountDisplay)}
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid ${T.surface.divider};margin:20px 0;">

    <!-- Customer Portal CTA -->
    ${
      input.customerPortalUrl
        ? `
    <p style="margin:0 0 12px;font-size:13px;color:${T.ink.secondary};">
      ¿Necesitas actualizar tu método de pago, descargar facturas anteriores o gestionar tu suscripción?
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:10px;background:${T.surface.cardSubtle};border:1px solid ${T.surface.divider};">
          <a href="${escapeHtml(input.customerPortalUrl)}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:${T.ink.primary};text-decoration:none;">
            Abrir Customer Portal →
          </a>
        </td>
      </tr>
    </table>`
        : ''
    }

    <p style="margin:0;font-size:12px;color:${T.ink.tertiary};line-height:1.55;">
      ¿Dudas? Visita <a href="mailto:soporte@zenix.com" style="color:${T.brand.primary};text-decoration:underline;">soporte@zenix.com</a>.
    </p>`

  const html = renderLayout({
    previewText,
    title: subject,
    body,
  })

  const text = [
    `Recibo de Zenix · ${input.organizationName}`,
    '',
    `${input.amountDisplay} pagado · ${fmtDate(input.paidAt)}`,
    '',
    `Receipt number: ${input.receiptNumber}`,
    `Invoice number: ${input.invoiceNumber}`,
    `Método de pago: ${input.paymentMethodLabel}`,
    '',
    'DETALLE',
    ...input.lineItems.map(
      (i) =>
        `· ${i.description} (${fmtPeriod(i.periodStart, i.periodEnd)}) — ${i.amountDisplay}`,
    ),
    '',
    `Total: ${input.totalDisplay}`,
    `Pagado: ${input.amountDisplay}`,
    '',
    'Descarga:',
    `· Factura: ${input.hostedInvoiceUrl}`,
    `· Recibo:  ${input.hostedReceiptUrl}`,
    '',
    input.customerPortalUrl ? `Customer Portal: ${input.customerPortalUrl}` : '',
    '',
    '---',
    '¿Dudas? soporte@zenix.com',
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}
