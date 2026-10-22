'use client'

import { useState } from 'react'
import NextLink from 'next/link'
import { CheckIcon, CopyIcon } from './icons'

/**
 * The dashboard's building blocks. One look, defined once: surfaces with a
 * hairline border, quiet labels, and color reserved for meaning.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---- layout -------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-muted">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({ children, className, padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.03)]', padded && 'p-5', className)}>
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {actions}
    </div>
  )
}

// ---- data -------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  icon,
  href,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  href?: string
  tone?: 'default' | 'accent' | 'warning'
}) {
  const body = (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        {icon && (
          <span className={cx(tone === 'accent' && 'text-accent', tone === 'warning' && 'text-warning')}>{icon}</span>
        )}
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
    </div>
  )
  const classes = 'block rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)]'
  return href ? (
    <NextLink href={href} className={cx(classes, 'transition-colors hover:border-accent/40')}>
      {body}
    </NextLink>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-secondary text-muted',
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
}

const DOTS: Record<Tone, string> = {
  neutral: 'bg-muted/60',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  pulse = false,
  className,
}: {
  tone?: Tone
  children: React.ReactNode
  dot?: boolean
  pulse?: boolean
  className?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {children}
    </span>
  )
}

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return <span aria-hidden className={cx('inline-block size-1.5 shrink-0 rounded-full', DOTS[tone], pulse && 'animate-pulse-ring')} />
}

export function KeyValues({ items, columns = 4 }: { items: Array<[string, React.ReactNode]>; columns?: 2 | 3 | 4 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'py-8' : 'py-14')}>
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-secondary text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-secondary', className)} />
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[0.92em]', className)}>{children}</span>
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

// ---- forms -------------------------------------------------------------------------

export const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/70 hover:border-muted/40 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-50'

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** A settings row: what it is on the left, the control on the right. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-separator py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-md">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <div className="shrink-0 sm:w-72">{children}</div>
    </div>
  )
}

// ---- navigation ------------------------------------------------------------------

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string; badge?: number | undefined }>
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cx(
              'relative inline-flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1 text-sm transition-colors',
              selected ? 'font-medium text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="rounded-full bg-warning-soft px-1.5 text-[11px] font-semibold text-warning-soft-foreground">{tab.badge}</span>
            ) : null}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />}
          </button>
        )
      })}
    </div>
  )
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <div role="status" className={cx('rounded-lg px-3 py-2 text-sm', TONES[tone])}>
      {children}
    </div>
  )
}

/** A small set of mutually exclusive options, as a radio group. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-surface-secondary p-0.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-md font-medium transition-all',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              selected ? 'bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-border' : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
