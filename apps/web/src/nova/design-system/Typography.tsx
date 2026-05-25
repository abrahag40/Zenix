/**
 * Typography — Apple HIG-inspired text primitives.
 *
 * Reemplaza estilos ad-hoc `text-[13px]` etc. Cada componente tiene
 * semántica visual + HTML.
 *
 * Uso:
 *   <Display>Page hero title</Display>
 *   <Headline>Section primary head</Headline>
 *   <Title>Card title</Title>
 *   <Body>Main paragraph content</Body>
 *   <Callout>Secondary description</Callout>
 *   <Subhead>Meta label / form label</Subhead>
 *   <Caption>Fine print / hint</Caption>
 *   <Eyebrow>UPPERCASE SECTION INTRO</Eyebrow>
 *   <Code>monospace inline</Code>
 *
 * Override props:
 *   - as: HTML element (defaults to h1/h2/p semánticamente correctos)
 *   - tone: primary | secondary | tertiary | quaternary (Apple label colors)
 *   - className: extras (Tailwind)
 */
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TEXT, LABEL } from './tokens'

type Tone = 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'inverse'

const TONE_CLASS: Record<Tone, string> = {
  primary: LABEL.primary,
  secondary: LABEL.secondary,
  tertiary: LABEL.tertiary,
  quaternary: LABEL.quaternary,
  inverse: LABEL.inverse,
}

interface TextProps {
  as?: ElementType
  tone?: Tone
  className?: string
  children?: ReactNode
  truncate?: boolean
  // Para data tabular (números) — fixed-width
  tabular?: boolean
  // Para alinear con icon usado a su lado
  inline?: boolean
}

interface BuildClassNameOpts {
  tone?: Tone
  truncate?: boolean
  tabular?: boolean
  inline?: boolean
  className?: string
}

function buildClassName(base: string, opts: BuildClassNameOpts): string {
  return cn(
    base,
    opts.tone && TONE_CLASS[opts.tone],
    opts.truncate && 'truncate',
    opts.tabular && 'tabular-nums',
    opts.inline && 'inline-block',
    opts.className,
  )
}

// ─── Display (hero) ───────────────────────────────────────────────────

export function DisplayLarge({ as: Tag = 'h1', children, ...rest }: TextProps) {
  return (
    <Tag className={buildClassName(TEXT.displayLarge, rest)}>
      {children}
    </Tag>
  )
}

export function Display({ as: Tag = 'h1', children, ...rest }: TextProps) {
  return (
    <Tag className={buildClassName(TEXT.displayMedium, rest)}>{children}</Tag>
  )
}

// ─── Headlines (section primary) ──────────────────────────────────────

export function HeadlineLarge({ as: Tag = 'h2', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.headlineLarge, rest)}>{children}</Tag>
}

export function Headline({ as: Tag = 'h2', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.headline, rest)}>{children}</Tag>
}

// ─── Title (card / modal heads) ──────────────────────────────────────

export function Title({ as: Tag = 'h3', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.title, rest)}>{children}</Tag>
}

// ─── Body (primary content) ─────────────────────────────────────────

export function Body({ as: Tag = 'p', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.body, rest)}>{children}</Tag>
}

export function BodyMedium({ as: Tag = 'p', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.bodyMedium, rest)}>{children}</Tag>
}

// ─── Callout (secondary descriptions) ──────────────────────────────

export function Callout({ as: Tag = 'p', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.callout, rest)}>{children}</Tag>
}

// ─── Subhead (meta labels, form labels) ────────────────────────────

export function Subhead({ as: Tag = 'span', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.subhead, rest)}>{children}</Tag>
}

// ─── Caption (fine print) ──────────────────────────────────────────

export function Caption({ as: Tag = 'span', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.caption, rest)}>{children}</Tag>
}

// ─── Eyebrow (uppercase section intro) ─────────────────────────────

export function Eyebrow({ as: Tag = 'span', children, ...rest }: TextProps) {
  return <Tag className={buildClassName(TEXT.eyebrow, rest)}>{children}</Tag>
}

// ─── Code (inline monospace) ───────────────────────────────────────

export function Code({
  children,
  className,
  variant = 'subtle',
}: {
  children: ReactNode
  className?: string
  variant?: 'subtle' | 'inline'
}) {
  return (
    <code
      className={cn(
        'font-mono text-[12px] tabular-nums',
        variant === 'subtle' && 'px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/70',
        variant === 'inline' && 'text-slate-700',
        className,
      )}
    >
      {children}
    </code>
  )
}

// ─── Number — display de métrica grande ────────────────────────────

export function Metric({
  children,
  className,
  tabular = true,
}: {
  children: ReactNode
  className?: string
  tabular?: boolean
}) {
  return (
    <div
      className={cn(
        'text-[24px] font-semibold text-slate-900 leading-none tracking-tight',
        tabular && 'tabular-nums',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MetricLarge({
  children,
  className,
  tabular = true,
}: {
  children: ReactNode
  className?: string
  tabular?: boolean
}) {
  return (
    <div
      className={cn(
        'text-[36px] font-semibold text-slate-900 leading-none tracking-tight',
        tabular && 'tabular-nums',
        className,
      )}
    >
      {children}
    </div>
  )
}
