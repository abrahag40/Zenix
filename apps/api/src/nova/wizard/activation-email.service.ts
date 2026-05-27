/**
 * ActivationEmailService — Day 18.
 *
 * Envía el welcome email al Org Owner con el setup link 72h.
 *
 * Provider: Resend (REST API directo, sin SDK). Razones:
 *   · Resend REST es estable + bien documentado
 *   · Evita un dep node más en package.json
 *   · Patrón consistente con ChannexGateway (fetch directo a app.channex.io)
 *
 * Si RESEND_API_KEY no está configurado:
 *   · Loguea el envío con preview del HTML (dev mode)
 *   · Retorna { sent: false, reason: 'no-key' } sin throw
 *   · Preserva el flujo del wizard incluso sin email infra
 *
 * Si Resend devuelve error:
 *   · Loguea full response como warn
 *   · NO throws (el wizard ya completó — re-emisión manual del link queda
 *     como fallback siempre disponible)
 *
 * El HTML template inline aquí — Day 19+ podría extraerse a Handlebars/MJML
 * cuando agreguemos más templates (no-show alerts, password reset, etc.).
 */
import { Injectable, Logger } from '@nestjs/common'

export interface SendActivationEmailInput {
  /** Email del Org Owner. */
  to: string
  /** Nombre completo display. */
  ownerName: string
  /** Nombre comercial del cliente (Organization.name). */
  organizationName: string
  /** Link completo del setup, e.g. https://app.zenix.com/setup/abc123… */
  setupLink: string
  /** Horas hasta expiración (típicamente 72 al crear). */
  hoursUntilExpiry: number
  /** Conteo de properties — copy ajusta singular/plural. */
  propertyCount: number
  /** Day 19 — link al Activation Report HTML printable. Opcional para
   *  backward-compat con tests que aún no lo pasan. */
  activationReportLink?: string
  /** Day 8 BILLING-CORE — info de la subscription Stripe creada al activar.
   *  Si presente, el email incluye una caja con plan + cycle + descuento. */
  subscription?: {
    planTier: string
    billingCycle: 'monthly' | 'annual'
    trialDays: number
    discountApplied: boolean
    discountPercent?: number
    discountDuration?: 'once' | 'repeating' | 'forever'
    discountMonths?: number
  }
}

export interface SendActivationEmailResult {
  sent: boolean
  resendMessageId?: string
  /** Si !sent, motivo: 'no-key' / 'api-error' / 'network'. */
  reason?: string
}

@Injectable()
export class ActivationEmailService {
  private readonly logger = new Logger(ActivationEmailService.name)

  async sendActivationEmail(input: SendActivationEmailInput): Promise<SendActivationEmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    const fromAddress = process.env.RESEND_FROM_ADDRESS || 'Zenix Activate <noreply@zenix.app>'

    const subject = `Activa tu cuenta de ${input.organizationName} en Zenix`
    const html = renderActivationHtml(input)
    const text = renderActivationText(input)

    if (!apiKey) {
      this.logger.warn(
        `[ActivationEmail] RESEND_API_KEY no configurado — email a ${input.to} NO enviado (stub). Setup link: ${input.setupLink}`,
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
          subject,
          html,
          text,
          // Tags: search facets en Resend dashboard
          tags: [
            { name: 'kind', value: 'wizard-activation' },
            { name: 'org_slug', value: input.organizationName.toLowerCase().replace(/\s+/g, '-').slice(0, 40) },
          ],
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>')
        this.logger.warn(
          `[ActivationEmail] Resend HTTP ${res.status} for ${input.to}: ${errText.slice(0, 200)}`,
        )
        return { sent: false, reason: 'api-error' }
      }

      const json = (await res.json()) as { id?: string }
      this.logger.log(
        `[ActivationEmail] ✓ Sent activation email to ${input.to} for ${input.organizationName} (Resend id ${json.id ?? '?'}).`,
      )
      return { sent: true, resendMessageId: json.id }
    } catch (err) {
      this.logger.warn(
        `[ActivationEmail] Network error sending to ${input.to}: ${String(err).slice(0, 200)}`,
      )
      return { sent: false, reason: 'network' }
    }
  }

  /**
   * Health check para Step 7 — envía un email mínimo al toAddress configurado.
   * Devuelve { ok, message, latencyMs } sin throws para que el wizard mapee
   * directo a la UI de health-checks.
   */
  async sendHealthCheckEmail(toAddress: string): Promise<{
    ok: boolean
    status: 'success' | 'warning' | 'error'
    message: string
    latencyMs: number
  }> {
    const apiKey = process.env.RESEND_API_KEY
    const start = Date.now()

    if (!apiKey) {
      return {
        ok: false,
        status: 'warning',
        message:
          'RESEND_API_KEY no configurado — SMTP queda en modo stub. El cliente puede activar pero los emails (setup link, welcome, password reset) NO se enviarán hasta configurar Resend.',
        latencyMs: Date.now() - start,
      }
    }

    try {
      const fromAddress = process.env.RESEND_FROM_ADDRESS || 'Zenix Activate <noreply@zenix.app>'
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: toAddress,
          subject: '[Zenix] Test email — Activate wizard health check',
          text:
            'Este es un test email automático del wizard de activación de Zenix.\n\n' +
            'Si recibiste este mensaje, la configuración SMTP del cliente está funcionando correctamente.\n\n' +
            '(No es necesario responder.)',
          tags: [{ name: 'kind', value: 'wizard-health-check' }],
        }),
      })

      const latencyMs = Date.now() - start

      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>')
        return {
          ok: false,
          status: 'error',
          message: `Resend HTTP ${res.status}: ${errText.slice(0, 120)}. Verifica RESEND_API_KEY + dominio verificado.`,
          latencyMs,
        }
      }

      return {
        ok: true,
        status: 'success',
        message: `Email test entregado a ${toAddress} via Resend`,
        latencyMs,
      }
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        message: `Network error contacting Resend: ${String(err).slice(0, 120)}`,
        latencyMs: Date.now() - start,
      }
    }
  }
}

// ─── HTML template ────────────────────────────────────────────────────

function renderActivationHtml(input: SendActivationEmailInput): string {
  const propertyCopy =
    input.propertyCount === 1 ? '1 propiedad configurada' : `${input.propertyCount} propiedades configuradas`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activa tu cuenta Zenix</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px -8px rgba(15,23,42,0.08);">
          <!-- Header con gradiente -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#047857 100%);padding:32px 32px 28px;text-align:center;">
              <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.15);text-align:center;line-height:48px;font-size:24px;">✨</div>
              <h1 style="margin:16px 0 4px;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Bienvenido a Zenix</h1>
              <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;">Tu cuenta de ${escapeHtml(input.organizationName)} está casi lista</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155;">
                Hola <strong style="color:#0f172a;">${escapeHtml(input.ownerName)}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
                Tu consultor terminó la configuración inicial de <strong style="color:#0f172a;">${escapeHtml(input.organizationName)}</strong> en Zenix.
                Tienes ${propertyCopy} y un workspace listo para operar.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#334155;">
                Para terminar de activar tu cuenta y crear tu contraseña, abre el siguiente link:
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="${escapeHtml(input.setupLink)}" style="display:inline-block;padding:13px 28px;background:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;box-shadow:0 2px 8px -2px rgba(16,185,129,0.4);">Activar mi cuenta →</a>
                  </td>
                </tr>
              </table>

              ${input.subscription ? renderSubscriptionBox(input.subscription) : ''}

              <!-- Caja informativa -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f1f5f9;border-radius:10px;padding:16px;margin:0 0 16px;">
                <tr>
                  <td style="font-size:13px;line-height:1.55;color:#475569;">
                    <strong style="color:#0f172a;">⏰ Importante:</strong> este link es <strong>single-use</strong> y expira en <strong>${input.hoursUntilExpiry} horas</strong>.
                    Si no lo activas a tiempo, pídele al consultor que re-emita uno nuevo desde Nova.
                  </td>
                </tr>
              </table>

              ${
                input.activationReportLink
                  ? `
              <!-- Activation Report link -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 24px;">
                <tr>
                  <td style="font-size:13px;line-height:1.55;color:#475569;">
                    <strong style="color:#0f172a;">📄 Activation Report:</strong> revisa la configuración completa de tu cuenta en
                    <a href="${escapeHtml(input.activationReportLink)}" style="color:#059669;text-decoration:none;font-weight:600;">este documento</a>
                    (imprimible — Cmd+P / Ctrl+P → Save as PDF para tu expediente).
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.55;">
                Si el botón no funciona, copia y pega este link en tu navegador:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#475569;font-family:'SF Mono',Consolas,monospace;word-break:break-all;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;">
                ${escapeHtml(input.setupLink)}
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.55;">
                Zenix nunca te pedirá tu contraseña por email ni por teléfono. Si tienes dudas, contacta
                a tu consultor o escríbenos a <a href="mailto:soporte@zenix.com" style="color:#059669;text-decoration:none;">soporte@zenix.com</a>.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
          © Zenix PMS · Hostelería boutique para LATAM
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderSubscriptionBox(sub: NonNullable<SendActivationEmailInput['subscription']>): string {
  const cycleLabel = sub.billingCycle === 'annual' ? 'Anual (-20%)' : 'Mensual'
  const trialLine = sub.trialDays > 0
    ? `<div style="font-size:12px;color:#0e7490;margin-top:4px;">✨ Trial: ${sub.trialDays} días gratis antes del primer cobro.</div>`
    : ''
  const discountLine = sub.discountApplied && sub.discountPercent
    ? `<div style="font-size:12px;color:#047857;margin-top:4px;">🎉 Descuento aplicado: -${sub.discountPercent}%${
        sub.discountDuration === 'once'
          ? ' (solo primer cobro)'
          : sub.discountDuration === 'repeating' && sub.discountMonths
            ? ` (por ${sub.discountMonths} meses)`
            : sub.discountDuration === 'forever'
              ? ' (permanente)'
              : ''
      }</div>`
    : ''

  return `
              <!-- Caja billing — plan + cycle + trial + descuento -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;margin:0 0 16px;">
                <tr>
                  <td style="font-size:13px;line-height:1.55;color:#475569;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#7c3aed;margin-bottom:6px;">Tu suscripción</div>
                    <div style="font-size:14px;font-weight:600;color:#0f172a;">Plan ${escapeHtml(sub.planTier)} · ${cycleLabel}</div>
                    ${trialLine}
                    ${discountLine}
                    <div style="font-size:12px;color:#64748b;margin-top:8px;padding-top:8px;border-top:1px solid #e9d5ff;">
                      Después de activar tu cuenta, configura tu método de pago desde tu Customer Portal (link incluido en el panel de cuenta).
                    </div>
                  </td>
                </tr>
              </table>`
}

function renderActivationText(input: SendActivationEmailInput): string {
  const lines: string[] = [
    `Hola ${input.ownerName},`,
    '',
    `Tu consultor terminó la configuración inicial de ${input.organizationName} en Zenix.`,
    `Tienes ${input.propertyCount} ${input.propertyCount === 1 ? 'propiedad configurada' : 'propiedades configuradas'} y un workspace listo para operar.`,
    '',
  ]

  if (input.subscription) {
    const s = input.subscription
    const cycleLabel = s.billingCycle === 'annual' ? 'Anual (-20%)' : 'Mensual'
    lines.push(`TU SUSCRIPCIÓN: Plan ${s.planTier} · ${cycleLabel}`)
    if (s.trialDays > 0) lines.push(`  · Trial: ${s.trialDays} días gratis antes del primer cobro`)
    if (s.discountApplied && s.discountPercent) {
      const dur =
        s.discountDuration === 'once' ? ' (solo primer cobro)' :
        s.discountDuration === 'repeating' && s.discountMonths ? ` (por ${s.discountMonths} meses)` :
        s.discountDuration === 'forever' ? ' (permanente)' : ''
      lines.push(`  · Descuento aplicado: -${s.discountPercent}%${dur}`)
    }
    lines.push('  · Configura tu método de pago desde tu Customer Portal post-activación')
    lines.push('')
  }

  lines.push(
    'Para terminar de activar tu cuenta y crear tu contraseña, abre el siguiente link:',
    '',
    input.setupLink,
    '',
    `IMPORTANTE: este link es single-use y expira en ${input.hoursUntilExpiry} horas.`,
    'Si no lo activas a tiempo, pídele al consultor que re-emita uno nuevo.',
    '',
    '---',
    'Zenix nunca te pedirá tu contraseña por email ni por teléfono.',
    'Soporte: soporte@zenix.com',
  )
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}
