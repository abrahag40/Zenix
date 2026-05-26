/**
 * Nova Design System — Design Tokens.
 *
 * Fuente única de verdad para typography, spacing, elevation, motion,
 * y semantic colors del Nova UI. Inspirado en Apple HIG 2024 + Material 3.
 *
 * Anti-pattern evitado: estilos ad-hoc `text-[13px]` repetidos en cada
 * componente. Cada vez que veas un magic number en un componente nuevo,
 * ese token DEBE vivir aquí.
 *
 * ─── Filosofía ──────────────────────────────────────────────────────────
 *
 * Apple HIG core principles aplicados:
 *   1. Clarity — el contenido domina, el chrome se difumina
 *   2. Deference — typography + color guían el ojo, no decoraciones
 *   3. Depth — sutiles capas (shadows, transparencias) crean jerarquía
 *
 * Material Design 3 cosas que tomamos:
 *   - Tonal surfaces (variant tints muy suaves del accent en background)
 *   - Stateful colors (default/hover/focus/disabled definidos)
 *
 * Cosas que NO tomamos:
 *   - Floating Action Buttons (no aplica para desktop dense)
 *   - Bottom navigation (mobile pattern)
 *   - Heavy ripple animations
 */

// ─── Typography scale (Apple HIG-inspired, adaptado para web densidad) ──
//
// Apple HIG usa pt-based (1pt ≈ 1.33px). Convertí a px y ajusté line-heights
// para densidad de dashboard (Apple es app-density, dashboard es info-density).
//
// Tracking (letter-spacing) en em, negativo en headings (tightens) y positivo
// en captions (loosens for tiny sizes).

export const TYPOGRAPHY = {
  // Display — page heroes, welcome cards, brand moments
  displayLarge: {
    fontSize: '32px',
    lineHeight: '36px',
    letterSpacing: '-0.025em',
    fontWeight: 600,
  },
  displayMedium: {
    fontSize: '24px',
    lineHeight: '28px',
    letterSpacing: '-0.02em',
    fontWeight: 600,
  },
  // Headlines — page titles, section heads
  headlineLarge: {
    fontSize: '20px',
    lineHeight: '26px',
    letterSpacing: '-0.015em',
    fontWeight: 600,
  },
  headline: {
    fontSize: '17px',
    lineHeight: '22px',
    letterSpacing: '-0.01em',
    fontWeight: 600,
  },
  // Titles — card heads, modal titles
  title: {
    fontSize: '15px',
    lineHeight: '20px',
    letterSpacing: '-0.005em',
    fontWeight: 600,
  },
  // Body — primary content
  body: {
    fontSize: '14px',
    lineHeight: '20px',
    letterSpacing: '0',
    fontWeight: 400,
  },
  bodyMedium: {
    fontSize: '14px',
    lineHeight: '20px',
    letterSpacing: '0',
    fontWeight: 500,
  },
  // Callout — secondary descriptions
  callout: {
    fontSize: '13px',
    lineHeight: '18px',
    letterSpacing: '0',
    fontWeight: 400,
  },
  // Subhead — meta labels, captions
  subhead: {
    fontSize: '12px',
    lineHeight: '16px',
    letterSpacing: '0.005em',
    fontWeight: 500,
  },
  // Caption — fine print
  caption: {
    fontSize: '11px',
    lineHeight: '14px',
    letterSpacing: '0.01em',
    fontWeight: 400,
  },
  // Footnote — uppercase eyebrows, kbd hints
  footnote: {
    fontSize: '10px',
    lineHeight: '13px',
    letterSpacing: '0.04em', // upper looks better with more tracking
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
} as const

// ─── Tailwind class equivalents (use estos en JSX para evitar inline styles)
//
// Pattern: clase = `text-[size]/[leading] tracking-[tracking] font-[weight]`
// pero condensado por nombre semántico. Importar TEXT y usar TEXT.body etc.

export const TEXT = {
  displayLarge:
    'text-[32px] leading-9 tracking-[-0.025em] font-semibold text-slate-900',
  displayMedium:
    'text-[24px] leading-7 tracking-[-0.02em] font-semibold text-slate-900',
  headlineLarge:
    'text-[20px] leading-[26px] tracking-[-0.015em] font-semibold text-slate-900',
  headline:
    'text-[17px] leading-[22px] tracking-[-0.01em] font-semibold text-slate-900',
  title:
    'text-[15px] leading-5 tracking-[-0.005em] font-semibold text-slate-900',
  body: 'text-[14px] leading-5 text-slate-700',
  bodyMedium: 'text-[14px] leading-5 font-medium text-slate-800',
  callout: 'text-[13px] leading-[18px] text-slate-600',
  subhead: 'text-[12px] leading-4 tracking-[0.005em] font-medium text-slate-700',
  caption: 'text-[11px] leading-[14px] tracking-[0.01em] text-slate-500',
  // Eyebrow uppercase para section heads pequeños
  eyebrow:
    'text-[10px] leading-[13px] tracking-[0.08em] font-semibold uppercase text-slate-500',
} as const

// ─── Color tiers (Apple HIG label colors) ────────────────────────────────
//
// Apple HIG: label (primary), secondaryLabel, tertiaryLabel, quaternaryLabel.
// Mapeamos a Tailwind slate palette con contrast verified.

export const LABEL = {
  primary: 'text-slate-900', // max contrast — heads, body emphasis
  secondary: 'text-slate-700', // body, descriptions
  tertiary: 'text-slate-500', // captions, hints
  quaternary: 'text-slate-400', // placeholders, disabled hints
  disabled: 'text-slate-300', // disabled labels
  inverse: 'text-white',
} as const

// ─── Surface tiers (background levels) ──────────────────────────────────
//
// Apple HIG: systemBackground (base), secondarySystemBackground, tertiary.
// Mapeamos a slate-50/white/slate-100.

export const SURFACE = {
  base: 'bg-slate-50', // page background
  raised: 'bg-white', // cards, panels
  overlay: 'bg-white', // modals, popovers (con shadow más fuerte)
  sunken: 'bg-slate-100', // input fields, table headers
  inverse: 'bg-slate-900',
} as const

// ─── Elevation system (Apple HIG layered shadows) ───────────────────────
//
// 5 niveles + flat. Cada nivel usa stacked shadows (NO single shadow) —
// pattern Apple HIG / Material 3 que da depth real sin look "stickered".

export const ELEVATION = {
  flat: 'shadow-none',
  // Subtle separator — borders alternative
  e1: 'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
  // Cards default hover
  e2: 'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.06),0_2px_4px_-2px_rgba(15,23,42,0.04)]',
  // Popovers, dropdowns
  e3: 'shadow-[0_8px_24px_-6px_rgba(15,23,42,0.10),0_4px_8px_-4px_rgba(15,23,42,0.06)]',
  // Modals
  e4: 'shadow-[0_16px_40px_-8px_rgba(15,23,42,0.14),0_8px_16px_-6px_rgba(15,23,42,0.08)]',
  // Dialog max — full attention demanded
  e5: 'shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18),0_12px_24px_-8px_rgba(15,23,42,0.10)]',
  // Accent glow — emerald CTA
  glowEmerald: 'shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]',
  glowDanger: 'shadow-[0_8px_24px_-8px_rgba(220,38,38,0.5)]',
} as const

// ─── Border radius scale ───────────────────────────────────────────────
//
// Apple HIG ratio: cards 12-16px, buttons 8-10px, pills/chips full.

export const RADIUS = {
  none: 'rounded-none',
  sm: 'rounded-md', // 6px — inputs, mini buttons
  md: 'rounded-lg', // 8px — buttons, dropdowns
  lg: 'rounded-xl', // 12px — cards (sweet spot Apple HIG)
  xl: 'rounded-2xl', // 16px — hero cards
  full: 'rounded-full', // pills, chips, avatars
} as const

// ─── Motion (CLAUDE.md §motion ya documenta estos curves) ──────────────
//
// ease-spring: entrada — rapid arrival then settle
// ease-sharp-out: exit — fast linear-ish departure

export const MOTION = {
  // Durations
  fast: 'duration-100',
  base: 'duration-150',
  medium: 'duration-200',
  slow: 'duration-300',
  // Easing (definidos en index.css custom properties — ver tailwind config)
  spring: 'ease-[cubic-bezier(0.22,1,0.36,1)]', // expo-out
  sharp: 'ease-[cubic-bezier(0.55,0,1,0.45)]', // expo-in
  smooth: 'ease-out',
} as const

// ─── Spacing rythm (Apple HIG 8pt grid, with 4pt micro) ───────────────

export const SPACING = {
  none: '0',
  micro: '4px',
  small: '8px',
  medium: '16px',
  base: '24px',
  large: '32px',
  xl: '48px',
  xxl: '64px',
} as const

// ─── Focus ring (a11y + Apple HIG focus indicators) ───────────────────

export const FOCUS = {
  ring: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white',
  ringWithin:
    'focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:ring-offset-1 focus-within:ring-offset-white',
} as const

// ─── Semantic intents (mapeo unificado para colors stateful) ──────────

export type Intent = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'success' | 'warning' | 'info' | 'accent'

export const INTENT_TOKENS = {
  primary: {
    bg: 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800',
    text: 'text-white',
    border: 'border-emerald-700',
    ring: 'focus-visible:ring-emerald-500/40',
    shadow: ELEVATION.glowEmerald,
  },
  secondary: {
    bg: 'bg-white hover:bg-slate-50',
    text: 'text-slate-900',
    border: 'border-slate-300 hover:border-slate-400',
    ring: 'focus-visible:ring-slate-400/40',
    shadow: ELEVATION.e1,
  },
  tertiary: {
    bg: 'bg-transparent hover:bg-slate-100',
    text: 'text-slate-700 hover:text-slate-900',
    border: 'border-transparent',
    ring: 'focus-visible:ring-slate-400/40',
    shadow: '',
  },
  destructive: {
    bg: 'bg-gradient-to-b from-red-600 to-red-700 hover:from-red-700 hover:to-red-800',
    text: 'text-white',
    border: 'border-red-700',
    ring: 'focus-visible:ring-red-500/40',
    shadow: ELEVATION.glowDanger,
  },
  success: {
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    ring: 'focus-visible:ring-emerald-500/40',
    shadow: '',
  },
  warning: {
    bg: 'bg-amber-50 hover:bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    ring: 'focus-visible:ring-amber-500/40',
    shadow: '',
  },
  info: {
    bg: 'bg-sky-50 hover:bg-sky-100',
    text: 'text-sky-800',
    border: 'border-sky-200',
    ring: 'focus-visible:ring-sky-500/40',
    shadow: '',
  },
  accent: {
    bg: 'bg-violet-50 hover:bg-violet-100',
    text: 'text-violet-800',
    border: 'border-violet-200',
    ring: 'focus-visible:ring-violet-500/40',
    shadow: '',
  },
} as const
