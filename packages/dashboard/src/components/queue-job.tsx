'use client'

import { useState } from 'react'
import { Button, CardContent, CardHeader, CardRoot, CardTitle } from '@heroui/react'
import { useApi } from '@/lib/api'

/**
 * Queue work for whichever runner is free. The slug is `<org>__<repo>`, which
 * is also the directory name on the runner — one identifier, no mapping table.
 */
export function QueueJob({ onQueued }: { onQueued: () => void }) {
  const api = useApi()
  const [slug, setSlug] = useState('')
  const [loops, setLoops] = useState('20')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const valid = /^[A-Za-z0-9][\w.-]*__[A-Za-z0-9][\w.-]*$/.test(slug.trim())

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          projectSlug: slug.trim(),
          maxLoops: Number.parseInt(loops, 10) || 20,
        }),
      })
      setMessage('Queued. The next idle runner will claim it.')
      setSlug('')
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-default-600">Project</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="circon-io__circon"
              aria-label="Project slug"
              data-testid="job-slug"
              aria-invalid={slug.length > 0 && !valid}
              className="rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500 aria-invalid:border-danger"
            />
            <span className="text-xs text-default-400">
              {slug.length > 0 && !valid ? 'Expected <org>__<repo>' : '<org>__<repo>'}
            </span>
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
            isDisabled={!valid || busy}
            onClick={() => void submit()}
            data-testid="queue-job"
            aria-label="Queue run"
          >
            {busy ? 'Queueing…' : 'Queue run'}
          </Button>
        </div>
        {message && <p className="text-sm text-default-500">{message}</p>}
      </CardContent>
    </CardRoot>
  )
}
