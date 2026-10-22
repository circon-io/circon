import { Badge, type Tone } from './primitives'

/**
 * What a run's outcome means, in words and color. One table, so the overview,
 * the run list and the run page can never disagree.
 */
const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'accent' },
  complete: { label: 'Complete', tone: 'success' },
  limit: { label: 'Iteration limit', tone: 'success' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  budget: { label: 'Budget reached', tone: 'warning' },
  'usage-limit': { label: 'Usage limit', tone: 'warning' },
  'no-commits': { label: 'No changes', tone: 'neutral' },
  infrastructure: { label: 'Infrastructure', tone: 'warning' },
  stuck: { label: 'Stuck', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  aborted: { label: 'Aborted', tone: 'danger' },
}

export function outcomeOf(outcome: string | null | undefined) {
  return OUTCOMES[outcome ?? 'running'] ?? { label: outcome ?? 'Unknown', tone: 'neutral' as Tone }
}

export function OutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  const o = outcomeOf(outcome)
  return (
    <Badge tone={o.tone} dot pulse={outcome === 'running'}>
      {o.label}
    </Badge>
  )
}

const RUNNER: Record<string, { label: string; tone: Tone }> = {
  running: { label: 'Building', tone: 'accent' },
  idle: { label: 'Idle', tone: 'success' },
  offline: { label: 'Offline', tone: 'neutral' },
}

export function RunnerBadge({ status }: { status: string | undefined }) {
  const r = RUNNER[status ?? 'offline'] ?? { label: status ?? 'Unknown', tone: 'neutral' as Tone }
  return (
    <Badge tone={r.tone} dot pulse={status === 'running'}>
      {r.label}
    </Badge>
  )
}

export function PrBadge({ state }: { state: string | null }) {
  if (!state) return null
  const tone: Tone = state === 'merged' ? 'accent' : state === 'open' ? 'success' : 'neutral'
  return <Badge tone={tone}>{state[0]?.toUpperCase() + state.slice(1)}</Badge>
}
