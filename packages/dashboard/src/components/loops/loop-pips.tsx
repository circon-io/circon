import { cx } from '../ui/primitives'
import { TIERS } from './tiers'

/**
 * A run's feedback loops at a glance: one pip per tier, filled when it ran and
 * passed, red where it stopped the run, hollow when the run never reached it
 * or the project does not have it.
 */
export function LoopPips({ ran, failed, size = 'sm' }: { ran: string[]; failed: string | null; size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Feedback loops: ${ran.length ? ran.join(', ') : 'none ran'}`}>
      {TIERS.map((tier) => {
        const state = tier.id === failed ? 'failed' : ran.includes(tier.id) ? 'passed' : 'idle'
        return (
          <span
            key={tier.id}
            title={`${tier.label}: ${state === 'idle' ? 'not run' : state}`}
            className={cx(
              'rounded-full',
              size === 'sm' ? 'h-1.5 w-4' : 'h-2 w-7',
              state === 'passed' && 'bg-success',
              state === 'failed' && 'bg-danger',
              state === 'idle' && 'bg-surface-tertiary',
            )}
          />
        )
      })}
    </div>
  )
}
