/**
 * _DashCard — shared card shell for all dashboard cards.
 *
 * Why this exists
 * ───────────────
 * The user's feedback: "todo se ve igual con mismo tamaño y fuentes" and
 * "el detalle luce exactamente igual". Root cause: every card historically
 * declared its own padding/border/header pattern → drift accumulated
 * (some 16px, some 18px; some uppercase, some not).
 *
 * `_DashCard` is the **single source of card-level layout** — the card
 * outline, header, optional accent strip, optional CTA footer. Every
 * dashboard card composes this rather than building from scratch.
 *
 * Hierarchy:
 *   ┌─ accent strip (optional, 3px tall, status color) ─┐
 *   │ SECTION LABEL                          [trailing]  │  ← L2 header
 *   │                                                     │
 *   │ ...children (L0/L1/L3/L4 content)...                │
 *   │                                                     │
 *   │ ─────────────                                       │
 *   │ [optional CTA footer — Ver más, Ver todas, etc.]    │  ← L3 action
 *   └─────────────────────────────────────────────────────┘
 *
 * Visual rules:
 *   - Padding 18px (Apple HIG card edge guideline)
 *   - Border 1px subtle (separates from canvas without harsh contrast)
 *   - Border-radius 16px (matches Apple iOS card radii since iOS 13)
 *   - Optional accent strip = 3px top edge, full-width (Mews mobile pattern)
 *   - Header row baseline-aligned (label vs trailing meta)
 *   - Footer separator only when CTA present
 */

import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { colors } from '../../../design/colors'
import { dashboardType } from '../typography'

interface DashCardProps {
  /** Section label — uppercase L2 micro. Required for consistency. */
  label: string
  /** Optional emphasis color for the label (e.g. amber for warnings). */
  labelColor?: string
  /** Trailing element in the header row (count badge, percentage, etc). */
  trailing?: React.ReactNode
  /** Top accent strip color (e.g. red for blocked, amber for caution). */
  accentColor?: string
  /** Optional CTA footer — separator drawn above. */
  cta?: { label: string; onPress: () => void; tone?: 'primary' | 'neutral' }
  /** Tinted background — use for warning/critical cards. */
  tintBg?: string
  /** Tinted border — paired with tintBg for sustained color cards. */
  tintBorder?: string
  /** Card content. */
  children: React.ReactNode
  /** Make the entire card pressable (chevron rendered automatically). */
  onPress?: () => void
}

export function DashCard({
  label,
  labelColor,
  trailing,
  accentColor,
  cta,
  tintBg,
  tintBorder,
  children,
  onPress,
}: DashCardProps) {
  const containerStyle = [
    styles.card,
    tintBg ? { backgroundColor: tintBg } : undefined,
    tintBorder ? { borderColor: tintBorder } : undefined,
  ]

  const inner = (
    <>
      {accentColor && (
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
      )}

      <View style={styles.bodyPadding}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[dashboardType.sectionLabel, labelColor ? { color: labelColor } : undefined]}>
            {label}
          </Text>
          <View style={styles.trailing}>
            {trailing}
            {onPress && <Text style={styles.headerChevron}>›</Text>}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>

        {/* CTA footer */}
        {cta && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync()
              cta.onPress()
            }}
            style={styles.ctaFooter}
            hitSlop={6}
          >
            <Text
              style={[
                dashboardType.action,
                { color: cta.tone === 'primary' ? colors.brand[400] : colors.text.secondary },
              ]}
            >
              {cta.label} →
            </Text>
          </Pressable>
        )}
      </View>
    </>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync()
          onPress()
        }}
        style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
      >
        {inner}
      </Pressable>
    )
  }

  return <View style={containerStyle}>{inner}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
  accent: {
    height: 3,
  },
  bodyPadding: {
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerChevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    fontWeight: '300',
    lineHeight: 24,
  },
  content: {
    marginTop: 12,
  },
  ctaFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    // Right-aligned so the CTA sits in the thumb-reach zone for the
    // dominant hand (Hoober 2013 — most users hold the phone in the
    // right hand; the bottom-right corner is the most ergonomic
    // tap target). For left-handed users it's still reachable
    // because mobile cards are narrower than the thumb's arc.
    alignItems: 'flex-end',
  },
})
