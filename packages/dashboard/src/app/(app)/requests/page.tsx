'use client'

import { useCallback, useState } from 'react'
import NextLink from 'next/link'
import { Button } from '@heroui/react'
import { ago, repoName, useApi, type SecretRequest } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, EmptyState, Mono, PageHeader, Skeleton, TabBar, inputClass } from '@/components/ui/primitives'
import { InboxIcon, KeyIcon, ShieldIcon } from '@/components/ui/icons'

/**
 * Credentials the agent asked for while building.
 *
 * The agent never invents a key or hard-codes one; it names what it needs and
 * why, and carries on with work that does not need it. Supplying one here
 * stores it as a project secret and wakes the running loop.
 */
export default function RequestsPage() {
  const api = useApi()
  const load = useCallback(() => api<{ requests: SecretRequest[] }>('/api/requests').then((d) => d.requests), [api])
  const { data, error, reload } = useData(load, { intervalMs: 10_000 })
  const [tab, setTab] = useState<'open' | 'resolved'>('open')

  const open = (data ?? []).filter((r) => r.status === 'pending')
  const resolved = (data ?? []).filter((r) => r.status !== 'pending')

  return (
    <>
      <PageHeader
        title="Requests"
        description="API keys and tokens the agent asked for while building. Each one becomes a project secret: write-only, and handed to a runner only for that project's jobs."
      />
      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}
      <div className="mb-5">
        <TabBar
          label="Requests"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: 'Open', badge: open.length },
            { id: 'resolved', label: 'Resolved' },
          ]}
        />
      </div>
      {!data ? (
        <Skeleton className="h-48" />
      ) : tab === 'open' ? (
        open.length === 0 ? (
          <Card>
            <EmptyState icon={<InboxIcon />} title="Nothing is waiting on you">
              When the agent needs a credential it does not have — a payment provider, a maps API — it asks here and keeps working on everything else.
            </EmptyState>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((r) => (
              <RequestCard key={r.id} request={r} onDone={reload} />
            ))}
          </div>
        )
      ) : (
        <Card padded={false}>
          {resolved.length === 0 ? (
            <EmptyState compact title="Nothing resolved yet" />
          ) : (
            <ul className="divide-y divide-separator">
              {resolved.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Mono className="font-medium">{r.name}</Mono>
                  <span className="text-muted">{repoName(r.project_slug)}</span>
                  <span className="ml-auto text-muted">{ago(r.resolved_at)}</span>
                  <Badge tone={r.status === 'fulfilled' ? 'success' : 'neutral'}>{r.status === 'fulfilled' ? 'Provided' : 'Dismissed'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}

function RequestCard({ request, onDone }: { request: SecretRequest; onDone: () => void }) {
  const api = useApi()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: 'fulfill' | 'dismiss') => {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/requests/${request.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'fulfill' ? { value } : {}),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning-soft-foreground">
          <KeyIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Mono className="text-[15px] font-semibold">{request.name}</Mono>
            <NextLink href={`/projects/${request.project_id}`} className="text-sm text-muted hover:text-foreground">
              {repoName(request.project_slug)}
            </NextLink>
            <span className="text-sm text-muted">
              · asked {ago(request.created_at)}
              {request.run_id && (
                <>
                  {' during '}
                  <NextLink href={`/runs/${request.run_id}`} className="hover:text-foreground hover:underline">
                    this run
                  </NextLink>
                </>
              )}
            </span>
          </div>
          <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm">{request.reason}</blockquote>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (value) void act('fulfill')
            }}
          >
            <input
              type="password"
              autoComplete="off"
              className={inputClass}
              placeholder={`Paste the value of ${request.name}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={`Value for ${request.name}`}
            />
            <div className="flex shrink-0 gap-2">
              <Button type="submit" variant="primary" size="md" isDisabled={busy || !value}>
                Provide
              </Button>
              <Button variant="ghost" size="md" isDisabled={busy} onPress={() => void act('dismiss')}>
                Dismiss
              </Button>
            </div>
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <ShieldIcon className="size-3.5" />
            Encrypted at rest and never shown again. The running loop picks it up at its next iteration.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </Card>
  )
}
