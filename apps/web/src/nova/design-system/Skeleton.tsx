/**
 * Skeleton — loading placeholders.
 *
 * Apple HIG: usar skeletons en lugar de spinners cuando se conoce el shape
 * del contenido. Reduce perceived loading time (NN/g 2023 — "skeleton
 * screens reduce perceived wait by 20-30% vs spinners").
 *
 * Variants:
 *   - 'line' (default) — para líneas de texto
 *   - 'circle' — avatares, iconos
 *   - 'card' — bloques de contenido
 */
import { cn } from '@/lib/utils'

interface SkeletonProps {
  variant?: 'line' | 'circle' | 'card'
  className?: string
  /** Width — px, %, o Tailwind class. Default 100%. */
  width?: string
  /** Height — px o Tailwind class. Variant-driven default. */
  height?: string
}

export function Skeleton({ variant = 'line', className, width, height }: SkeletonProps) {
  const variantCls =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'card'
        ? 'rounded-xl'
        : 'rounded'

  return (
    <div
      className={cn(
        'bg-gradient-to-r from-slate-200/60 via-slate-300/40 to-slate-200/60 animate-pulse',
        variantCls,
        !height && variant === 'line' && 'h-4',
        !height && variant === 'circle' && 'h-10 w-10',
        !height && variant === 'card' && 'h-32 w-full',
        className,
      )}
      style={{ width, height }}
      aria-hidden
    />
  )
}

/** Cluster de skeleton lines para simular un bloque de texto. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="line"
          width={i === lines - 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  )
}
