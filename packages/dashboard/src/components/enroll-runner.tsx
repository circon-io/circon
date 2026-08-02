'use client'

import { useState } from 'react'
import { Button, CardContent, CardHeader, CardRoot, CardTitle, Code } from '@heroui/react'
import { controlPlaneUrl, useApi } from '@/lib/api'

/**
 * Adding a runner is one command. The token is single-use and short-lived, so
 * pasting it into a terminal is safe; what it returns is the long-lived
 * credential, and that never leaves the machine.
 */
export function EnrollRunner({ onEnrolled }: { onEnrolled: () => void }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [command, setCommand] = useState<string | null>(null)
  const [expiry, setExpiry] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ token: string; ttlMinutes: number }>('/api/enroll-token', {
        method: 'POST',
        body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
      })
      setCommand(`circon enroll --url ${controlPlaneUrl()} --token ${data.token}`)
      setExpiry(`Single use · expires in ${data.ttlMinutes} minutes`)
      onEnrolled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a token')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>Add a runner</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-default-600">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ubuntu-3060"
              aria-label="Runner name"
              data-testid="runner-name"
              className="rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500"
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            isDisabled={busy}
            onClick={() => void create()}
            data-testid="create-enroll-token"
            aria-label="Create enrollment token"
          >
            {busy ? 'Creating…' : 'Create enrollment token'}
          </Button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {command && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-default-500">Run this on the machine:</p>
            <Code className="overflow-x-auto" data-testid="enroll-command">
              {command}
            </Code>
            <p className="text-xs text-default-400">{expiry}</p>
          </div>
        )}
      </CardContent>
    </CardRoot>
  )
}
