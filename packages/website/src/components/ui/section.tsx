import { Reveal } from '../reveal'
import { cx } from './cx'

/** A page section: an anchor, a width, and vertical rhythm. */
export function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cx('relative scroll-mt-20 py-20 sm:py-28', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  )
}

/** Eyebrow, headline, lede. The headline is the section's h2. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow: string
  title: string
  subtitle?: string
  align?: 'center' | 'left'
}) {
  return (
    <Reveal className={cx('mb-12 max-w-2xl sm:mb-16', align === 'center' && 'mx-auto text-center')}>
      <p className="mb-3 text-sm font-medium text-accent">{eyebrow}</p>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-pretty text-base leading-relaxed text-muted sm:text-lg">{subtitle}</p>}
    </Reveal>
  )
}

/** A quiet feature: icon, title, one sentence. */
export function Feature({ icon, title, body }: { icon?: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      {icon && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-accent">{icon}</div>}
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  )
}
