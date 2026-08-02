'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button, CardContent, CardHeader, CardRoot, Chip, Code, Spinner } from '@heroui/react'
import { ago, controlPlaneUrl, money, useApi, type Runner } from '@/lib/api'

const STATUS_COLOR: Record<string, 'accent' | 'success' | 'default'> = {
  running: 'accent',
  idle: 'success',
  offline: 'default',
}

export function RunnerCard({ runner, onChanged }: { runner: Runner; onChanged: () => void }) {
  const api = useApi()
  const { getToken } = useAuth()
  const [watching, setWatching] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const status = runner.state?.status ?? 'offline'
  const running = status === 'running'

  // Always pin to the newest line — a log you have to drag is useless while
  // something is actively going wrong.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  useEffect(() => () => socketRef.current?.close(), [])

  const stop = useCallback(async () => {
    setBusy(true)
    try {
      await api(`/api/runners/${runner.id}/command`, {
        method: 'POST',
        body: JSON.stringify({ type: 'command', command: 'stop' }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [api, runner.id, onChanged])

  const revoke = useCallback(async () => {
    if (!confirm(`Revoke "${runner.name}"? Its token stops working immediately.`)) return
    setBusy(true)
    try {
      await api(`/api/runners/${runner.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [api, runner.id, runner.name, onChanged])

  /**
   * Live logs over the Durable Object's socket. Polling would drop lines
   * between requests and cost a request per second per viewer — the socket is
   * the reason the DO exists.
   */
  const toggleWatch = useCallback(async () => {
    if (watching) {
      socketRef.current?.close()
      socketRef.current = null
      setWatching(false)
      return
    }

    setWatching(true)
    setLines(['Connecting…'])

    const token = await getToken()
    const history = await fetch(`${controlPlaneUrl()}/api/runners/${runner.id}/logs`, {
      headers: { authorization: `Bearer ${token ?? ''}` },
    })
      .then((r) => r.json() as Promise<{ lines?: string[] }>)
      .catch(() => ({ lines: [] as string[] }))

    setLines(history.lines?.length ? history.lines : ['(no output yet)'])

    const url = new URL(`${controlPlaneUrl()}/api/runners/${runner.id}/watch`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    // A browser cannot set an Authorization header on a WebSocket handshake.
    url.searchParams.set('token', token ?? '')

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; lines?: string[] }
        if (message.type === 'log' && message.lines) {
          const incoming = message.lines
          setLines((prev) => [...prev, ...incoming].slice(-500))
        }
        if (message.type === 'state') onChanged()
      } catch {
        /* ignore malformed frames */
      }
    })
    socket.addEventListener('close', () => setLines((prev) => [...prev, '(disconnected)']))
  }, [watching, getToken, runner.id, onChanged])

  return (
    <CardRoot>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <Chip size="sm" color={STATUS_COLOR[status] ?? 'default'} data-testid={`status-${runner.id}`}>
          {status}
        </Chip>
        <span className="font-medium">{runner.name}</span>
        <span className="text-sm text-default-500">
          {running
            ? `${runner.state.project ?? '—'}${
                runner.state.iteration ? ` · iteration ${runner.state.iteration}` : ''
              } · ${money(runner.state.costUsd)}`
            : `last seen ${ago(runner.last_seen_at ?? runner.state?.lastSeenAt)}`}
        </span>

        <div className="ml-auto flex gap-2">
          {running && (
            <Button
              size="sm"
              variant="danger"
              isDisabled={busy}
              onClick={() => void stop()}
              data-testid={`stop-${runner.id}`}
              aria-label={`Stop ${runner.name}`}
            >
              Stop
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void toggleWatch()}
            data-testid={`logs-${runner.id}`}
            aria-label={`${watching ? 'Stop watching' : 'Watch'} logs for ${runner.name}`}
          >
            {watching ? 'Stop watching' : 'Live logs'}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isDisabled={busy}
            onClick={() => void revoke()}
            data-testid={`revoke-${runner.id}`}
            aria-label={`Revoke ${runner.name}`}
          >
            Revoke
          </Button>
        </div>
      </CardHeader>

      {watching && (
        <CardContent className="flex flex-col gap-2">
          <pre
            ref={logRef}
            className="max-h-72 overflow-auto rounded-md bg-default-100 p-3 font-mono text-xs whitespace-pre-wrap"
            data-testid={`log-${runner.id}`}
          >
            {lines.length ? lines.join('\n') : <Spinner />}
          </pre>
          <Code>{`${runner.platform ?? 'unknown'} · CLI ${runner.cli_version ?? '?'}`}</Code>
        </CardContent>
      )}
    </CardRoot>
  )
}
