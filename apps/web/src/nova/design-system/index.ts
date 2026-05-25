/**
 * Nova Design System — public API.
 *
 * Import desde aquí en lugar de paths internos:
 *   import { Surface, Headline, Button, Section } from '../design-system'
 *
 * Política: cualquier componente Nova NUEVO debe usar primitives de este
 * design system primero. Solo crear `text-[Npx]` inline o `bg-white p-4`
 * ad-hoc si el primitive NO cubre el caso — y en ese caso, REPORTAR para
 * agregar al design system.
 */

// Tokens (use con cuidado — typicamente vienen empaquetados en los primitives)
export * from './tokens'

// Typography
export {
  DisplayLarge,
  Display,
  HeadlineLarge,
  Headline,
  Title,
  Body,
  BodyMedium,
  Callout,
  Subhead,
  Caption,
  Eyebrow,
  Code,
  Metric,
  MetricLarge,
} from './Typography'

// Layout
export { Surface } from './Surface'
export { Section, SectionHeader } from './Section'

// Actions
export { Button, IconButton } from './Button'
export type { ButtonProps, IconButtonProps } from './Button'

// Status
export { EmptyState } from './EmptyState'
export { StatTile } from './StatTile'
export type { StatAccent } from './StatTile'

// Loading
export { Skeleton, SkeletonText } from './Skeleton'

// Existing primitives (re-export para uniformidad)
export { Chip, StatusChip } from '../components/Chip'
export type { ChipVariant, ChipIntent, ChipSize, ChipProps } from '../components/Chip'
