'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import NextLink from 'next/link'
import { Button, CardContent, CardRoot, Chip, Spinner } from '@heroui/react'
import { AppShell } from '@/components/app-shell'
import { PlanPanel } from '@/components/plan-panel'
import { RunsTable } from '@/components/runs-table'
import { ConfigEditor } from '@/components/config-editor'
import { ReleasePanel } from '@/components/release-panel'
import { SecretsEditor } from '@/components/secrets-editor'
import { useApi, type Project, type Run, type RunConfig } from '@/lib/api'

type Tab = 'plan' | 'runs' | 'releases' | 'settings'

/**
 * One project: its plan, its runs, its settings. The plan comes first because
 * nothing can be built until there is an approved one.
 */
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const api = useApi()
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<Tab>('plan')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(
    () =>
      api<{ projects: Project[] }>('/api/projects')
        .then(({ projects }) => {
          const found = projects.find((p) => p.id === id) ?? null
          setProject(found)
          setError(found ? null : 'No such project.')
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the project')),
    [api, id],
  )

  useEffect(() => {
    void load()
  }, [load])

  const build = async () => {
    if (!project) return
    try {
      await api('/api/jobs', { method: 'POST', body: JSON.stringify({ projectSlug: project.slug }) })
      setNotice('Build queued. The next idle runner claims it; follow it under Runs.')
      setTab('runs')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not queue the build')
    }
  }

  return (
    <AppShell>
      <NextLink href="/" className="text-sm text-default-500 hover:text-foreground">
        ← Overview
      </NextLink>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {!project && !error && <Spinner size="sm" aria-label="Loading project" />}

      {project && (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-lg font-semibold">{project.slug.replace('__', '/')}</h1>
            <Chip size="sm" color={project.approved_plan ? 'success' : 'default'}>
              {project.approved_plan ? `plan v${project.approved_plan} approved` : 'no approved plan'}
            </Chip>
            <div className="ml-auto">
              <Button
                variant="primary"
                size="sm"
                isDisabled={!project.approved_plan}
                onClick={() => void build()}
                aria-label="Start a build"
                data-testid="start-build"
              >
                Start a build
              </Button>
            </div>
          </header>
          {notice && <p className="text-sm text-default-500" role="status">{notice}</p>}

          <nav className="flex gap-4 border-b border-default-200 text-sm" aria-label="Project">
            {(['plan', 'runs', 'releases', 'settings'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`-mb-px border-b-2 px-1 pb-2 capitalize ${
                  tab === t ? 'border-foreground font-medium' : 'border-transparent text-default-500'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <CardRoot>
            <CardContent className="py-4">
              {tab === 'plan' && <PlanPanel project={project} onChanged={() => void load()} />}
              {tab === 'runs' && <ProjectRuns slug={project.slug} />}
              {tab === 'releases' && <ReleasePanel projectId={project.id} />}
              {tab === 'settings' && <ProjectSettings projectId={project.id} />}
            </CardContent>
          </CardRoot>
        </>
      )}
    </AppShell>
  )
}

function ProjectRuns({ slug }: { slug: string }) {
  const api = useApi()
  const [runs, setRuns] = useState<Run[] | null>(null)
  useEffect(() => {
    const load = () =>
      api<{ runs: Run[] }>(`/api/runs?project=${encodeURIComponent(slug)}`)
        .then((data) => setRuns(data.runs))
        .catch(() => setRuns([]))
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [api, slug])
  return runs ? <RunsTable runs={runs} /> : <Spinner size="sm" aria-label="Loading runs" />
}

function ProjectSettings({ projectId }: { projectId: string }) {
  const api = useApi()
  const [config, setConfig] = useState<RunConfig | null>(null)
  useEffect(() => {
    api<{ config: RunConfig }>(`/api/projects/${projectId}/config`)
      .then((data) => setConfig(data.config))
      .catch(() => setConfig({}))
  }, [api, projectId])
  if (!config) return <Spinner size="sm" aria-label="Loading settings" />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-default-500">
        Settings for this project only. They override the organization defaults and each runner&apos;s own.
      </p>
      <ConfigEditor initial={config} endpoint={`/api/projects/${projectId}/config`} inheritsFrom="org or runner" />
      <h3 className="mt-4 text-sm font-medium">Secrets</h3>
      <p className="text-sm text-default-500">
        Given to a runner only for this project&apos;s jobs, and only while the job runs: deploy tokens,
        Clerk and Sentry keys, Codemagic credentials.
      </p>
      <SecretsEditor scope="project" projectId={projectId} />
    </div>
  )
}
