'use client'

import { useCallback, useState } from 'react'
import NextLink from 'next/link'
import { Button } from '@heroui/react'
import { ago, repoName, useApi, type Project, type Run } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { OutcomeBadge } from '@/components/ui/status'
import { LoopPips } from '@/components/loops/loop-pips'
import { ConnectDialog } from '@/components/projects/connect-dialog'
import { ChevronRightIcon, FolderIcon, GithubIcon, PlusIcon } from '@/components/ui/icons'

function nextStep(project: Project, lastRun: Run | undefined): string {
  if (!project.latest_plan) return 'Describe the idea'
  if (!project.approved_plan) return 'Review the plan'
  if (!lastRun) return 'Start the first build'
  if (lastRun.outcome === 'running') return 'Watch the build'
  return 'Open project'
}

export default function ProjectsPage() {
  const api = useApi()
  const load = useCallback(
    () =>
      Promise.all([api<{ projects: Project[] }>('/api/projects'), api<{ runs: Run[] }>('/api/runs?limit=200')]).then(
        ([p, r]) => ({ projects: p.projects, runs: r.runs }),
      ),
    [api],
  )
  const { data, error, reload } = useData(load, { intervalMs: 15_000 })
  const [connecting, setConnecting] = useState(false)

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is one GitHub repository, planned here and built by your runners."
        actions={
          <Button variant="primary" size="sm" onPress={() => setConnecting(true)}>
            <PlusIcon className="size-4" /> Connect repository
          </Button>
        }
      />
      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : data.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderIcon />}
            title="No projects yet"
            action={<Button variant="primary" size="sm" onPress={() => setConnecting(true)}><GithubIcon className="size-4" /> Connect a repository</Button>}
          >
            Connect a GitHub repository, describe what to build, and approve the plan the AI writes.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((project) => {
            const runs = data.runs.filter((r) => r.project_slug === project.slug)
            const last = runs[0]
            return (
              <NextLink
                key={project.id}
                href={`/projects/${project.id}`}
                className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_6px_20px_rgb(0_0_0/0.06)]"
              >
                <div className="flex items-center gap-2 text-sm text-muted">
                  <GithubIcon className="size-4" />
                  {project.slug.split('__')[0]}
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight">{repoName(project.slug).split('/')[1]}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.approved_plan ? (
                    <Badge tone="success">Plan v{project.approved_plan}</Badge>
                  ) : project.latest_plan ? (
                    <Badge tone="warning" dot>Plan in draft</Badge>
                  ) : (
                    <Badge>No plan yet</Badge>
                  )}
                  {project.integration_revoked && <Badge tone="danger">Disconnected</Badge>}
                </div>
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-separator pt-4 text-sm">
                  {last ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <OutcomeBadge outcome={last.outcome} />
                      <span className="truncate text-xs text-muted">{ago(last.started_at)}</span>
                    </div>
                  ) : (
                    <span className="text-muted">No runs yet</span>
                  )}
                  {last && <LoopPips ran={last.gate_tiers ?? []} failed={last.failed_tier} />}
                </div>
                <div className="mt-3 flex items-center gap-1 text-sm font-medium text-accent">
                  {nextStep(project, last)}
                  <ChevronRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </NextLink>
            )
          })}
        </div>
      )}
      <ConnectDialog isOpen={connecting} onOpenChange={setConnecting} onConnected={reload} />
    </>
  )
}
