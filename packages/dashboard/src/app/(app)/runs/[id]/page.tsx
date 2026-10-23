'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import NextLink from 'next/link'
import { Button } from '@heroui/react'
import { ago, duration, money, repoName, useApi, type RunDetail, type RunnerState } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, CardHeader, KeyValues, Mono, Notice, PageHeader, Skeleton, cx } from '@/components/ui/primitives'
import { OutcomeBadge, PrBadge } from '@/components/ui/status'
import { LogView } from '@/components/runs/log-view'
import { useLiveLogs } from '@/components/live-logs'
import { TIERS } from '@/components/loops/tiers'
import { BranchIcon, CheckIcon, ExternalIcon, LoopIcon, ShieldIcon, SparklesIcon, StopIcon, TerminalIcon, XIcon } from '@/components/ui/icons'
import { FindingsList } from '@/components/runs/findings'

/**
 * One run. The PR body links here, so this is the page a reviewer lands on
 * from GitHub: what it did, what it cost, which loops it passed, and — while it
 * is still going — its live output.
 */
export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const load = useCallback(() => api<{ run: RunDetail; live: RunnerState | null }>(`/api/runs/${encodeURIComponent(id)}`), [api, id])
  const { data, error } = useData(load, { intervalMs: 5000 })

  if (error && !data) return <p className="text-sm text-danger" role="alert">{error}</p>
  if (!data) return <Skeleton className="h-96" />
  const { run, live } = data
  // `live` is set only while this run is the one its runner is on. A record
  // left at "running" by a killed process must not stop, or stream, whatever
  // that runner is doing now.
  const running = Boolean(live)
  const orphaned = run.outcome === 'running' && !live

  return (
    <>
      <PageHeader
        eyebrow={
          <NextLink href="/runs" className="hover:text-foreground">
            Runs
          </NextLink>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {repoName(run.project_slug)}
            <OutcomeBadge outcome={run.outcome} />
          </span>
        }
        description={
          run.branch ? (
            <span className="inline-flex items-center gap-1.5">
              <BranchIcon className="size-3.5" />
              <Mono>{run.branch}</Mono>
            </span>
          ) : undefined
        }
        actions={
          <>
            {running && <StopButton runnerId={run.runner_id} />}
            {run.pr_url && (
              <a
                href={run.pr_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-secondary"
              >
                Pull request #{run.pr_url.split('/').pop()}
                <PrBadge state={run.pr_state} />
                <ExternalIcon className="size-3.5 text-muted" />
              </a>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Card>
          <KeyValues
            items={[
              ['Started', ago(run.started_at)],
              ['Duration', duration(run.started_at, run.finished_at)],
              ['Iterations', String(live?.iteration ?? run.iterations)],
              ['Commits', String(run.commits)],
              ['Cost', money(live?.costUsd ?? run.cost_usd)],
              ['Runner', run.runner_name ?? run.runner_id],
              ['Stopped at', run.failed_tier ?? '—'],
              ['Job', run.job_id ?? 'started by hand'],
            ]}
          />
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader icon={<LoopIcon />} title="Feedback loops" description="The loops this run's iterations went through. Every commit passed all of them." />
            <ol className="flex flex-col gap-2">
              {TIERS.map((tier) => {
                const ran = (run.gate_tiers ?? []).includes(tier.id)
                const failed = run.failed_tier === tier.id
                const Icon = tier.icon
                return (
                  <li key={tier.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1 text-sm font-medium">{tier.label}</span>
                    {failed ? (
                      <Badge tone="danger"><XIcon className="size-3" /> Stopped the run</Badge>
                    ) : ran ? (
                      <Badge tone="success"><CheckIcon className="size-3" /> Passed</Badge>
                    ) : (
                      <Badge>Not run</Badge>
                    )}
                  </li>
                )
              })}
            </ol>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader icon={<SparklesIcon />} title="Agents" description="Who did what in this run." />
            {run.agents && Object.keys(run.agents).length > 0 ? (
              <ul className="flex flex-col gap-3">
                {(['plan', 'build', 'review', 'audit'] as const).map((role) => {
                  const spec = run.agents?.[role]
                  return (
                    <li key={role} className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize text-muted">{role}</span>
                      {spec ? (
                        <span className="font-medium">
                          {spec.backend}
                          {spec.model && <span className="text-muted"> · {spec.model}</span>}
                        </span>
                      ) : (
                        <span className="text-muted">off</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not recorded for this run.</p>
            )}
          </Card>
        </div>

        {orphaned && (
          <Notice tone="warning">
            This run stopped reporting before it finished. Its runner went offline or moved on to other work, so its outcome was never recorded.
          </Notice>
        )}

        {Boolean(run.audit_findings || run.design_findings?.length) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {run.audit_findings && (
              <Card>
                <CardHeader
                  icon={<ShieldIcon />}
                  title="Security audit"
                  description="The whole repository, read once the plan was done. Advisory: decide before merging."
                  actions={run.audit_findings.length === 0 ? <Badge tone="success">Nothing found</Badge> : <Badge tone="warning">{run.audit_findings.length}</Badge>}
                />
                {run.audit_findings.length > 0 && <FindingsList findings={run.audit_findings} />}
              </Card>
            )}
            {run.design_findings && run.design_findings.length > 0 && (
              <Card>
                <CardHeader icon={<SparklesIcon />} title="Design review" description="From the screenshots of every public screen. Advisory — the gate never fails on pixels." />
                <FindingsList findings={run.design_findings} />
              </Card>
            )}
          </div>
        )}

        {(run.commit_subjects?.length ?? 0) > 0 && (
          <Card>
            <CardHeader icon={<BranchIcon />} title="Commits" description="Newest first. Each completed task is one feat: commit." />
            <ul className="flex flex-col gap-1.5">
              {run.commit_subjects?.map((subject, i) => (
                <li key={i} className={cx('truncate text-sm', subject.startsWith('chore:') && 'text-muted')}>
                  <Mono>{subject}</Mono>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {running && <LiveOutput runnerId={run.runner_id} />}
      </div>
    </>
  )
}

function StopButton({ runnerId }: { runnerId: string }) {
  const api = useApi()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const stop = async () => {
    setState('sending')
    try {
      await api(`/api/runners/${runnerId}/command`, { method: 'POST', body: JSON.stringify({ command: 'stop' }) })
      setState('sent')
    } catch {
      setState('failed')
    }
  }
  return (
    <Button variant="danger-soft" size="sm" onPress={() => void stop()} isDisabled={state === 'sending' || state === 'sent'}>
      <StopIcon className="size-3.5" />
      {state === 'sent' ? 'Stopping after this iteration' : state === 'failed' ? 'Could not reach the runner — try again' : 'Stop after this iteration'}
    </Button>
  )
}

function LiveOutput({ runnerId }: { runnerId: string }) {
  const logs = useLiveLogs(runnerId)
  const { start, stop } = logs
  useEffect(() => {
    void start()
    return () => stop()
  }, [start, stop])
  return (
    <Card>
      <CardHeader
        icon={<TerminalIcon />}
        title="Live output"
        actions={<span className={cx('inline-flex items-center gap-1.5 text-xs text-muted')}><span className="size-1.5 rounded-full bg-success animate-pulse-ring" /> streaming</span>}
      />
      <LogView lines={logs.lines} testId="run-log" />
    </Card>
  )
}
