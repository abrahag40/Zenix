import { Injectable, Logger } from '@nestjs/common'

export interface SendPrecheckinEmailInput {
  to: string
  guestName: string
  propertyName: string
  /** URL completa con el token opaco: `${APP_BASE_URL}/precheckin/{rawToken}`. */
  link: string
  /** Fecha de llegada (ISO) — para el copy "tu llegada es el …". */
  checkInIso: string
  /** true = recordatorio 24h; false = invitación inicial. */
  isReminder?: boolean
}

export type SendPrecheckinEmailResult =
  | { sent: true; resendMessageId?: string }
  | { sent: false; reason: 'no-key' | 'api-error' | 'network' }

/**
 * PrecheckinEmailService — Sprint AUTO-CHECKIN Fase 1b.
 *
 * Envía el email de pre-arrival (invitación + recordatorio) vía Resend REST.
 * **Fail-soft** (mismo patrón que ActivationEmailService §182): si no hay
 * RESEND_API_KEY o Resend falla, NO se lanza excepción — el scheduler marca el
 * intento igual y la recepción siempre puede hacer el check-in normal (la carga
 * del huésped es OPCIONAL). Nunca rompe el flujo operativo por un email.
 */
@Injectable()
export class PrecheckinEmailService {
  private readonly logger = new Logger(PrecheckinEmailService.name)

  async send(input: SendPrecheckinEmailInput): Promise<SendPrecheckinEmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    const fromAddress = process.env.RESEND_FROM_ADDRESS || 'Zenix <noreply@zenix.app>'

    const subject = input.isReminder
      ? `Último recordatorio: agiliza tu llegada a ${input.propertyName}`
      : `Tu reserva en ${input.propertyName} está confirmada — agiliza tu check-in`

    const html = this.renderHtml(input)
    const text = this.renderText(input)

    if (!apiKey) {
      this.logger.warn(
        `[PrecheckinEmail] RESEND_API_KEY no configurado — email a ${input.to} NO enviado (stub). Link: ${input.link}`,
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
          tags: [
            { name: 'kind', value: input.isReminder ? 'precheckin-reminder' : 'precheckin-invite' },
          ],
        }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>')
        this.logger.warn(
          `[PrecheckinEmail] Resend HTTP ${res.status} for ${input.to}: ${errText.slice(0, 160)}`,
        )
        return { sent: false, reason: 'api-error' }
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string }
      this.logger.log(
        `[PrecheckinEmail] ✓ ${input.isReminder ? 'reminder' : 'invite'} → ${input.to} (Resend id ${json.id ?? '?'})`,
      )
      return { sent: true, resendMessageId: json.id }
    } catch (err) {
      this.logger.warn(`[PrecheckinEmail] Network error → ${input.to}: ${String(err).slice(0, 160)}`)
      return { sent: false, reason: 'network' }
    }
  }

  private renderHtml(input: SendPrecheckinEmailInput): string {
    const firstName = (input.guestName || '').split(' ')[0] || 'huésped'
    const arrival = this.formatDate(input.checkInIso)
    const intro = input.isReminder
      ? `Tu llegada a <strong>${esc(input.propertyName)}</strong> es el <strong>${arrival}</strong>. Aún no completas tu pre-check-in — toma 1 minuto y te ahorra fila en recepción.`
      : `¡Tu reserva en <strong>${esc(input.propertyName)}</strong> está confirmada! Tu llegada es el <strong>${arrival}</strong>. Completa tu pre-check-in desde tu celular y agiliza tu llegada.`
    return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:28px 28px 22px;">
        <div style="color:#ecfdf5;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${esc(input.propertyName)}</div>
        <div style="color:#fff;font-size:21px;font-weight:800;margin-top:6px;">Hola ${esc(firstName)} 👋</div>
      </div>
      <div style="padding:24px 28px;color:#334155;font-size:15px;line-height:1.55;">
        <p style="margin:0 0 16px;">${intro}</p>
        <p style="margin:0 0 8px;color:#475569;font-size:14px;">Solo confirma tus datos y sube una foto de tu identificación o pasaporte:</p>
        <div style="text-align:center;margin:22px 0;">
          <a href="${esc(input.link)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;">Completar mi pre-check-in →</a>
        </div>
        <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">Es opcional pero recomendado — si no lo completas, lo haremos contigo en recepción. Tus datos se usan solo para tu hospedaje (aviso de privacidad en el formulario). Si no reconoces esta reserva, ignora este correo.</p>
      </div>
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:14px;">Enviado por Zenix · Zenix nunca te pedirá tu contraseña ni datos de pago por email.</div>
  </div>
</body></html>`
  }

  private renderText(input: SendPrecheckinEmailInput): string {
    const firstName = (input.guestName || '').split(' ')[0] || 'huésped'
    const arrival = this.formatDate(input.checkInIso)
    const lead = input.isReminder
      ? `Último recordatorio: aún no completas tu pre-check-in para ${input.propertyName} (llegada ${arrival}).`
      : `Tu reserva en ${input.propertyName} está confirmada (llegada ${arrival}).`
    return [
      `Hola ${firstName},`,
      '',
      lead,
      '',
      'Confirma tus datos y sube una foto de tu identificación desde tu celular:',
      input.link,
      '',
      'Es opcional pero te ahorra tiempo en recepción. Tus datos se usan solo para tu hospedaje.',
      'Zenix nunca te pedirá contraseña ni datos de pago por email.',
    ].join('\n')
  }

  private formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date(iso))
    } catch {
      return iso.slice(0, 10)
    }
  }
}

function esc(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
