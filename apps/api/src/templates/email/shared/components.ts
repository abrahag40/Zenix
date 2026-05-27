/**
 * Componentes reusables para email templates.
 *
 * Cada función retorna string HTML inline-safe (sin clases, todo style="").
 * Pattern table-based para compat cross-client.
 */
import { EMAIL_TOKENS as T } from './tokens'
import { escapeHtml } from './escape-html'

// ─────────────────────────────────────────────────────────────────────
// Button — CTA primary/secondary
// ─────────────────────────────────────────────────────────────────────

export function renderButton(opts: {
  href: string
  label: string
  variant?: 'primary' | 'secondary'
}): string {
  const isPrimary = (opts.variant ?? 'primary') === 'primary'
  const bg = isPrimary ? T.success.cta : T.surface.cardSubtle
  const color = isPrimary ? '#ffffff' : T.ink.primary
  const shadow = isPrimary
    ? `box-shadow:0 2px 8px -2px rgba(5,150,105,0.4);`
    : `border:1px solid ${T.surface.divider};`
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" style="border-radius:10px;background:${bg};${shadow}">
          <a href="${escapeHtml(opts.href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:${color};text-decoration:none;">
            ${escapeHtml(opts.label)}
          </a>
        </td>
      </tr>
    </table>`
}

// ─────────────────────────────────────────────────────────────────────
// InfoBox — caja informativa con tono semántico
// ─────────────────────────────────────────────────────────────────────

export function renderInfoBox(opts: {
  tone?: 'info' | 'success' | 'warning' | 'accent'
  title?: string
  body: string // HTML inner
}): string {
  const tone = opts.tone ?? 'info'
  const map = {
    info: {
      bg: T.surface.cardMuted,
      border: T.surface.divider,
      titleColor: T.ink.primary,
    },
    success: {
      bg: T.success.bg,
      border: T.success.bg,
      titleColor: T.success.text,
    },
    warning: {
      bg: T.warning.bg,
      border: T.warning.bg,
      titleColor: T.warning.text,
    },
    accent: {
      bg: T.brand.accentBg,
      border: T.brand.accentBorder,
      titleColor: T.brand.primaryDark,
    },
  }[tone]
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${map.bg};border:1px solid ${map.border};border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;line-height:1.55;color:${T.ink.secondary};">
          ${
            opts.title
              ? `<div style="font-weight:600;color:${map.titleColor};margin-bottom:4px;">${escapeHtml(opts.title)}</div>`
              : ''
          }
          ${opts.body}
        </td>
      </tr>
    </table>`
}

// ─────────────────────────────────────────────────────────────────────
// KV Row — par label / value (right-aligned amounts pattern)
// ─────────────────────────────────────────────────────────────────────

export function renderKvRow(opts: {
  label: string
  value: string
  /** Mono font para amounts / IDs */
  mono?: boolean
  /** Color override del value */
  valueColor?: string
  /** Tone — discount uses emerald color */
  tone?: 'default' | 'discount' | 'strikethrough'
}): string {
  const tone = opts.tone ?? 'default'
  const color =
    opts.valueColor ??
    (tone === 'discount' ? T.success.cta : T.ink.primary)
  const valueDecoration = tone === 'strikethrough' ? 'text-decoration:line-through;' : ''
  const valueOpacity = tone === 'strikethrough' ? 'color:' + T.ink.tertiary + ';' : `color:${color};`
  return `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${T.ink.tertiary};">${escapeHtml(opts.label)}</td>
      <td align="right" style="padding:6px 0;font-size:13px;font-weight:${tone === 'default' ? 500 : 600};${opts.mono ? `font-family:${T.font.mono};` : ''}${valueDecoration}${valueOpacity}" class="tabular">
        ${escapeHtml(opts.value)}
      </td>
    </tr>`
}

// ─────────────────────────────────────────────────────────────────────
// Total Row — invoice TOTAL bold con border-top
// ─────────────────────────────────────────────────────────────────────

export function renderTotalRow(opts: { label: string; value: string }): string {
  return `
    <tr>
      <td style="padding:14px 0 0;border-top:1px solid ${T.surface.divider};font-size:15px;font-weight:700;color:${T.ink.primary};">
        ${escapeHtml(opts.label)}
      </td>
      <td align="right" style="padding:14px 0 0;border-top:1px solid ${T.surface.divider};font-size:18px;font-weight:700;color:${T.ink.primary};" class="tabular">
        ${escapeHtml(opts.value)}
      </td>
    </tr>`
}

// ─────────────────────────────────────────────────────────────────────
// Section heading — h2-like
// ─────────────────────────────────────────────────────────────────────

export function renderHeading(opts: {
  level: 1 | 2
  text: string
  subtitle?: string
}): string {
  const fontSize = opts.level === 1 ? 24 : 16
  const tag = opts.level === 1 ? 'h1' : 'h2'
  return `
    <${tag} style="margin:0 0 ${opts.subtitle ? 4 : 12}px;font-size:${fontSize}px;font-weight:700;letter-spacing:-0.015em;color:${T.ink.primary};line-height:1.3;">
      ${escapeHtml(opts.text)}
    </${tag}>
    ${
      opts.subtitle
        ? `<p style="margin:0 0 16px;font-size:13px;color:${T.ink.tertiary};">${escapeHtml(opts.subtitle)}</p>`
        : ''
    }`
}

// ─────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────

export function renderDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${T.surface.divider};margin:24px 0;">`
}

// ─────────────────────────────────────────────────────────────────────
// Code block (para setup link fallback)
// ─────────────────────────────────────────────────────────────────────

export function renderCodeBlock(text: string): string {
  return `
    <div style="font-family:${T.font.mono};font-size:11px;color:${T.ink.secondary};background:${T.surface.cardSubtle};padding:10px;border-radius:8px;border:1px solid ${T.surface.divider};word-break:break-all;">
      ${escapeHtml(text)}
    </div>`
}
