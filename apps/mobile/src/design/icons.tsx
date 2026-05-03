/**
 * Icon set for Zenix mobile.
 *
 * Inline SVG components — no external icon font (vector-icons) to keep
 * bundle slim and ensure crisp rendering at any density (2x, 3x screens).
 * Inspired by Lucide / SF Symbols visual language: 24x24 viewBox,
 * 1.75 stroke width, rounded line caps/joins.
 *
 * Design rationale:
 *   - Stroke icons (not filled): consistent visual weight with system UI.
 *     Apple HIG and Material 3 both default to outlined for navigation,
 *     filled for active/selected state.
 *   - Active state via fill, not via re-importing a separate icon. Keeps
 *     code DRY and animation possible (color interpolation in Reanimated).
 *   - Stroke-based icons are perceived as more "refined" / professional
 *     than filled (Nielsen NN/g iconography studies, 2018).
 */

import Svg, { Path } from 'react-native-svg'

interface IconProps {
  size?: number
  color?: string
  /** When true, fills the shape (used by tab active state). */
  active?: boolean
}

const STROKE_WIDTH = 1.75

/**
 * Common Path props — strokeLinecap/Join 'round' produces softer ends,
 * matching SF Symbols and Lucide style.
 */
const pathProps = (color: string, active: boolean) => ({
  stroke: color,
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: active ? color : 'none',
  fillOpacity: active ? 0.18 : 0,
})

// ─── Home (house) — Inicio / Dashboard ──────────────────────────────────────
export function IconHome({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z" {...pathProps(color, active)} />
    </Svg>
  )
}

// ─── Bed — Mi Día (housekeeping work) ───────────────────────────────────────
export function IconBed({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 7v13M3 13h18M21 20v-7a3 3 0 0 0-3-3H8M7 11.5a2 2 0 1 0-4 0 2 2 0 0 0 4 0z" {...pathProps(color, active)} />
    </Svg>
  )
}

// ─── Bell — Notificaciones ──────────────────────────────────────────────────
export function IconBell({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM10.3 21a1.94 1.94 0 0 0 3.4 0" {...pathProps(color, active)} />
    </Svg>
  )
}

// ─── User — Yo / Profile ────────────────────────────────────────────────────
export function IconUser({ size = 24, color = '#9CA3AF', active = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" {...pathProps(color, active)} />
    </Svg>
  )
}

// ─── Chevron Right — for menu items ─────────────────────────────────────────
export function IconChevronRight({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 18l6-6-6-6" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Logout — for the Me menu ───────────────────────────────────────────────
export function IconLogout({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Settings (cog) ─────────────────────────────────────────────────────────
export function IconSettings({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...pathProps(color, false)}
      />
    </Svg>
  )
}

// ─── Globe — for language settings ──────────────────────────────────────────
export function IconGlobe({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Lock — for security/privacy ────────────────────────────────────────────
export function IconLock({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 11h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Help (circle question) ─────────────────────────────────────────────────
export function IconHelp({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"
        {...pathProps(color, false)}
      />
    </Svg>
  )
}

// ─── Sparkles — for the gamification preview ──────────────────────────────
export function IconSparkles({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Pencil (square-pen) — Add note (advisory action) ─────────────────────
export function IconPencil({ size = 22, color = '#FBBF24' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" {...pathProps(color, false)} />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── AlertTriangle — Report issue (warning, needs attention) ──────────────
export function IconAlertTriangle({ size = 22, color = '#F87171' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Pause (two pillars) — Pause active task ──────────────────────────────
// Filled rectangles (not stroke) — matches Spotify, Apple Music, Strava
// pause-glyph convention. Higher visual weight = clearer affordance.
export function IconPause({ size = 18, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5h3v14H8zM13 5h3v14h-3z" fill={color} />
    </Svg>
  )
}

// ─── ChevronDown — Scroll affordance ──────────────────────────────────────
export function IconChevronDown({ size = 16, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9l6 6 6-6" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Sun (greeting / morning) ──────────────────────────────────────────────
export function IconSun({ size = 20, color = '#FBBF24' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h3M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Zap (lightning bolt) — critical/double-urgent sections ────────────────
export function IconZap({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── LogIn (entering arrow) — "Hoy entra" / same-day check-in ──────────────
export function IconLogIn({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── RotateCcw — carryover / "De ayer" (task from previous day) ────────────
export function IconRotateCcw({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── List — normal tasks queue ─────────────────────────────────────────────
export function IconListTask({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── CheckCircle — completed tasks / done section ──────────────────────────
export function IconCheckCircle({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Leaf — streak indicator (growing, organic progress) ───────────────────
export function IconLeaf({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" {...pathProps(color, false)} />
    </Svg>
  )
}

// ─── Star — personal record / streak PR ────────────────────────────────────
// `filled` makes the star solid (full fillOpacity) — used for PR state.
export function IconStar({
  size = 20,
  color = '#9CA3AF',
  filled = false,
}: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
        fillOpacity={filled ? 0.9 : 0}
      />
    </Svg>
  )
}

// ─── Check — large checkmark (all-done state in progress counter) ───────────
export function IconCheck({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6 9 17l-5-5" {...pathProps(color, false)} />
    </Svg>
  )
}
