'use client'

import { useCallback, useState } from 'react'
import { Button } from '@heroui/react'
import { ago, useApi } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { EmptyState, Mono, Skeleton, inputClass } from '../ui/primitives'
import { KeyIcon, PlusIcon } from '../ui/icons'

interface SecretRow {
  id: string
  name: string
  updated_at: string
}

/**
 * Write-only credentials: a value can be set or replaced, never read back. The
 * only reader is a runner, for a job it was dispatched.
 */
export function SecretsList({
  scope,
  projectId,
  version = 0,
  onChanged,
}: {
  scope: 'machine' | 'project'
  projectId?: string
  /** Bumped by the page when a secret was saved elsewhere on it. */
  version?: number
  onChanged?: () => void
}) {
  const api = useApi()
  const query = scope === 'project' ? `scope=project&projectId=${encodeURIComponent(projectId ?? '')}` : 'scope=machine'
  const load = useCallback(
    () => api<{ secrets: SecretRow[] }>(`/api/secrets?${query}&v=${version}`).then((d) => d.secrets),
    [api, query, version],
  )
  const { data, reload } = useData(load)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await api('/api/secrets', { method: 'POST', body: JSON.stringify({ scope, projectId, name, value }) })
      setName('')
      setValue('')
      setAdding(false)
      reload()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    }
  }
  const remove = async (row: SecretRow) => {
    if (!confirm(`Delete ${row.name}? Runs already going keep the value they were given.`)) return
    await api(`/api/secrets/${row.id}`, { method: 'DELETE' })
    reload()
    onChanged?.()
  }

  if (!data) return <Skeleton className="h-24" />
  return (
    <div className="flex flex-col gap-3">
      {data.length === 0 && !adding ? (
        <EmptyState compact icon={<KeyIcon />} title="No secrets yet" />
      ) : (
        <ul className="divide-y divide-separator rounded-lg border border-border">
          {data.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <KeyIcon className="size-4 text-muted" />
              <Mono className="flex-1 truncate text-sm font-medium">{row.name}</Mono>
              <span className="hidden text-xs text-muted sm:inline">updated {ago(row.updated_at)}</span>
              <span className="font-mono text-xs tracking-widest text-muted">••••••••</span>
              <Button size="sm" variant="ghost" onPress={() => void remove(row)} aria-label={`Delete ${row.name}`}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <input className={`${inputClass} font-mono sm:w-64`} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="CLOUDFLARE_API_TOKEN" aria-label="Secret name" autoFocus />
          <input className={inputClass} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" aria-label="Secret value" />
          <div className="flex shrink-0 gap-2">
            <Button type="submit" size="md" variant="primary" isDisabled={!name || !value}>Save</Button>
            <Button size="md" variant="ghost" onPress={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div>
          <Button size="sm" variant="outline" onPress={() => setAdding(true)}><PlusIcon className="size-4" /> Add secret</Button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
