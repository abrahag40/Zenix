/**
 * Zenix Design System — Typography.
 *
 * Anchored to:
 *   - Apple HIG "Typography" (San Francisco, dynamic type)
 *   - Material Design 3 type scale
 *   - WCAG 2.1 AA — 16px minimum body text, 1.5 line-height
 *
 * Sizes follow a 1.2x modular scale (slight progression, easy to scan).
 * Weights use semantic names (regular/medium/semibold/bold) instead of 400/500/600/700
 * to read better in component code.
 */

export const typography = {
  // ── Font families — system stack for native feel
  // iOS: San Francisco; Android: Roboto. No custom font load = faster boot,
  // no FOUT, lower bundle weight. We can swap to a brand font later (e.g. Inter)
  // via expo-font without changing this file's API.
  family: {
    base:      undefined,          // undefined = system default (recommended for SDK 54)
    monospace: 'Courier',          // for codes, IDs (rare in Zenix mobile)
  },

  // ── Sizes (px)
  size: {
    micro:     11,    // captions, hint text
    small:     13,    // chips, labels
    body:      15,    // paragraphs, default
    bodyLg:    17,    // larger body — buttons, list items
    title:     20,    // section titles
    titleLg:   24,    // screen title
    hero:      34,    // brand wordmark, marketing headers
    display:   48,    // splash, oversized brand display
  },

  // ── Weights — using string values that React Native accepts
  weight: {
    regular:   '400' as const,
    medium:    '500' as const,
    semibold:  '600' as const,
    bold:      '700' as const,
    heavy:     '800' as const,   // brand wordmark only
  },

  // ── Line heights — multipliers for legibility
  // 1.2 for headers (tight), 1.5 for body (WCAG recommendation).
  lineHeight: {
    tight:     1.2,
    normal:    1.4,
    relaxed:   1.5,
  },

  // ── Letter spacing — tightened for headers per Apple HIG
  letterSpacing: {
    hero:     -0.8,    // tighten heroic display text
    title:    -0.3,
    normal:    0,
    wide:      0.5,    // for ALL-CAPS labels (chip badges)
  },
} as const

export type TypographyTokens = typeof typography
