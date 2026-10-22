'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load something from the control plane, optionally on an interval.
 *
 * State is only ever set from promise callbacks, which keeps effects free of
 * synchronous state updates; `reload` re-runs the load immediately, e.g. after
 * a write. A failed refresh keeps the last good data on screen.
 */
export function useData<T>(load: () => Promise<T>, opts: { intervalMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    let alive = true
    const run = () =>
      loadRef.current()
        .then((value) => {
          if (!alive) return
          setData(value)
          setError(null)
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : 'Could not reach the control plane')
        })
    void run()
    const timer = opts.intervalMs ? setInterval(() => void run(), opts.intervalMs) : null
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
  }, [tick, opts.intervalMs, load])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, reload, loading: data === null && error === null }
}
