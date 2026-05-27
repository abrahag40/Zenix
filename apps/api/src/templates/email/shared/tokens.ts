/**
 * Email design tokens — Zenix brand colors + fonts + spacing.
 *
 * Inspirado en Anthropic Stripe receipt + Linear / Notion email patterns.
 * Todos los valores son inline-CSS-safe (email clients no soportan
 * stylesheets externos ni custom properties).
 */

export const EMAIL_TOKENS = {
  // Brand
  brand: {
    primary: '#7c3aed', // violet-600
    primaryDark: '#5b21b6', // violet-800
    accentLight: '#ede9fe', // violet-100
    accentBg: '#faf5ff', // violet-50
    accentBorder: '#e9d5ff', // violet-200
  },

  // Status
  success: {
    bg: '#d1fae5', // emerald-100
    text: '#065f46', // emerald-800
    cta: '#059669', // emerald-600
  },
  warning: {
    bg: '#fef3c7', // amber-100
    text: '#92400e', // amber-800
  },
  danger: {
    bg: '#fee2e2', // red-100
    text: '#991b1b', // red-800
  },

  // Neutrals (Apple HIG label colors)
  ink: {
    primary: '#0f172a', // slate-900
    secondary: '#334155', // slate-700
    tertiary: '#64748b', // slate-500
    quaternary: '#94a3b8', // slate-400
  },
  surface: {
    page: '#f1f5f9', // slate-100 — page background
    card: '#ffffff',
    cardSubtle: '#f8fafc', // slate-50
    cardMuted: '#f1f5f9',
    divider: '#e2e8f0', // slate-200
    dividerSubtle: '#f1f5f9',
  },

  // Typography
  font: {
    family:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"SF Mono", "Roboto Mono", Consolas, monospace',
  },

  // Spacing (mantener en step de 4px / 8px para predictabilidad)
  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  // Layout
  layout: {
    containerWidth: 560, // px — standard email max-width
    radiusSm: 6,
    radiusMd: 10,
    radiusLg: 14,
  },
} as const

export type EmailTokens = typeof EMAIL_TOKENS
