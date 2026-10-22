import { buttonVariants } from '@heroui/react'
import { site } from '@/content/site'
import type { Dictionary } from '@/i18n/dictionaries'
import { Reveal } from '../reveal'
import { cx } from '../ui/cx'
import { CheckIcon } from '../ui/icons'
import { Section, SectionHeading } from '../ui/section'

/** The plans from control-plane/src/billing/plans.ts; keep the limits in step with it. */
export function Pricing({ dict }: { dict: Dictionary }) {
  const t = dict.pricing
  return (
    <Section id="pricing" className="border-t border-border bg-surface/40">
      <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} />
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {t.plans.map((plan, i) => {
          const featured = i === 1
          return (
            <Reveal key={plan.name} delay={i * 0.1}>
              <article
                className={cx(
                  'relative flex h-full flex-col rounded-2xl bg-surface p-6 sm:p-8',
                  featured ? 'beam-border shadow-[0_20px_60px_-25px_var(--accent)]' : 'border border-border',
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {featured && (
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-soft-foreground">{t.recommended}</span>
                  )}
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight">{plan.price}</p>
                <p className="mt-1 text-sm text-muted">{plan.description}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <CheckIcon className="size-4 shrink-0 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={site.dashboardUrl}
                  className={cx(buttonVariants({ variant: featured ? 'primary' : 'outline', fullWidth: true }), 'mt-8')}
                >
                  {plan.cta}
                </a>
              </article>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}
