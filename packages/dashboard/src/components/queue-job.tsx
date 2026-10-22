'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, CardContent, CardHeader, CardRoot, CardTitle } from '@heroui/react'
import { useApi, type Runner } from '@/lib/api'

interface QueueableProject {
  id: string
  slug: string
  status: string
  integration_revoked: string | null
}

/**
 * Queue work for whichever runner is free, or for one in particular.
 *
 * The project is chosen from the connected repositories rather than typed: a slug
 * the control plane has no project for cannot be cloned, and a typo used to
 * surface as a runner-side clone failure minutes later.
 */
export function QueueJob({ onQueued, runners }: { onQueued: () => void; runners: Runner[] }) {
  const api = useApi()
  const [projects, setProjects] = useState<QueueableProject[]>([])
  const [slug, setSlug] = useState('')
  const [runnerId, setRunnerId] = useState('')
  const [loops, setLoops] = useState('20')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(
    () =>
      api<{ projects: QueueableProject[] }>('/api/projects')
        .then(({ projects: rows }) => {
          const runnable = rows.filter((p) => p.status === 'active' && !p.integration_revoked)
          setProjects(runnable)
          // Preselect only when there is no ambiguity.
          setSlug((current) =>
            current && runnable.some((p) => p.slug === current)
              ? current
              : (runnable.length === 1 ? runnable[0]!.slug : ''),
          )
        })
        .catch(() => {
          /* the page-level error banner already covers an unreachable control plane */
        }),
    [api],
  )

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          projectSlug: slug,
          maxLoops: Number.parseInt(loops, 10) || 20,
          ...(runnerId ? { runnerId } : {}),
        }),
      })
      const target = runners.find((r) => r.id === runnerId)
      setMessage(
        target
          ? `Queued for ${target.name}.${target.state?.status === 'offline' ? ' It is offline, so it starts when it reconnects.' : ''}`
          : 'Queued. The next idle runner will claim it.',
      )
      onQueued()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not queue the job')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>Queue a run</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <p className="text-sm text-default-500">
            Connect a GitHub repository first — a run needs a project the runner can clone.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-default-600">Project</span>
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                aria-label="Project"
                data-testid="job-project"
                className="rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500"
              >
                <option value="">Choose a project…</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.slug}>
                    {project.slug.replace('__', '/')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-default-600">Runner</span>
              <select
                value={runnerId}
                onChange={(e) => setRunnerId(e.target.value)}
                aria-label="Runner"
                data-testid="job-runner"
                className="rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500"
              >
                <option value="">Any idle runner</option>
                {runners.map((runner) => (
                  <option key={runner.id} value={runner.id}>
                    {runner.name} ({runner.state?.status ?? 'offline'})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-default-600">Max iterations</span>
              <input
                type="number"
                value={loops}
                onChange={(e) => setLoops(e.target.value)}
                aria-label="Maximum iterations"
                data-testid="job-loops"
                className="w-28 rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500"
              />
            </label>
            <Button
              variant="primary"
              size="sm"
              isDisabled={!slug || busy}
              onClick={() => void submit()}
              data-testid="queue-job"
              aria-label="Queue run"
            >
              {busy ? 'Queueing…' : 'Queue run'}
            </Button>
          </div>
        )}
        {message && <p className="text-sm text-default-500">{message}</p>}
      </CardContent>
    </CardRoot>
  )
}
