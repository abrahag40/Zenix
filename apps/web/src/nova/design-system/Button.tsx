/**
 * Button — Apple HIG-inspired button primitive.
 *
 * Diferenciado vs el `<Button>` legacy de `apps/web/src/components/ui/button.tsx`:
 *   Este es ESPECÍFICO de Nova — con gradient bg (macOS Big Sur+),
 *   glow shadow para primary, density compacta para dashboard.
 *
 * Variants:
 *   - primary (default) — gradient emerald + glow shadow + white text
 *   - secondary — white bg + slate border, hover slate-50
 *   - ghost — transparent, hover slate-100, no border
 *   - destructive — gradient red + glow
 *   - link — text-only emerald, underline hover
 *
 * Sizes:
 *   - xs (24h) — pills, secondary actions inline
 *   - sm (28h) — table actions, compact toolbars
 *   - md (32h) — default forms, dialogs
 *   - lg (40h) — primary CTAs, modal confirms
 *
 * Features:
 *   - Loading state (spinner replaces icon)
 *   - Icon slot left/right
 *   - Full-width prop
 *   - Disabled state correctly de-saturated
 */
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ELEVATION, FOCUS, RADIUS } from './tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-gradient-to-b from-emerald-600 to-emerald-700',
    'hover:from-emerald-700 hover:to-emerald-800',
    'active:from-emerald-800 active:to-emerald-900',
    'text-white border border-emerald-700/50',
    ELEVATION.glowEmerald,
  ),
  secondary: cn(
    'bg-white hover:bg-slate-50 active:bg-slate-100',
    'text-slate-900 border border-slate-300 hover:border-slate-400',
    ELEVATION.e1,
  ),
  ghost: cn(
    'bg-transparent hover:bg-slate-100 active:bg-slate-200',
    'text-slate-700 hover:text-slate-900 border border-transparent',
  ),
  destructive: cn(
    'bg-gradient-to-b from-red-600 to-red-700',
    'hover:from-red-700 hover:to-red-800',
    'active:from-red-800 active:to-red-900',
    'text-white border border-red-700/50',
    ELEVATION.glowDanger,
  ),
  link: 'bg-transparent text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-4 border-0 shadow-none px-0 py-0 h-auto',
}

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-md',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  lg: 'h-10 px-4 text-[14px] gap-2 rounded-lg',
}

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: LucideIcon
  iconRight?: LucideIcon
  isLoading?: boolean
  fullWidth?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft: IconLeft,
    iconRight: IconRight,
    isLoading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isLink = variant === 'link'
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        // Base
        'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-all duration-150 ease-out',
        FOCUS.ring,
        // Variant
        VARIANT[variant],
        // Size (excepto link — usa size para text)
        !isLink && SIZE[size],
        isLink && SIZE[size].replace(/h-\d+|px-[\d.]+/g, ''),
        // Disabled state
        '[&:disabled]:opacity-40 [&:disabled]:cursor-not-allowed [&:disabled]:shadow-none',
        '[&:disabled]:hover:translate-y-0',
        // Active press
        'active:translate-y-px',
        // Full width
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <Loader2 className={cn(ICON_SIZE[size], 'animate-spin')} aria-hidden />
      ) : IconLeft ? (
        <IconLeft className={ICON_SIZE[size]} aria-hidden />
      ) : null}
      {children && <span>{children}</span>}
      {!isLoading && IconRight && <IconRight className={ICON_SIZE[size]} aria-hidden />}
    </button>
  )
})

// ─── IconButton — atajo para botones solo-icono ───────────────────────

export interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'iconLeft' | 'iconRight'> {
  icon: LucideIcon
  'aria-label': string // OBLIGATORIO para a11y
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon: Icon, size = 'md', variant = 'ghost', className, ...rest }, ref) {
    const sizeCls: Record<ButtonSize, string> = {
      xs: 'h-6 w-6',
      sm: 'h-7 w-7',
      md: 'h-8 w-8',
      lg: 'h-10 w-10',
    }
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
          'transition-all duration-150 ease-out',
          FOCUS.ring,
          RADIUS.md,
          VARIANT[variant],
          sizeCls[size],
          '[&:disabled]:opacity-40 [&:disabled]:cursor-not-allowed',
          'active:translate-y-px',
          className,
        )}
        {...rest}
      >
        <Icon className={ICON_SIZE[size]} aria-hidden />
      </button>
    )
  },
)
