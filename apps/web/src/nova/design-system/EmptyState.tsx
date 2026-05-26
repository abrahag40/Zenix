/**
 * EmptyState — pattern para "sin datos", "sin permisos", "sin resultados".
 *
 * Apple HIG pattern: icono grande + título + descripción + CTA opcional.
 * Inspirado en macOS Finder "no results" + iOS empty list states.
 *
 * Variants:
 *   - 'default' — neutral con icon slate
 *   - 'noResults' — search filter empty (icono search)
 *   - 'noAccess' — permisos
 *   - 'error' — algo falló
 *   - 'success' — completado, nada por hacer (raro pero útil)
 *
 * Compact vs full:
 *   - size='md' (default) — full state para pantalla completa
 *   - size='sm' — compact para inside cards / panels
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Title, Callout } from './Typography'

type EmptyStateVariant = 'default' | 'noResults' | 'noAccess' | 'error' | 'success'
type EmptyStateSize = 'sm' | 'md'

const VARIANT_ICON_BG: Record<EmptyStateVariant, string> = {
  default: 'bg-gradient-to-br from-slate-100 to-slate-200/60 text-slate-500',
  noResults: 'bg-gradient-to-br from-slate-100 to-slate-200/60 text-slate-500',
  noAccess: 'bg-gradient-to-br from-amber-100 to-amber-200/60 text-amber-700',
  error: 'bg-gradient-to-br from-red-100 to-red-200/60 text-red-700',
  success: 'bg-gradient-to-br from-emerald-100 to-emerald-200/60 text-emerald-700',
}

const SIZE_ICON: Record<EmptyStateSize, string> = {
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-12 h-12 rounded-xl',
}

const SIZE_ICON_INNER: Record<EmptyStateSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
}

const SIZE_PADDING: Record<EmptyStateSize, string> = {
  sm: 'p-6',
  md: 'p-10 lg:p-12',
}

interface EmptyStateProps {
  variant?: EmptyStateVariant
  size?: EmptyStateSize
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  variant = 'default',
  size = 'md',
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(SIZE_PADDING[size], 'text-center', className)}>
      <div
        className={cn(
          'inline-flex items-center justify-center mx-auto',
          SIZE_ICON[size],
          VARIANT_ICON_BG[variant],
        )}
      >
        <Icon className={SIZE_ICON_INNER[size]} aria-hidden />
      </div>
      <Title as="h3" className="mt-3">
        {title}
      </Title>
      {description && (
        <Callout className="mt-1 max-w-md mx-auto" tone="tertiary">
          {description}
        </Callout>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
