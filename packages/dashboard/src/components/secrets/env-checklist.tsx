'use client'

import { useCallback, useState } from 'react'
import { Button } from '@heroui/react'
import { useApi, type EnvChecklist as Checklist } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, CardHeader, EmptyState, Mono, Notice, Skeleton, cx, inputClass } from '../ui/primitives'
import { CheckIcon, ShieldIcon } from '../ui/icons'

/**
 * The keys this project needs, gathered before anyone finds out mid-run. The
 * agent never waits on these — it builds against dev keys and stubs — but a
 * deploy or a real end-to-end test does, so the owner can work through the list
 * while the first run is still going.
 */
export function EnvChecklist({ projectId, version, onChanged }: { projectId: string; version: number; onChanged: () => void }) {
  const api = useApi()
  // `version` is in the deps so a secret saved elsewhere on the page refreshes this.
  const load = useCallback(
    () => api<Checklist>(`/api/projects/${projectId}/env-checklist?v=${version}`),
    [api, projectId, version],
  )
  const { data, error, reload } = useData(load)

  const items = data?.items ?? []
  const provided = items.filter((i) => i.status !== 'missing').length
  const groups = [...new Set(items.map((i) => i.group ?? 'Other'))]

  return (
    <Card>
      <CardHeader
        icon={<ShieldIcon />}
        title="What this project needs"
        description="From .env.example on the default branch and the plan's External services. The agent builds without these; deploys and real end-to-end tests need them."
        actions={data && items.length > 0 ? <Badge tone={data.missing ? 'warning' : 'success'}>{provided} of {items.length} ready</Badge> : undefined}
      />
      {error && !data ? (
        <p className="text-sm text-danger" role="alert">{error}</p>
      ) : !data ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="flex flex-col gap-4">
          {data.readError && <Notice tone="warning">Could not read .env.example from GitHub: {data.readError}</Notice>}
          {items.length === 0 ? (
            <EmptyState compact icon={<ShieldIcon />} title="Nothing to gather yet">
              {data.foundEnvExample
                ? '.env.example lists no variables.'
                : 'The list fills in once the plan names external services, or the first run scaffolds .env.example.'}
            </EmptyState>
          ) : (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary" aria-hidden>
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(provided / items.length) * 100}%` }} />
              </div>
              {groups.map((group) => (
                <section key={group}>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{group}</h3>
                  <ul className="divide-y divide-separator rounded-lg border border-border">
                    {items
                      .filter((i) => (i.group ?? 'Other') === group)
                      .map((item) => (
                        <ChecklistRow
                          key={item.name}
                          item={item}
                          projectId={projectId}
                          onSaved={() => {
                            reload()
                            onChanged()
                          }}
                        />
                      ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function ChecklistRow({
  item,
  projectId,
  onSaved,
}: {
  item: Checklist['items'][number]
  projectId: string
  onSaved: () => void
}) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api('/api/secrets', { method: 'POST', body: JSON.stringify({ scope: 'project', projectId, name: item.name, value }) })
      setOpen(false)
      setValue('')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
            item.status === 'set' && 'bg-success-soft text-success-soft-foreground',
            item.status === 'default' && 'bg-surface-secondary text-muted',
            item.status === 'missing' && 'border border-dashed border-warning',
          )}
          aria-hidden
        >
          {item.status !== 'missing' && <CheckIcon className="size-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className={cx('text-sm font-medium', item.status !== 'missing' && 'text-muted')}>{item.name}</Mono>
            {item.status === 'default' && <Badge>local default</Badge>}
            {item.source === 'plan' && <Badge tone="accent">planned</Badge>}
          </div>
          {item.help && <p className="mt-0.5 text-sm text-muted">{item.help}</p>}
          {open && (
            <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void save() }}>
              <input
                className={inputClass}
                type="password"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Value for ${item.name}`}
                aria-label={`Value for ${item.name}`}
                autoFocus
              />
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="md" variant="primary" isDisabled={!value || busy}>Save</Button>
                <Button size="md" variant="ghost" onPress={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          )}
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
        {!open && item.status !== 'set' && (
          <Button size="sm" variant={item.status === 'missing' ? 'outline' : 'ghost'} onPress={() => setOpen(true)} aria-label={`Add ${item.name}`}>
            {item.status === 'missing' ? 'Add' : 'Override'}
          </Button>
        )}
      </div>
    </li>
  )
}
