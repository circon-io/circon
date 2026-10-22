'use client'

import { useRouter } from 'next/navigation'
import { ago, duration, money, repoName, type Run } from '@/lib/api'
import { EmptyState, Mono } from '../ui/primitives'
import { OutcomeBadge, PrBadge } from '../ui/status'
import { LoopPips } from '../loops/loop-pips'
import { BranchIcon, PlayIcon } from '../ui/icons'

/**
 * Runs, newest first. A row opens the run; the pips show which feedback loops
 * it exercised and where it stopped, so a failing project stands out in a list.
 */
export function RunTable({
  runs,
  showProject = true,
  compact = false,
  empty,
}: {
  runs: Run[]
  showProject?: boolean
  /** For narrow cards: drops commits and the review column. */
  compact?: boolean
  empty?: React.ReactNode
}) {
  const router = useRouter()
  if (runs.length === 0) {
    return empty ?? <EmptyState compact icon={<PlayIcon />} title="No runs yet">Queue a build from a project once its plan is approved.</EmptyState>
  }

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className={compact ? 'w-full min-w-[520px] text-sm' : 'w-full min-w-[720px] text-sm'}>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="px-5 pb-2 font-medium">Status</th>
            {showProject && <th className="px-3 pb-2 font-medium">Project</th>}
            <th className="px-3 pb-2 font-medium">Feedback loops</th>
            {!compact && <th className="px-3 pb-2 text-right font-medium">Commits</th>}
            <th className="px-3 pb-2 text-right font-medium">Cost</th>
            <th className="px-3 pb-2 font-medium">Started</th>
            {!compact && <th className="px-5 pb-2 font-medium">Review</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              onClick={() => router.push(`/runs/${run.id}`)}
              className="cursor-pointer border-t border-separator transition-colors hover:bg-surface-secondary/60"
              data-testid={`run-${run.id}`}
            >
              <td className="px-5 py-3">
                <OutcomeBadge outcome={run.outcome} />
              </td>
              {showProject && (
                <td className="px-3 py-3">
                  <div className="font-medium">{repoName(run.project_slug)}</div>
                  {run.branch && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      <BranchIcon className="size-3" />
                      <Mono className="truncate">{run.branch.replace('circon/', '')}</Mono>
                    </div>
                  )}
                </td>
              )}
              <td className="px-3 py-3">
                <LoopPips ran={run.gate_tiers ?? []} failed={run.failed_tier} />
              </td>
              {!compact && <td className="px-3 py-3 text-right tabular-nums">{run.commits}</td>}
              <td className="px-3 py-3 text-right tabular-nums">{money(run.cost_usd)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">
                <div>{ago(run.started_at)}</div>
                <div className="text-xs">took {duration(run.started_at, run.finished_at)}</div>
              </td>
              {!compact && <td className="whitespace-nowrap px-5 py-3" onClick={(e) => e.stopPropagation()}>
                {run.pr_url ? (
                  <a href={run.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                    <span className="text-muted">#{run.pr_url.split('/').pop()}</span>
                    <PrBadge state={run.pr_state} />
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
