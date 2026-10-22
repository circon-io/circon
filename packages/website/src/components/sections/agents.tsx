import type { Dictionary } from '@/i18n/dictionaries'
import { AgentsDiagram } from '../graphics/agents-diagram'
import { Reveal } from '../reveal'
import { Feature, Section, SectionHeading } from '../ui/section'
import { ClockIcon, CpuIcon, KeyIcon } from '../ui/icons'

const ICONS = [KeyIcon, ClockIcon, CpuIcon]

export function Agents({ dict }: { dict: Dictionary }) {
  const t = dict.agents
  return (
    <Section id="agents">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} align="left" />
          <ul className="space-y-6">
            {t.points.map((point, i) => {
              const Icon = ICONS[i]
              return (
                <Reveal as="li" key={point.title} delay={i * 0.06}>
                  <Feature icon={<Icon />} title={point.title} body={point.body} />
                </Reveal>
              )
            })}
          </ul>
        </div>
        <Reveal delay={0.1}>
          <AgentsDiagram t={t} />
          {/* The roles, as text, for everyone the diagram does not reach. */}
          <ul className="sr-only">
            {t.roles.map((role) => (
              <li key={role.title}>
                {role.title}: {role.body}
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {t.roles.map((role) => (
              <p key={role.title} className="text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-foreground">{role.title}.</span> {role.body}
              </p>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
