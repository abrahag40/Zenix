/**
 * Section — wrapper para áreas del dashboard con título + subtitle + slot acciones.
 *
 * Apple HIG pattern: cada sección tiene un "eyebrow" header pequeño + título
 * + descripción + acción opcional a la derecha. Tipografía consistente.
 *
 * Uso:
 *   <Section
 *     title="Resumen del cliente"
 *     subtitle="Datos generales actualizados en vivo"
 *     actions={<Button variant="ghost" size="sm">Ver todo</Button>}
 *   >
 *     <content here>
 *   </Section>
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Title, Caption } from './Typography'

interface SectionProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
  // Densidad: 'comfortable' default | 'compact' (less spacing)
  density?: 'comfortable' | 'compact'
}

export function Section({ title, subtitle, actions, className, children, density = 'comfortable' }: SectionProps) {
  return (
    <section className={cn(density === 'comfortable' ? 'space-y-3' : 'space-y-2', className)}>
      <SectionHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </section>
  )
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <Title>{title}</Title>
        {subtitle && (
          <Caption className="mt-0.5 block" tone="tertiary">
            {subtitle}
          </Caption>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
