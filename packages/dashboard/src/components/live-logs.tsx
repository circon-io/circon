'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Spinner } from '@heroui/react'
import { controlPlaneUrl } from '@/lib/api'

/**
 * A runner's live output, over its Durable Object's socket.
 *
 * Polling would drop lines between requests and cost a request per second per
 * viewer; the socket is the reason the DO exists. The ring buffer is fetched
 * first so opening the view mid-run shows recent context, not a blank pane.
 */
export function useLiveLogs(runnerId: string, onState?: () => void) {
  const { getToken } = useAuth()
  const [lines, setLines] = useState<string[]>([])
  const [active, setActive] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const onStateRef = useRef(onState)
  useEffect(() => {
    onStateRef.current = onState
  }, [onState])

  const stop = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    setActive(true)
    setLines(['Connecting…'])
    const token = await getToken()

    const history = await fetch(`${controlPlaneUrl()}/api/runners/${runnerId}/logs`, {
      headers: { authorization: `Bearer ${token ?? ''}` },
    })
      .then((r) => r.json() as Promise<{ lines?: string[]; ok?: boolean; error?: { message?: string } }>)
      .catch(() => ({ lines: [] as string[] }))
    if ('error' in history && history.error?.message) {
      setLines([history.error.message])
      return
    }
    setLines(history.lines?.length ? history.lines : ['(no output yet)'])

    const url = new URL(`${controlPlaneUrl()}/api/runners/${runnerId}/watch`)
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
          setLines((prev) => [...prev, ...incoming].slice(-1000))
        }
        if (message.type === 'state') onStateRef.current?.()
      } catch {
        /* ignore malformed frames */
      }
    })
    socket.addEventListener('close', () => setLines((prev) => [...prev, '(disconnected)']))
  }, [getToken, runnerId])

  useEffect(() => () => socketRef.current?.close(), [])

  return { lines, active, start, stop }
}

export function LogPane({ lines, testId }: { lines: string[]; testId?: string }) {
  const ref = useRef<HTMLPreElement>(null)
  // Always pin to the newest line — a log you have to drag is useless while
  // something is actively going wrong.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <pre
      ref={ref}
      className="max-h-96 overflow-auto rounded-md bg-default-100 p-3 font-mono text-xs whitespace-pre-wrap"
      data-testid={testId}
      aria-live="polite"
    >
      {lines.length ? lines.join('\n') : <Spinner size="sm" aria-label="Loading logs" />}
    </pre>
  )
}
