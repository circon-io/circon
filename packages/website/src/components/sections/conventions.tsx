import type { Dictionary } from '@/i18n/dictionaries'
import { Reveal } from '../reveal'
import { Feature, Section, SectionHeading } from '../ui/section'
import { BranchIcon, FolderIcon, GlobeIcon, LayersIcon } from '../ui/icons'

const ICONS = [GlobeIcon, LayersIcon, BranchIcon]

export function Conventions({ dict }: { dict: Dictionary }) {
  const t = dict.conventions
  const last = t.tree.length - 1
  return (
    <Section id="conventions">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} align="left" />
          <ul className="space-y-6">
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

        <Reveal delay={0.1}>
          <div className="beam-border rounded-2xl bg-surface p-5 font-mono text-[13px] shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-muted">
              <FolderIcon className="size-4" />
              <span>acme-shop/</span>
            </div>
            <ul className="space-y-1">
              {t.tree.map((entry, i) => (
                <Reveal as="li" key={entry.path} delay={0.15 + i * 0.07} className="group flex flex-wrap items-baseline gap-x-3 rounded-md px-1 py-1 transition-colors hover:bg-surface-secondary">
                  <span className="text-muted/60" aria-hidden>
                    {i === last ? '└──' : '├──'}
                  </span>
                  <span className="font-medium text-foreground">{entry.path}</span>
                  <span className="font-sans text-xs text-muted">{entry.note}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
