'use client'

import { useCallback, useMemo, useState } from 'react'
import { repoName, useApi, type Run } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, PageHeader, Segmented, Skeleton, inputClass } from '@/components/ui/primitives'
import { RunTable } from '@/components/runs/run-table'

const NEEDS_ATTENTION = new Set(['stuck', 'failed', 'aborted', 'infrastructure', 'usage-limit', 'budget'])

type Filter = 'all' | 'running' | 'attention' | 'done'

export default function RunsPage() {
  const api = useApi()
  const load = useCallback(() => api<{ runs: Run[] }>('/api/runs?limit=200').then((d) => d.runs), [api])
  const { data: runs, error } = useData(load, { intervalMs: 10_000 })
  const [filter, setFilter] = useState<Filter>('all')
  const [project, setProject] = useState('')

  const projects = useMemo(() => [...new Set((runs ?? []).map((r) => r.project_slug))].sort(), [runs])
  const shown = (runs ?? []).filter((r) => {
    if (project && r.project_slug !== project) return false
    if (filter === 'running') return r.outcome === 'running'
    if (filter === 'attention') return NEEDS_ATTENTION.has(r.outcome ?? '')
    if (filter === 'done') return r.outcome === 'complete' || r.outcome === 'limit'
    return true
  })

  return (
    <>
      <PageHeader title="Runs" description="Every build, with the feedback loops it passed and where it stopped." />
      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Filter runs"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'running', label: 'Running' },
              { value: 'attention', label: 'Needs attention' },
              { value: 'done', label: 'Finished' },
            ]}
          />
          <select className={`${inputClass} w-auto`} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {repoName(p)}
              </option>
            ))}
          </select>
        </div>
        {runs ? <RunTable runs={shown} /> : <Skeleton className="h-64" />}
      </Card>
    </>
  )
}
