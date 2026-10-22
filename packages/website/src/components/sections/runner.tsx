import type { Dictionary } from '@/i18n/dictionaries'
import { TerminalDemo } from '../graphics/terminal-demo'
import { Reveal } from '../reveal'
import { Feature, Section, SectionHeading } from '../ui/section'
import { CpuIcon, LoopIcon, PlayIcon, ShieldIcon } from '../ui/icons'

const ICONS = [LoopIcon, ShieldIcon, CpuIcon, PlayIcon]

export function Runner({ dict }: { dict: Dictionary }) {
  const t = dict.runner
  return (
    <Section id="runner" className="border-y border-border bg-surface/40">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
        <Reveal className="order-2 lg:order-1">
          <TerminalDemo title={t.terminalTitle} />
        </Reveal>
        <div className="order-1 lg:order-2">
          <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} align="left" />
          <ul className="grid gap-6 sm:grid-cols-2">
            {t.points.map((point, i) => {
              const Icon = ICONS[i]
              return (
                <Reveal as="li" key={point.title} delay={i * 0.05}>
                  <Feature icon={<Icon />} title={point.title} body={point.body} />
                </Reveal>
              )
            })}
          </ul>
        </div>
      </div>
    </Section>
  )
}
