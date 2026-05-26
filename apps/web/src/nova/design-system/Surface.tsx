/**
 * Surface — card / panel / container primitive.
 *
 * Apple HIG layered depth: stacked shadows + tonal background + subtle border.
 *
 * Variants:
 *   - 'raised' (default) — card on page bg, e1 elevation, white bg
 *   - 'overlay' — popover/dropdown, e3 elevation
 *   - 'sunken' — input field background, no elevation, slate-50 bg
 *   - 'flat' — no shadow, no border (use con cuidado)
 *   - 'glass' — backdrop-blur transparent (NOT for content-heavy)
 *
 * Interactive variants (hover lift):
 *   - hoverable: true → adds e2 on hover + slight translate-y-0.5
 *
 * Tonal variant (con accent color subtle):
 *   - tone: 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'
 */
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ELEVATION, RADIUS } from './tokens'

type SurfaceVariant = 'raised' | 'overlay' | 'sunken' | 'flat' | 'glass'
type SurfaceTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
type SurfaceRadius = keyof typeof RADIUS

const VARIANT_BG: Record<SurfaceVariant, string> = {
  raised: 'bg-white border border-slate-200/70',
  overlay: 'bg-white border border-slate-200',
  sunken: 'bg-slate-50 border border-slate-200/50',
  flat: 'bg-transparent',
  glass: 'bg-white/70 backdrop-blur-md backdrop-saturate-150 border border-white/40',
}

const VARIANT_SHADOW: Record<SurfaceVariant, string> = {
  raised: ELEVATION.e1,
  overlay: ELEVATION.e3,
  sunken: '',
  flat: '',
  glass: ELEVATION.e2,
}

// Tonal overlays con accent muy sutil — Material Design 3 tonal surface pattern.
// Aplicado encima del bg base via gradient para depth sin perder readability.
const TONE_TINT: Record<SurfaceTone, string> = {
  neutral: '',
  success: 'bg-gradient-to-br from-emerald-50/60 to-white',
  warning: 'bg-gradient-to-br from-amber-50/60 to-white',
  danger: 'bg-gradient-to-br from-red-50/40 to-white',
  info: 'bg-gradient-to-br from-sky-50/60 to-white',
  accent: 'bg-gradient-to-br from-violet-50/50 to-white',
}

const TONE_BORDER: Record<SurfaceTone, string> = {
  neutral: '',
  success: 'border-emerald-200/60',
  warning: 'border-amber-200/60',
  danger: 'border-red-200/60',
  info: 'border-sky-200/60',
  accent: 'border-violet-200/60',
}

interface SurfaceProps {
  as?: ElementType
  variant?: SurfaceVariant
  tone?: SurfaceTone
  radius?: SurfaceRadius
  hoverable?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  className?: string
  children: ReactNode
  onClick?: () => void
}

const PADDING: Record<NonNullable<SurfaceProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5 lg:p-6',
}

export function Surface({
  as: Tag = 'div',
  variant = 'raised',
  tone = 'neutral',
  radius = 'lg',
  hoverable = false,
  padding = 'none',
  className,
  children,
  onClick,
}: SurfaceProps) {
  const isInteractive = !!onClick || hoverable
  const baseBg = tone !== 'neutral' ? TONE_TINT[tone] : VARIANT_BG[variant]
  const baseBorder = tone !== 'neutral' ? `${VARIANT_BG[variant].split(' ').filter((c) => c.startsWith('border')).join(' ')} ${TONE_BORDER[tone]}` : VARIANT_BG[variant]

  return (
    <Tag
      onClick={onClick}
      className={cn(
        // Base: bg gradient si tone, else solid; siempre el border del variant
        tone !== 'neutral'
          ? cn(VARIANT_BG[variant].split(' ').filter((c) => !c.startsWith('bg-')).join(' '), TONE_TINT[tone])
          : VARIANT_BG[variant],
        // Override del border si tone tiene su propio
        tone !== 'neutral' && TONE_BORDER[tone],
        RADIUS[radius],
        VARIANT_SHADOW[variant],
        PADDING[padding],
        isInteractive && 'transition-all duration-200',
        hoverable && 'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-6px_rgba(15,23,42,0.10),0_4px_8px_-4px_rgba(15,23,42,0.06)] cursor-pointer',
        onClick && !hoverable && 'cursor-pointer hover:brightness-[0.99]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
