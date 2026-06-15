import { Injectable, Logger } from '@nestjs/common'

/**
 * Envío de reportes programados por email vía Resend (REST directo, mismo patrón
 * que ActivationEmailService). El reporte va como ADJUNTO (.xlsx/.csv) + un cuerpo
 * HTML con el resumen. Fail-soft: sin RESEND_API_KEY loguea y retorna no-key.
 */
export interface SendScheduledReportInput {
  to: string[]
  reportTitle: string
  propertyName: string
  periodLabel: string
  rowCount: number
  attachment: { filename: string; content: Buffer; mime: string }
}

export interface SendScheduledReportResult {
  sent: boolean
  reason?: string
  resendMessageId?: string
}

@Injectable()
export class ScheduledReportEmailService {
  private readonly logger = new Logger(ScheduledReportEmailService.name)

  async send(input: SendScheduledReportInput): Promise<SendScheduledReportResult> {
    const apiKey = process.env.RESEND_API_KEY
    const fromAddress =
      process.env.RESEND_REPORTS_FROM || process.env.RESEND_FROM_ADDRESS || 'Zenix Reportes <noreply@zenix.app>'

    if (input.to.length === 0) return { sent: false, reason: 'no-recipients' }

    if (!apiKey) {
      this.logger.warn(
        `[ScheduledReport] RESEND_API_KEY no configurado — "${input.reportTitle}" (${input.rowCount} filas) NO enviado a ${input.to.join(', ')} (stub).`,
      )
      return { sent: false, reason: 'no-key' }
    }

    const subject = `[Zenix] ${input.reportTitle} — ${input.propertyName} · ${input.periodLabel}`
    const html = renderHtml(input)

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress,
          to: input.to,
          subject,
          html,
          attachments: [
            { filename: input.attachment.filename, content: input.attachment.content.toString('base64') },
          ],
          tags: [{ name: 'kind', value: 'scheduled-report' }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>')
        this.logger.warn(`[ScheduledReport] Resend HTTP ${res.status}: ${errText.slice(0, 200)}`)
        return { sent: false, reason: 'api-error' }
      }
      const json = (await res.json()) as { id?: string }
      this.logger.log(`[ScheduledReport] ✓ "${input.reportTitle}" → ${input.to.join(', ')} (Resend ${json.id ?? '?'})`)
      return { sent: true, resendMessageId: json.id }
    } catch (err) {
      this.logger.warn(`[ScheduledReport] Network error: ${String(err).slice(0, 200)}`)
      return { sent: false, reason: 'network' }
    }
  }
}

function renderHtml(input: SendScheduledReportInput): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px -8px rgba(15,23,42,0.08);">
      <tr><td style="background:linear-gradient(135deg,#10b981,#047857);padding:24px 28px;">
        <div style="color:#fff;font-size:18px;font-weight:600;">📊 ${escapeHtml(input.reportTitle)}</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:2px;">${escapeHtml(input.propertyName)} · ${escapeHtml(input.periodLabel)}</div>
      </td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
          Tu reporte programado <strong>${escapeHtml(input.reportTitle)}</strong> está adjunto a este correo
          (<strong>${input.rowCount}</strong> ${input.rowCount === 1 ? 'registro' : 'registros'}).
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#475569;">
          Ábrelo en Excel o impórtalo a tu sistema contable. Los datos reflejan el período <strong>${escapeHtml(input.periodLabel)}</strong>.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.55;">
          Recibes este correo porque tu hotel configuró un envío programado de este reporte en Zenix.
          Para cambiar la frecuencia o los destinatarios, entra a Reportes → Programados.
        </p>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:11px;color:#94a3b8;">© Zenix PMS</p>
  </td></tr></table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}
