import type { Dictionary } from '@/i18n/dictionaries'
import { DrawCheck } from '../graphics/draw-check'
import { Reveal } from '../reveal'
import { Section, SectionHeading } from '../ui/section'

export function Approve({ dict }: { dict: Dictionary }) {
  const t = dict.approve
  return (
    <Section id="approve" className="pt-0 sm:pt-0">
      <SectionHeading eyebrow={t.eyebrow} title={t.title} />
      <div className="relative mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {/* The connector between the two gates. */}
        <div className="absolute left-1/2 top-1/2 hidden h-px w-5 -translate-x-1/2 bg-border md:block" aria-hidden />
        {t.gates.map((gate, i) => (
          <Reveal key={gate.title} delay={i * 0.12}>
            <article className="h-full rounded-2xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:p-8">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-soft-foreground">{gate.label}</span>
                <DrawCheck delay={0.2 + i * 0.5} />
              </div>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">{gate.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{gate.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
