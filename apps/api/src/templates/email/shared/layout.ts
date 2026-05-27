/**
 * Layout wrapper común para TODOS los emails Zenix.
 *
 * Garantiza:
 *   · Estructura table-based (única que funciona consistentemente cross-email-client)
 *   · Logo header arriba (centrado, pattern Anthropic/Linear/Notion)
 *   · Body container con max-width 560px y radius
 *   · Footer con disclaimer + soporte link
 *   · Dark-mode-safe (avoidamos colores que se invierten mal en Gmail dark)
 *
 * Uso:
 *   import { renderLayout } from '../shared/layout'
 *   export function myEmail(input): string {
 *     return renderLayout({
 *       previewText: 'Tu plan está activo',
 *       title: 'Activación completada',
 *       body: '<p>Hola...</p>',
 *     })
 *   }
 */
import { EMAIL_TOKENS as T } from './tokens'
import { escapeHtml } from './escape-html'

export interface RenderLayoutInput {
  /** Preview text que aparece en la inbox preview (Gmail/Outlook). */
  previewText: string
  /** Texto del <title> tag — usado por algunos clients para subject fallback. */
  title: string
  /** HTML del body (entre header y footer). Sin escape — caller responsable. */
  body: string
  /** Override del footer disclaimer (opcional). */
  footerNote?: string
}

export function renderLayout(input: RenderLayoutInput): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(input.title)}</title>
  <style>
    /* Reset mínimo cross-client */
    body { margin: 0; padding: 0; background: ${T.surface.page}; font-family: ${T.font.family}; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    a { color: ${T.brand.primary}; text-decoration: none; }
    /* Tabular numbers (no soportado en todos los clients pero ayuda donde sí) */
    .tabular { font-variant-numeric: tabular-nums; }
    .mono { font-family: ${T.font.mono}; font-size: 12px; }
  </style>
</head>
<body style="margin:0;padding:0;background:${T.surface.page};font-family:${T.font.family};color:${T.ink.primary};">
  <!-- Preview text (oculto, aparece en inbox preview) -->
  <div style="display:none;font-size:1px;color:${T.surface.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(input.previewText)}
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${T.surface.page};">
    <tr>
      <td align="center" style="padding:${T.space.xl}px ${T.space.md}px;">

        <!-- Logo header — Zenix wordmark + symbol -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${T.layout.containerWidth}" style="max-width:${T.layout.containerWidth}px;">
          <tr>
            <td align="left" style="padding:0 0 ${T.space.lg}px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <!-- Zenix symbol: gradient violet square con sparkle -->
                    <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${T.brand.primary} 0%,${T.brand.primaryDark} 100%);display:inline-block;text-align:center;line-height:32px;">
                      <span style="color:#ffffff;font-size:18px;font-weight:700;">Z</span>
                    </div>
                  </td>
                  <td valign="middle">
                    <span style="font-size:17px;font-weight:600;letter-spacing:-0.01em;color:${T.ink.primary};">Zenix</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Body container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${T.layout.containerWidth}" style="max-width:${T.layout.containerWidth}px;background:${T.surface.card};border-radius:${T.layout.radiusLg}px;overflow:hidden;">
          <tr>
            <td style="padding:${T.space.xl}px;">
              ${input.body}
            </td>
          </tr>
        </table>

        <!-- Footer disclaimer -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${T.layout.containerWidth}" style="max-width:${T.layout.containerWidth}px;">
          <tr>
            <td align="center" style="padding:${T.space.lg}px ${T.space.md}px 0;font-size:11px;color:${T.ink.quaternary};line-height:1.5;">
              ${
                input.footerNote ??
                `Zenix nunca te pedirá tu contraseña por email ni por teléfono.<br>
                Dudas: <a href="mailto:soporte@zenix.com" style="color:${T.ink.tertiary};text-decoration:underline;">soporte@zenix.com</a>`
              }
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:${T.space.md}px ${T.space.md}px ${T.space.xl}px;font-size:11px;color:${T.ink.quaternary};">
              © Zenix PMS · Hostelería boutique para LATAM
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
