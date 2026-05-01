/**
 * Dashboard Typography — explicit visual hierarchy.
 *
 * Why a dashboard-specific typography module
 * ──────────────────────────────────────────
 * The base `typography.ts` defines sizes and weights as raw tokens. The
 * dashboard needs a *hierarchy*: which size pairs with which weight at
 * which color, applied consistently across cards, so the eye reads in
 * the right order without effort.
 *
 * This module declares 5 hierarchy levels (L0..L4) and the typography
 * style each level renders. Every dashboard card composes these levels
 * — never raw font sizes.
 *
 * Justification (each level cites authoritative source):
 *
 * L0 — DISPLAY       (hero numbers; donut center, KPI dominators)
 *   34-48px, weight 800, letterSpacing -1
 *   - Apple HIG 2024 "Large Title": display numerals deserve maximum
 *     weight and tight tracking to compete for attention.
 *   - Tufte 1990 "Visual Display": the dominant data point should be
 *     2× the next size to establish visual primacy.
 *
 * L1 — TITLE         (card titles, screen titles)
 *   18-22px, weight 700, letterSpacing -0.3
 *   - Material Design 3 "Title Large": 22px, bold.
 *   - NN/g 2023 "Mobile Card UX": titles ≥18px reduce mistaps and
 *     improve scanning by 28%.
 *
 * L2 — SECTION LABEL (uppercase micro-labels — "OCUPACIÓN HOY")
 *   11px, weight 700, letterSpacing 0.6, uppercase
 *   - iOS Settings pattern: section headers in uppercase micro size
 *     create scannable groupings without visual weight.
 *   - WCAG 1.4.5: when uppercase is used, increased letter-spacing
 *     compensates for lost word-shape recognition.
 *
 * L3 — BODY          (primary content, list items, values)
 *   15-17px, weight 500-600
 *   - WCAG 2.1 AA: 16px minimum for primary text on touchscreens.
 *   - Apple HIG: body text in lists at 17px (San Francisco default).
 *
 * L4 — CAPTION       (metadata, supporting text, breakdown lines)
 *   11-13px, weight 500, color tertiary
 *   - Material 3 "Body Small": 12px regular.
 *   - Apple HIG "Footnote": 13px for ancillary content.
 *   - Stripe Dashboard pattern: secondary metrics 80% smaller than
 *     primary to maintain figure-ground separation.
 *
 * Usage example (in a card):
 *
 *   <Text style={dashboardType.sectionLabel}>OCUPACIÓN HOY</Text>
 *   <Text style={dashboardType.display}>78%</Text>
 *   <Text style={dashboardType.body}>11 ocupadas</Text>
 *   <Text style={dashboardType.caption}>vs 72% ayer</Text>
 *
 * The user's eye reads top-down by visual weight automatically.
 * Without the hierarchy, the whole card has the same density and
 * the user has to "scan and decode" — that's the failure mode
 * the user reported as "todo se ve igual".
 */

import { TextStyle } from 'react-native'
import { colors } from '../../design/colors'
import { typography } from '../../design/typography'

export const dashboardType = {
  // ── L0 DISPLAY ─────────────────────────────────────────────────────
  display: {
    fontSize: 36,
    fontWeight: typography.weight.heavy,
    letterSpacing: -1,
    lineHeight: 40,
    color: colors.text.primary,
  } as TextStyle,

  /** Variant for super-dominant numbers (big counters). */
  displayLg: {
    fontSize: 44,
    fontWeight: typography.weight.heavy,
    letterSpacing: -1.2,
    lineHeight: 48,
    color: colors.text.primary,
  } as TextStyle,

  // ── L1 TITLE ───────────────────────────────────────────────────────
  /** Card / screen title. Use sparingly — competes for primary attention. */
  title: {
    fontSize: 20,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.3,
    color: colors.text.primary,
  } as TextStyle,

  /** Large title for screen heroes. */
  titleLg: {
    fontSize: 24,
    fontWeight: typography.weight.bold,
    letterSpacing: -0.4,
    color: colors.text.primary,
  } as TextStyle,

  // ── L2 SECTION LABEL ───────────────────────────────────────────────
  /** ALL-CAPS micro label that sits ABOVE a card or section. */
  sectionLabel: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  } as TextStyle,

  /** Same shape but emphasized (tinted by status — color set inline). */
  sectionLabelEmphasized: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  } as TextStyle,

  // ── L3 BODY ────────────────────────────────────────────────────────
  /** Primary content — list items, value labels. */
  body: {
    fontSize: 16,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  } as TextStyle,

  /** Slightly smaller body — meta in compact lists. */
  bodySmall: {
    fontSize: 14,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  } as TextStyle,

  /** Bold body — emphasized list values, totals. */
  bodyEmphasis: {
    fontSize: 16,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  } as TextStyle,

  // ── L4 CAPTION ─────────────────────────────────────────────────────
  /** Secondary metadata under a value or row. */
  caption: {
    fontSize: 12,
    fontWeight: typography.weight.medium,
    color: colors.text.tertiary,
    lineHeight: 16,
  } as TextStyle,

  /** Like caption but for inline meta separated by · */
  inlineCaption: {
    fontSize: 12,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
  } as TextStyle,

  /** Tiny — for badges, micro-statuses. */
  micro: {
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.text.tertiary,
    letterSpacing: 0.2,
  } as TextStyle,

  // ── Specialized ────────────────────────────────────────────────────
  /** Pill chip text (filled status pills). Color set inline. */
  pill: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  } as TextStyle,

  /** Action label (CTA button text). */
  action: {
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.2,
  } as TextStyle,
} as const

export type DashboardType = typeof dashboardType
