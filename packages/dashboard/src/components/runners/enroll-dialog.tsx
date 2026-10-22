'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import { controlPlaneUrl, useApi } from '@/lib/api'
import { Dialog } from '../ui/dialog'
import { CopyButton, Field, Mono, inputClass } from '../ui/primitives'

/**
 * Adding a runner is one command. The token is single-use and short-lived, so
 * pasting it into a terminal is safe; what it returns is the long-lived
 * credential, and that never leaves the machine.
 */
export function EnrollDialog({ isOpen, onOpenChange, onEnrolled }: { isOpen: boolean; onOpenChange: (open: boolean) => void; onEnrolled: () => void }) {
  const api = useApi()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [command, setCommand] = useState<string | null>(null)
  const [ttl, setTtl] = useState(30)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ token: string; ttlMinutes: number }>('/api/enroll-token', {
        method: 'POST',
        body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
      })
      setCommand(`circon enroll --url ${controlPlaneUrl() || 'https://api.circon.io'} --token ${data.token}`)
      setTtl(data.ttlMinutes)
      onEnrolled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a token')
    } finally {
      setBusy(false)
    }
  }

  const close = (open: boolean) => {
    onOpenChange(open)
    if (!open) {
      setCommand(null)
      setName('')
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      title="Add a runner"
      description="A Linux box with an NVIDIA GPU, or a Mac. It installs everything it needs, then waits for work."
      footer={
        command ? (
          <Button variant="primary" size="sm" onPress={() => close(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onPress={() => close(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onPress={() => void create()} isDisabled={busy}>
              {busy ? 'Creating…' : 'Create enrollment command'}
            </Button>
          </>
        )
      }
    >
      {!command ? (
        <Field label="Name" hint="Shown in the dashboard. Defaults to the machine's hostname." htmlFor="runner-name">
          <input id="runner-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="studio-rtx" />
        </Field>
      ) : (
        <ol className="flex flex-col gap-4 text-sm">
          <li>
            <div className="mb-1.5 font-medium">1. Install circon on the machine</div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-terminal px-3 py-2 text-terminal-foreground">
              <Mono className="truncate text-xs">curl -fsSL https://raw.githubusercontent.com/circon-io/circon/main/init.sh | bash</Mono>
              <CopyButton value="curl -fsSL https://raw.githubusercontent.com/circon-io/circon/main/init.sh | bash" />
            </div>
          </li>
          <li>
            <div className="mb-1.5 font-medium">2. Enroll it</div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-terminal px-3 py-2 text-terminal-foreground" data-testid="enroll-command">
              <Mono className="break-all text-xs">{command}</Mono>
              <CopyButton value={command} />
            </div>
            <p className="mt-1.5 text-xs text-muted">Single use, valid for {ttl} minutes.</p>
          </li>
          <li>
            <div className="font-medium">3. Converge it</div>
            <p className="mt-0.5 text-muted">
              <Mono>circon config</Mono> and <Mono>circon setup</Mono> install the toolchain. The runner shows up here as soon as it connects.
            </p>
          </li>
        </ol>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  )
}
