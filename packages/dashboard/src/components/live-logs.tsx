'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PREVIEW, useSessionToken } from '@/lib/auth'
import { controlPlaneUrl } from '@/lib/api'

/**
 * A runner's live output, over its Durable Object's socket.
 *
 * Polling would drop lines between requests and cost a request per second per
 * viewer; the socket is the reason the DO exists. The ring buffer is fetched
 * first so opening the view mid-run shows recent context, not a blank pane.
 */
export function useLiveLogs(runnerId: string, onState?: () => void) {
  const getToken = useSessionToken()
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
    if (PREVIEW) {
      const { previewLogLines } = await import('@/lib/preview')
      setLines(previewLogLines())
      return
    }
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
