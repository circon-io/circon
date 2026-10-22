'use client'

import { useCallback, useEffect } from 'react'
import NextLink from 'next/link'
import {
  ago, money, percent, repoName, useApi,
  type Digest, type Overview, type Project, type Run, type Runner, type SecretRequest,
} from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, CardHeader, EmptyState, Mono, PageHeader, Skeleton, Stat } from '@/components/ui/primitives'
import { RunnerBadge } from '@/components/ui/status'
import { RunTable } from '@/components/runs/run-table'
import { Onboarding } from '@/components/onboarding'
import {
  BranchIcon, CheckIcon, ChevronRightIcon, DollarIcon, InboxIcon, KeyIcon, PlayIcon, PullRequestIcon, ServerIcon, SparklesIcon,
} from '@/components/ui/icons'

interface Live {
  overview: Overview
  runners: Runner[]
}

interface Lists {
  runs: Run[]
  projects: Project[]
  integrations: number
  requests: SecretRequest[]
  digest: Digest
}

type Everything = Live & Lists

export default function OverviewPage() {
  const api = useApi()
  // What moves by the second polls fast; the lists poll slowly, and reload as
  // soon as a live count says they changed.
  const loadLive = useCallback(
    () =>
      Promise.all([api<Overview>('/api/overview'), api<{ runners: Runner[] }>('/api/runners')]).then(([overview, r]) => ({
        overview,
        runners: r.runners,
      })),
    [api],
  )
  const loadLists = useCallback(
    () =>
      Promise.all([
        api<{ runs: Run[] }>('/api/runs?limit=8'),
        api<{ projects: Project[] }>('/api/projects'),
        api<{ integrations: Array<{ revoked_at: string | null }> }>('/api/integrations'),
        api<{ requests: SecretRequest[] }>('/api/requests?status=pending'),
        api<Digest>('/api/digest?hours=24'),
      ]).then(([runs, p, i, q, digest]) => ({
        runs: runs.runs,
        projects: p.projects,
        integrations: i.integrations.filter((x) => !x.revoked_at).length,
        requests: q.requests,
        digest,
      })),
    [api],
  )
  const live = useData<Live>(loadLive, { intervalMs: 5_000 })
  const lists = useData<Lists>(loadLists, { intervalMs: 30_000 })

  const o = live.data?.overview
  const signature = o ? `${o.running}/${o.runsLast7d}/${o.pendingRequests}/${o.plansAwaitingApproval}` : null
  const { reload: reloadLists } = lists
  useEffect(() => {
    if (signature) reloadLists()
  }, [signature, reloadLists])

  const error = live.error ?? lists.error
  const data: Everything | null = live.data && lists.data ? { ...live.data, ...lists.data } : null

  return (
    <>
      <PageHeader title="Overview" description="What your runners are building, and what is waiting on you." />
      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}
      {!data ? <OverviewSkeleton /> : <OverviewBody data={data} />}
    </>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

function OverviewBody({ data }: { data: Everything }) {
  const { overview, runners, runs, projects, requests } = data
  const online = runners.filter((r) => r.state?.status !== 'offline').length
  const building = runners.filter((r) => r.state?.status === 'running')
  const draftPlans = projects.filter((p) => p.latest_plan && !p.approved_plan)
  const waiting = overview.pendingRequests + overview.plansAwaitingApproval

  return (
    <div className="flex flex-col gap-6">
      <Onboarding integrations={data.integrations} projects={projects} runners={runners} runs={runs} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Building now" value={overview.running} hint={`${online} of ${runners.length} runners online`} icon={<PlayIcon />} tone="accent" href="/runners" />
        <Stat label="Runs this week" value={overview.runsLast7d} hint={`${percent(overview.successRate7d)} finished cleanly`} icon={<SparklesIcon />} href="/runs" />
        <Stat label="Spent, last 24 hours" value={money(overview.spentLast24h)} hint={`${money(overview.spentLast30d)} over 30 days`} icon={<DollarIcon />} />
        <Stat label="Waiting on you" value={waiting} hint={waiting ? 'requests and plans to approve' : 'nothing — all clear'} icon={<InboxIcon />} tone={waiting ? 'warning' : 'default'} href="/requests" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Live" description="Runs in progress right now." />
            {building.length === 0 ? (
              <EmptyState compact icon={<ServerIcon />} title="Nothing is building">
                Start a build from a project with an approved plan.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {building.map((runner) => (
                  <li key={runner.id}>
                    <NextLink
                      href={runner.state.runId ? `/runs/${runner.state.runId}` : '/runners'}
                      className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:border-accent/40 hover:bg-accent-soft/20"
                    >
                      <RunnerBadge status="running" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{repoName(runner.state.project ?? '')}</div>
                        <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                          <BranchIcon className="size-3" />
                          <Mono>{(runner.state.branch ?? '').replace('circon/', '')}</Mono>
                          <span>· on {runner.name}</span>
                        </div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div>Iteration {runner.state.iteration ?? '—'}</div>
                        <div className="text-xs text-muted">{money(runner.state.costUsd)}</div>
                      </div>
                      <ChevronRightIcon className="size-4 text-muted" />
                    </NextLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <DigestCard digest={data.digest} />

          <Card>
            <CardHeader
              title="Recent runs"
              actions={
                <NextLink href="/runs" className="text-sm text-muted hover:text-foreground">
                  View all
                </NextLink>
              }
            />
            <RunTable runs={runs} compact />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Needs you" description="The agent cannot go on without these." />
            {requests.length === 0 && draftPlans.length === 0 ? (
              <EmptyState compact icon={<InboxIcon />} title="All clear" />
            ) : (
              <ul className="flex flex-col divide-y divide-separator">
                {requests.map((r) => (
                  <li key={r.id}>
                    <NextLink href="/requests" className="flex items-start gap-3 py-3 first:pt-0 hover:opacity-80">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning-soft-foreground">
                        <KeyIcon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <Mono className="block truncate text-sm font-medium">{r.name}</Mono>
                        <div className="truncate text-xs text-muted">{repoName(r.project_slug)} · {ago(r.created_at)}</div>
                      </div>
                    </NextLink>
                  </li>
                ))}
                {draftPlans.map((p) => (
                  <li key={p.id}>
                    <NextLink href={`/projects/${p.id}?tab=plan`} className="flex items-start gap-3 py-3 hover:opacity-80">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                        <SparklesIcon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">Approve the plan</div>
                        <div className="truncate text-xs text-muted">{repoName(p.slug)} · v{p.latest_plan} in draft</div>
                      </div>
                    </NextLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Runners"
              actions={
                <NextLink href="/runners" className="text-sm text-muted hover:text-foreground">
                  Manage
                </NextLink>
              }
            />
            {runners.length === 0 ? (
              <EmptyState compact icon={<ServerIcon />} title="No runners yet" />
            ) : (
              <ul className="flex flex-col gap-3">
                {runners.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted">
                        {r.state?.status === 'offline' ? `last seen ${ago(r.last_seen_at ?? r.state?.lastSeenAt)}` : (r.platform?.startsWith('darwin') ? 'macOS' : 'Linux')}
                      </div>
                    </div>
                    <RunnerBadge status={r.state?.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/** The daily report: what got built in the last day, across every runner. */
function DigestCard({ digest }: { digest: Digest }) {
  const { totals, projects } = digest
  return (
    <Card>
      <CardHeader
        title="Last 24 hours"
        description={
          totals.runs
            ? `${totals.built} ${totals.built === 1 ? 'task' : 'tasks'} built in ${totals.runs} ${totals.runs === 1 ? 'run' : 'runs'} · ${money(totals.costUsd)}`
            : 'What the runners built, across every machine.'
        }
      />
      {projects.length === 0 ? (
        <EmptyState compact icon={<SparklesIcon />} title="Nothing was built today">
          Runs show up here with the tasks they completed.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {projects.map((p) => (
            <li key={p.slug} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">{repoName(p.slug)}</span>
                <span className="text-xs text-muted tabular-nums">
                  {p.runs} {p.runs === 1 ? 'run' : 'runs'} · {money(p.costUsd)}
                </span>
              </div>
              {p.built.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {p.built.map((task) => (
                    <li key={task} className="flex items-start gap-2 text-sm">
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
                      <span className="min-w-0">{task}</span>
                    </li>
                  ))}
                  {p.moreBuilt > 0 && <li className="pl-5.5 text-xs text-muted">and {p.moreBuilt} more</li>}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-muted">No task completed{p.outcomes['running'] ? ' yet — a run is still going' : ''}.</p>
              )}
              {p.pullRequests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {p.pullRequests.map((pr) => (
                    <a key={pr.url} href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                      <PullRequestIcon className="size-3.5" />
                      #{pr.url.split('/').pop()} {pr.state ?? ''}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
