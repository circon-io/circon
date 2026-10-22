import type { Dictionary } from '@/i18n/dictionaries'
import { GatePipeline } from '../graphics/gate-pipeline'
import { Reveal } from '../reveal'
import { Feature, Section, SectionHeading } from '../ui/section'
import { EyeIcon, ShieldIcon } from '../ui/icons'

export function Gate({ dict }: { dict: Dictionary }) {
  const t = dict.gate
  return (
    <Section id="gate" className="overflow-hidden">
      <div className="bg-dots pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]" aria-hidden />
      <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} />
      <Reveal>
        <GatePipeline t={t} />
      </Reveal>
      <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-2">
        <Reveal>
          <Feature icon={<ShieldIcon />} title={t.breakerTitle} body={t.breakerBody} />
        </Reveal>
        <Reveal delay={0.08}>
          <Feature icon={<EyeIcon />} title={t.reviewTitle} body={t.reviewBody} />
        </Reveal>
      </div>
    </Section>
  )
}
