/**
 * Zenix Design System — Motion tokens.
 *
 * Anchored to plan §8.0: RN Reanimated v4 + SwiftUI-aligned curves.
 * All animations target 60fps on iPhone 11 / Pixel 4a baseline (Apple HIG +
 * Material Design 3 minimum). Reanimated v4 runs on the UI thread, not the
 * JS thread, ensuring frame consistency under load.
 *
 * Curve philosophy (CLAUDE.md §13b extended to mobile):
 *   - Entrance:  spring (response: 0.4, damping: 0.8) — feels organic, no overshoot
 *   - Exit:      easing-out (~40% shorter than entrance) — leaves stage fast
 *   - Interactive (drag/swipe): spring with high responsiveness, no bounce
 *   - Tap feedback: snappy spring, scale 0.97 → 1
 */
import { Easing } from 'react-native-reanimated'

export const MOTION = {
  // ── Spring presets (cubic-bezier equivalents in iOS SwiftUI)
  spring: {
    // Standard entrance — sheets, cards, modal slides. Equivalent to:
    //   .spring(response: 0.4, dampingFraction: 0.8)
    standard: { damping: 18, stiffness: 180, mass: 1 },
    // Gentler — used for "settled" final states (day-complete celebration overlay).
    gentle:   { damping: 22, stiffness: 90,  mass: 1.2 },
    // Snappy — tap feedback, button press scale. Fast settle, no bounce.
    snappy:   { damping: 14, stiffness: 260, mass: 0.8 },
    // Wobbly — for celebratory micro-interactions (variable ratio reward).
    // Light overshoot (~5%) communicates "achievement" without distracting.
    bouncy:   { damping: 12, stiffness: 200, mass: 1 },
  },

  // ── Bezier curves for withTiming() — when spring isn't appropriate
  // These mirror CLAUDE.md §13b web tokens, kept in sync for consistency.
  ease: {
    spring:    Easing.bezier(0.22, 1, 0.36, 1),     // entrance, similar feel to spring.standard
    sharpOut:  Easing.bezier(0.55, 0, 1, 0.45),     // exit — quick, no lingering
    inOut:     Easing.bezier(0.42, 0, 0.58, 1),     // discrete state changes
  },

  // ── Durations (ms)
  duration: {
    instant:   80,    // micro-feedback (chip press)
    fast:      180,   // exits
    standard:  320,   // entrance default
    slow:      480,   // hero/full-screen transitions
    celebration: 800, // day-complete overlay reveal
  },
} as const

export type MotionTokens = typeof MOTION
