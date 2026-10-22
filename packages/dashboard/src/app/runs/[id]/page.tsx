'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import NextLink from 'next/link'
import { CardContent, CardHeader, CardRoot, CardTitle, Chip, Link, Spinner } from '@heroui/react'
import { AppShell } from '@/components/app-shell'
import { LogPane, useLiveLogs } from '@/components/live-logs'
import { OUTCOME_COLOR } from '@/components/runs-table'
import { ago, money, useApi, type RunDetail, type RunnerState } from '@/lib/api'

/**
 * One run: what it did, what it cost, where its PR is, and — while it is still
 * going — its live output. The PR body links here, so this is the page a
 * reviewer lands on from GitHub.
 */
export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [live, setLive] = useState<RunnerState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      api<{ run: RunDetail; live: RunnerState | null }>(`/api/runs/${encodeURIComponent(id)}`)
        .then((data) => {
          setRun(data.run)
          setLive(data.live)
          setError(null)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the run'))
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [api, id])

  const running = run?.outcome === 'running'

  return (
    <AppShell>
      <NextLink href="/" className="text-sm text-default-500 hover:text-foreground">
        ← All runs
      </NextLink>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {!run && !error && <Spinner size="sm" aria-label="Loading run" />}

      {run && (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold">{run.project_slug.replace('__', '/')}</h1>
            <Chip size="sm" color={OUTCOME_COLOR[run.outcome ?? 'running'] ?? 'default'} data-testid="run-outcome">
              {run.outcome ?? 'running'}
            </Chip>
            {run.pr_url && (
              <Link href={run.pr_url} target="_blank" rel="noreferrer" data-testid="run-pr">
                Pull request{run.pr_state ? ` (${run.pr_state})` : ''}
              </Link>
            )}
          </header>

          <CardRoot>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Fact label="Started" value={ago(run.started_at)} />
                <Fact label="Finished" value={run.finished_at ? ago(run.finished_at) : '—'} />
                <Fact label="Iterations" value={String(live?.iteration ?? run.iterations)} />
                <Fact label="Commits" value={String(run.commits)} />
                <Fact label="Cost" value={money(live?.costUsd ?? run.cost_usd)} />
                <Fact label="Runner" value={run.runner_name ?? run.runner_id} />
                <Fact label="Branch" value={run.branch ?? '—'} />
                <Fact label="Failed tier" value={run.failed_tier ?? '—'} />
              </dl>
            </CardContent>
          </CardRoot>

          {run.agents && Object.keys(run.agents).length > 0 && (
            <CardRoot>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Object.entries(run.agents).map(([role, spec]) => (
                  <Chip key={role} size="sm">
                    {role}: {spec.backend}
                    {spec.model ? ` · ${spec.model}` : ''}
                  </Chip>
                ))}
              </CardContent>
            </CardRoot>
          )}

          {running && <LiveRunLogs runnerId={run.runner_id} />}
        </>
      )}
    </AppShell>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-default-500">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function LiveRunLogs({ runnerId }: { runnerId: string }) {
  const logs = useLiveLogs(runnerId)
  const { start, stop } = logs
  useEffect(() => {
    void start()
    return () => stop()
  }, [start, stop])

  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>Live output</CardTitle>
      </CardHeader>
      <CardContent>
        <LogPane lines={logs.lines} testId="run-log" />
      </CardContent>
    </CardRoot>
  )
}
