import type { Dictionary } from '@/i18n/dictionaries'
import { Reveal } from '../reveal'

export function Stats({ dict }: { dict: Dictionary }) {
  return (
    <div className="border-y border-border bg-surface/50">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
        {dict.stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 0.06} className="border-border py-8 text-center max-md:[&:nth-child(-n+2)]:border-b md:border-l md:first:border-l-0">
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span className="block text-4xl font-semibold tracking-tight tabular-nums">{stat.value}</span>
              <span className="mt-1 block text-sm text-muted">{stat.label}</span>
            </dd>
          </Reveal>
        ))}
      </dl>
    </div>
  )
}
