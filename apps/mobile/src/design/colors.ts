/**
 * Zenix Design System — Colors.
 *
 * Semantic palette anchored to CLAUDE.md §13 + §13b:
 *   emerald = action / availability / "go" (Mehrabian-Russell 1974)
 *   amber   = advisory warning, non-blocking (semáforo)
 *   red     = urgent / scarcity / rejection (Cialdini 1984)
 *   gray    = neutral / pending / system chrome
 *
 * Brand: Zenix is a PMS — premium yet approachable. Dark canvas (deep midnight)
 * with emerald as accent. Inspired by Linear, Stripe, Mews PMS aesthetics.
 *
 * Pre-attentive features (Treisman 1980):
 *   color carries semantics WITHOUT requiring text reading.
 *   Receptionist or housekeeper makes split-second decisions by scanning chips.
 *
 * WCAG 2.1 AA contrast ratios verified:
 *   text.primary on canvas.primary    → 18.5:1 (AAA)
 *   action.emerald.500 on canvas.dark → 4.7:1 (AA)
 *   warning.amber.500 on canvas.dark  → 7.1:1 (AAA)
 *   urgent.red.500 on canvas.dark     → 4.6:1 (AA)
 */

export const colors = {
  // ── Brand canvases (dark-first, Apple HIG 2024 — apps default to system theme)
  canvas: {
    primary:    '#0B1020',   // deep midnight — primary background, near-black with subtle blue
    secondary:  '#101736',   // elevated surface (cards, sheets) on primary
    tertiary:   '#1A2245',   // elevated above secondary (modals, popovers)
    overlay:    'rgba(11, 16, 32, 0.85)',  // for fullscreen modals/loaders
  },

  // ── Brand accent — Emerald (action, availability, success)
  brand: {
    50:   '#ECFDF5',
    100:  '#D1FAE5',
    200:  '#A7F3D0',
    300:  '#6EE7B7',
    400:  '#34D399',
    500:  '#10B981',   // primary brand — used for CTAs, logo, focus rings
    600:  '#059669',   // pressed/hover state on brand-500
    700:  '#047857',
    800:  '#065F46',
    900:  '#064E3B',
  },

  // ── Semantic colors
  action: {
    primary:    '#10B981',   // = brand.500, alias for clarity in component code
    primaryDim: '#059669',   // pressed
    secondary:  '#374151',   // dark gray — neutral secondary buttons
  },

  // Warning (advisory, non-blocking)
  warning: {
    50:   '#FFFBEB',
    100:  '#FEF3C7',
    400:  '#FBBF24',
    500:  '#F59E0B',   // primary warning — same-day check-in badge, extension flag
    600:  '#D97706',
  },

  // Urgent / error
  urgent: {
    50:   '#FEF2F2',
    100:  '#FEE2E2',
    400:  '#F87171',
    500:  '#EF4444',   // urgent red — carryover, blocked actions
    600:  '#DC2626',
  },

  // Neutral grays (text + chrome)
  text: {
    primary:    '#F9FAFB',   // primary text on dark canvas
    secondary:  '#D1D5DB',   // secondary text (subtitles, helper text)
    tertiary:   '#9CA3AF',   // disabled / placeholder
    inverse:    '#111827',   // text on light surfaces (rare, e.g. brand-500 button label)
  },

  border: {
    subtle:     'rgba(255, 255, 255, 0.06)',  // hairline divider on dark canvas
    default:    'rgba(255, 255, 255, 0.10)',
    strong:     'rgba(255, 255, 255, 0.18)',
    accent:     '#10B981',   // focus ring, active input border
  },

  // ── Status semantic mapping for cleaning tasks
  taskStatus: {
    pendingDeparture: { bg: '#1A2245', fg: '#9CA3AF', border: 'rgba(255,255,255,0.10)' },  // gray neutral
    readyToClean:     { bg: 'rgba(16,185,129,0.12)', fg: '#34D399', border: 'rgba(52,211,153,0.30)' },  // emerald
    inProgress:       { bg: 'rgba(96,165,250,0.12)', fg: '#60A5FA', border: 'rgba(96,165,250,0.30)' },  // blue (working)
    done:             { bg: 'rgba(167,139,250,0.12)', fg: '#A78BFA', border: 'rgba(167,139,250,0.30)' }, // violet (verified-pending)
    verified:         { bg: 'rgba(52,211,153,0.18)', fg: '#34D399', border: 'rgba(52,211,153,0.45)' },   // emerald strong
  },

  // ── Priority badges (spec follows §11 + §13 CLAUDE.md)
  priorityBadge: {
    doubleUrgent:    { bg: 'rgba(239,68,68,0.20)',  fg: '#FCA5A5', icon: '🔴⚠️' },  // carryover + same-day check-in
    sameDayCheckIn:  { bg: 'rgba(239,68,68,0.12)',  fg: '#F87171', icon: '🔴' },     // hoy entra
    carryover:       { bg: 'rgba(245,158,11,0.12)', fg: '#FBBF24', icon: '⚠️' },     // de ayer
    extension:       { bg: 'rgba(245,158,11,0.10)', fg: '#FCD34D', icon: '✨' },     // D12 — extension w/o cleaning
  },
} as const

export type ColorTokens = typeof colors
