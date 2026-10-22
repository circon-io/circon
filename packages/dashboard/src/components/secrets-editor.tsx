'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { ago, useApi } from '@/lib/api'

interface SecretRow {
  id: string
  name: string
  updated_at: string
}

const input =
  'rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500'

/**
 * Write-only credentials. A value can be set or replaced, never read back:
 * the only reader is a runner, for a job it was dispatched.
 */
export function SecretsEditor({ scope, projectId }: { scope: 'machine' | 'project'; projectId?: string }) {
  const api = useApi()
  const [rows, setRows] = useState<SecretRow[] | null>(null)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = scope === 'project' ? `scope=project&projectId=${encodeURIComponent(projectId ?? '')}` : 'scope=machine'
  const load = useCallback(
    () =>
      api<{ secrets: SecretRow[] }>(`/api/secrets?${query}`)
        .then((data) => setRows(data.secrets))
        .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load secrets')),
    [api, query],
  )

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await api('/api/secrets', { method: 'POST', body: JSON.stringify({ scope, projectId, name, value }) })
      setName('')
      setValue('')
      setMessage(`Saved ${name}. Runners receive it from their next job.`)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: SecretRow) => {
    if (!confirm(`Delete ${row.name}? Runs already going keep the value they were given.`)) return
    await api(`/api/secrets/${row.id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="flex flex-col gap-3">
      {!rows ? (
        <Spinner size="sm" aria-label="Loading secrets" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-default-500">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3">
              <span className="font-mono">{row.name}</span>
              <span className="text-default-400">updated {ago(row.updated_at)}</span>
              <Button size="sm" variant="tertiary" onClick={() => void remove(row)} aria-label={`Delete ${row.name}`}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-default-600">Name</span>
          <input
            className={`${input} font-mono`}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder={scope === 'machine' ? 'ANTHROPIC_API_KEY' : 'CLOUDFLARE_API_TOKEN'}
            aria-label="Secret name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-default-600">Value</span>
          <input
            className={input}
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Secret value"
          />
        </label>
        <Button type="submit" size="sm" variant="primary" isDisabled={busy || !name || !value} aria-label="Save secret">
          Save
        </Button>
      </form>
      {message && <p className="text-sm text-default-500" role="status">{message}</p>}
    </div>
  )
}
