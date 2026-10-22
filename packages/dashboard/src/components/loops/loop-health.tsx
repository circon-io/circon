import type { Run } from '@/lib/api'
import { EmptyState, cx } from '../ui/primitives'
import { TIERS } from './tiers'

/**
 * How each feedback loop has been doing across recent runs: one row per loop,
 * one square per run, newest on the right. A loop that keeps stopping runs is
 * where to look first.
 */
export function LoopHealth({ runs }: { runs: Run[] }) {
  const recent = runs.filter((r) => r.outcome !== 'running').slice(0, 12).reverse()
  if (recent.length === 0) {
    return <EmptyState compact title="No finished runs yet">Each run&apos;s loops show up here once it finishes.</EmptyState>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {TIERS.map((tier) => {
        const Icon = tier.icon
        const results = recent.map((r) => (r.failed_tier === tier.id ? 'failed' : (r.gate_tiers ?? []).includes(tier.id) ? 'passed' : 'idle'))
        const ran = results.filter((s) => s !== 'idle').length
        const failed = results.filter((s) => s === 'failed').length
        return (
          <div key={tier.id} className="flex items-center gap-3">
            <Icon className="size-4 shrink-0 text-muted" />
            <span className="w-20 shrink-0 text-sm font-medium">{tier.label}</span>
            <div className="flex flex-1 justify-end gap-1">
              {results.map((state, i) => (
                <span
                  key={i}
                  title={state === 'idle' ? 'not run' : state}
                  className={cx('size-4 shrink-0 rounded-[4px] sm:size-5', state === 'passed' && 'bg-success/80', state === 'failed' && 'bg-danger', state === 'idle' && 'bg-surface-tertiary')}
                />
              ))}
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-muted">
              {ran === 0 ? 'not set up' : failed ? `${failed} of ${ran} failed` : `${ran} passed`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
