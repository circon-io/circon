'use client'

import { Chip, Link } from '@heroui/react'
import { ago, money, type Run } from '@/lib/api'

const OUTCOME_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'accent' | 'default'> = {
  complete: 'success',
  failed: 'danger',
  budget: 'warning',
  stopped: 'default',
  running: 'accent',
}

/**
 * A plain table rather than HeroUI's collection component: this is a flat list
 * with no selection, sorting or virtualisation, and the collection API buys
 * nothing for it.
 */
export function RunsTable({ runs }: { runs: Run[] }) {
  if (runs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-default-300 p-8 text-center text-default-500">
        No runs recorded yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-default-200">
      <table className="w-full text-sm" data-testid="runs-table">
        <thead className="bg-default-100 text-left text-xs uppercase text-default-500">
          <tr>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium">Outcome</th>
            <th className="px-3 py-2 font-medium">Commits</th>
            <th className="px-3 py-2 font-medium">Cost</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Review</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t border-default-200">
              <td className="px-3 py-2">{run.project_slug}</td>
              <td className="px-3 py-2">
                <Chip size="sm" color={OUTCOME_COLOR[run.outcome ?? 'running'] ?? 'default'}>
                  {run.outcome ?? 'running'}
                </Chip>
              </td>
              <td className="px-3 py-2">{run.commits}</td>
              <td className="px-3 py-2">{money(run.cost_usd)}</td>
              <td className="px-3 py-2">{ago(run.started_at)}</td>
              <td className="px-3 py-2">
                {run.pr_url ? (
                  <Link href={run.pr_url} target="_blank" rel="noreferrer">
                    PR
                  </Link>
                ) : run.failed_tier ? (
                  <span className="text-default-400">failed: {run.failed_tier}</span>
                ) : (
                  <span className="text-default-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
