'use client'

import { useCallback, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import NextLink from 'next/link'
import { Button } from '@heroui/react'
import { ago, repoName, useApi, type Project, type Run, type Runner, type SecretRequest } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, CardHeader, EmptyState, Field, Mono, Notice, PageHeader, Skeleton, TabBar, inputClass } from '@/components/ui/primitives'
import { RunTable } from '@/components/runs/run-table'
import { PlanPanel } from '@/components/plan/plan-panel'
import { ReleasePanel } from '@/components/release/release-panel'
import { SecretsList } from '@/components/secrets/secrets-list'
import { ConfigForm } from '@/components/config/config-form'
import { LoopHealth } from '@/components/loops/loop-health'
import { ExternalIcon, GithubIcon, KeyIcon, LoopIcon, PlayIcon, RocketIcon, SparklesIcon } from '@/components/ui/icons'

const TAB_IDS = ['overview', 'plan', 'runs', 'loops', 'releases', 'secrets', 'settings'] as const
type Tab = (typeof TAB_IDS)[number]

interface Data {
  project: Project | null
  runs: Run[]
  runners: Runner[]
  requests: SecretRequest[]
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const api = useApi()
  const tab = (TAB_IDS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'overview'
  const setTab = (next: Tab) => router.replace(`/projects/${id}${next === 'overview' ? '' : `?tab=${next}`}`, { scroll: false })

  const load = useCallback(
    () =>
      Promise.all([
        api<{ projects: Project[] }>('/api/projects'),
        api<{ runners: Runner[] }>('/api/runners'),
        api<{ requests: SecretRequest[] }>('/api/requests?status=pending'),
      ]).then(async ([p, r, q]) => {
        const project = p.projects.find((x) => x.id === id) ?? null
        const runs = project ? (await api<{ runs: Run[] }>(`/api/runs?limit=50&project=${encodeURIComponent(project.slug)}`)).runs : []
        return { project, runs, runners: r.runners, requests: q.requests.filter((x) => x.project_id === id) }
      }),
    [api, id],
  )
  const { data, error, reload } = useData<Data>(load, { intervalMs: 10_000 })

  if (error && !data) return <Notice tone="danger">{error}</Notice>
  if (!data) return <Skeleton className="h-96" />
  if (!data.project) return <EmptyState title="No such project" action={<NextLink href="/projects" className="text-sm text-accent">All projects</NextLink>} />
  const { project, runs, runners, requests } = data
  const [owner, repo] = project.slug.split('__')

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <NextLink href="/projects" className="hover:text-foreground">Projects</NextLink>
            <span>/</span>
            <GithubIcon className="size-3.5" /> {owner}
          </span>
        }
        title={repo}
        actions={
          <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-secondary">
            <GithubIcon className="size-4" /> Repository <ExternalIcon className="size-3 text-muted" />
          </a>
        }
      />
      <div className="mb-6">
        <TabBar
          label="Project"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'plan', label: 'Plan', badge: project.latest_plan && !project.approved_plan ? 1 : undefined },
            { id: 'runs', label: 'Runs' },
            { id: 'loops', label: 'Feedback loops' },
            { id: 'releases', label: 'Releases' },
            { id: 'secrets', label: 'Secrets', badge: requests.length || undefined },
            { id: 'settings', label: 'Settings' },
          ]}
        />
      </div>

      {tab === 'overview' && <OverviewTab project={project} runs={runs} runners={runners} requests={requests} onChanged={reload} goTo={setTab} />}
      {tab === 'plan' && <PlanPanel project={project} onChanged={reload} />}
      {tab === 'runs' && (
        <Card>
          <RunTable runs={runs} showProject={false} />
        </Card>
      )}
      {tab === 'loops' && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={<LoopIcon />} title="Loop health" description="The last runs, oldest on the left. Each square is one run's result for that loop." />
            <LoopHealth runs={runs} />
          </Card>
          <ConfigForm endpoint={`/api/projects/${project.id}/config`} sections={['loops']} inheritsFrom="runner or org" />
        </div>
      )}
      {tab === 'releases' && <ReleasePanel projectId={project.id} />}
      {tab === 'secrets' && (
        <div className="flex flex-col gap-6">
          {requests.length > 0 && (
            <Notice tone="warning">
              The agent is waiting for {requests.map((r) => r.name).join(', ')}. <NextLink href="/requests" className="font-medium underline">Answer in Requests</NextLink>
            </Notice>
          )}
          <Card>
            <CardHeader icon={<KeyIcon />} title="Project secrets" description="Given to a runner only for this project's jobs, and only while the job runs: deploy tokens, Clerk and Sentry keys, Codemagic credentials." />
            <SecretsList scope="project" projectId={project.id} />
          </Card>
        </div>
      )}
      {tab === 'settings' && <SettingsTab project={project} />}
    </>
  )
}

function OverviewTab({
  project, runs, runners, requests, onChanged, goTo,
}: { project: Project; runs: Run[]; runners: Runner[]; requests: SecretRequest[]; onChanged: () => void; goTo: (tab: Tab) => void }) {
  const api = useApi()
  const [runnerId, setRunnerId] = useState('')
  const [loops, setLoops] = useState('20')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const running = runs.find((r) => r.outcome === 'running')

  const build = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify({ projectSlug: project.slug, maxLoops: Number(loops) || 20, ...(runnerId ? { runnerId } : {}) }) })
      setMessage({ tone: 'success', text: runnerId ? 'Queued for that runner.' : 'Queued. The next idle runner picks it up.' })
      onChanged()
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not queue the build' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {!project.approved_plan ? (
          <Card>
            <EmptyState
              icon={<SparklesIcon />}
              title={project.latest_plan ? 'Review and approve the plan' : 'Start with the plan'}
              action={<Button variant="primary" size="sm" onPress={() => goTo('plan')}>{project.latest_plan ? 'Review the plan' : 'Describe the idea'}</Button>}
            >
              {project.latest_plan
                ? `Version ${project.latest_plan} is waiting. Once approved, runners can build it.`
                : 'Describe what to build and the AI writes the plan. Nothing is built until you approve one.'}
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <CardHeader
              icon={<PlayIcon />}
              title={running ? 'Building now' : 'Start a build'}
              description={running ? undefined : `Works through plan v${project.approved_plan}, one task per iteration, committing only what passes the feedback loops.`}
            />
            {running ? (
              <NextLink href={`/runs/${running.id}`} className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent-soft/30 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">Iteration {running.iterations + 1}</span>
                  <span className="text-muted"> · {running.commits} commits · started {ago(running.started_at)}</span>
                </span>
                <span className="font-medium text-accent">Watch →</span>
              </NextLink>
            ) : (
              <form className="grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void build() }}>
                <Field label="Runner" htmlFor="build-runner">
                  <select id="build-runner" className={inputClass} value={runnerId} onChange={(e) => setRunnerId(e.target.value)}>
                    <option value="">Any idle runner</option>
                    {runners.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.state?.status ?? 'offline'})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Max iterations" htmlFor="build-loops">
                  <input id="build-loops" type="number" min={1} max={200} className={inputClass} value={loops} onChange={(e) => setLoops(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" isDisabled={busy} data-testid="start-build">
                  <PlayIcon className="size-4" /> Start build
                </Button>
              </form>
            )}
            {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
          </Card>
        )}

        <Card>
          <CardHeader title="Recent runs" actions={<button type="button" onClick={() => goTo('runs')} className="text-sm text-muted hover:text-foreground">View all</button>} />
          <RunTable runs={runs.slice(0, 5)} showProject={false} compact />
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Feedback loops" actions={<button type="button" onClick={() => goTo('loops')} className="text-sm text-muted hover:text-foreground">Configure</button>} />
          <LoopHealth runs={runs} />
        </Card>
        <Card>
          <CardHeader title="Status" />
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted">Plan</span>
              {project.approved_plan ? <Badge tone="success">v{project.approved_plan} approved</Badge> : project.latest_plan ? <Badge tone="warning" dot>v{project.latest_plan} draft</Badge> : <Badge>None</Badge>}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">Default branch</span>
              <Mono>{project.default_branch}</Mono>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">Waiting on you</span>
              {requests.length ? <button type="button" onClick={() => goTo('secrets')}><Badge tone="warning">{requests.length} request{requests.length === 1 ? '' : 's'}</Badge></button> : <span>Nothing</span>}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">Releases</span>
              <button type="button" onClick={() => goTo('releases')} className="inline-flex items-center gap-1 text-accent"><RocketIcon className="size-3.5" /> Report</button>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function SettingsTab({ project }: { project: Project }) {
  const api = useApi()
  const router = useRouter()
  const disconnect = async () => {
    if (!confirm(`Disconnect ${repoName(project.slug)}? Its runs are kept; plans and secrets are deleted.`)) return
    await api(`/api/projects/${project.id}`, { method: 'DELETE' })
    router.push('/projects')
  }
  return (
    <div className="flex flex-col gap-6">
      <ConfigForm endpoint={`/api/projects/${project.id}/config`} sections={['agents', 'budgets']} inheritsFrom="runner or org" />
      <Card className="border-danger/30">
        <CardHeader title="Disconnect this project" description="The repository is left untouched. Runs stay in history; the plan versions and secrets here are deleted." />
        <Button variant="danger-soft" size="sm" onPress={() => void disconnect()}>Disconnect {repoName(project.slug)}</Button>
      </Card>
    </div>
  )
}
