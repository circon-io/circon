import type { Dictionary } from '@/i18n/dictionaries'
import { Reveal } from '../reveal'
import { cx } from '../ui/cx'
import { Section, SectionHeading } from '../ui/section'
import { LayoutIcon, ServerIcon } from './flow-icons'

/**
 * The flow as two lanes, like the diagram in VISION.md: what happens in the
 * dashboard on the left, on your runner on the right, one rail between them
 * with a light running down it.
 */
export function Flow({ dict }: { dict: Dictionary }) {
  const t = dict.flow
  return (
    <Section id="how">
      <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} />

      <div className="relative mx-auto max-w-4xl">
        {/* Lane headings */}
        <div className="mb-8 hidden grid-cols-[1fr_3rem_1fr] text-sm font-medium md:grid">
          <div className="flex items-center justify-end gap-2 text-muted">
            <LayoutIcon className="size-4" /> {t.dashboardLane}
          </div>
          <div />
          <div className="flex items-center gap-2 text-muted">
            <ServerIcon className="size-4" /> {t.runnerLane}
          </div>
        </div>

        {/* The rail */}
        <div className="absolute bottom-0 left-4 top-0 w-px bg-border md:left-1/2 md:top-12" aria-hidden>
          <span className="rail-light" />
        </div>

        <ol className="relative space-y-6 md:space-y-4">
          {t.steps.map((step, i) => {
            const runner = step.lane === 'runner'
            return (
              <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-4 md:grid-cols-[1fr_3rem_1fr] md:gap-0">
                <div className={cx('hidden md:block', runner && 'md:order-3')}>
                  <Reveal className={cx(runner ? 'md:pl-2' : 'md:pr-2')}>
                    <StepCard title={step.title} body={step.body} />
                  </Reveal>
                </div>
                <div className="relative flex justify-center pt-5 md:order-2">
                  <span
                    className={cx(
                      'relative z-10 grid size-8 place-items-center rounded-full border text-xs font-semibold tabular-nums',
                      runner ? 'border-glow/50 bg-surface text-glow' : 'border-accent/50 bg-surface text-accent',
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className={cx('md:block', runner ? 'md:order-1' : 'md:order-3')}>
                  {/* Mobile: every card on the right, with its lane named. */}
                  <Reveal className="md:hidden">
                    <p className="mb-1.5 text-xs font-medium text-muted">{runner ? t.runnerLane : t.dashboardLane}</p>
                    <StepCard title={step.title} body={step.body} />
                  </Reveal>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </Section>
  )
}

// Text is left-aligned in both lanes: right-aligned paragraphs read badly, and
// the card's side of the rail already says which lane it is in.
function StepCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="group rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:border-accent/40">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  )
}
