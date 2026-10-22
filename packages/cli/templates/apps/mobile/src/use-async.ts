import { useCallback, useEffect, useState } from 'react'
import type { AsyncView } from '@app/ui'

/**
 * Load something and expose it as an AsyncView, so a screen has to handle
 * loading, error and empty as well as the data.
 */
export function useAsync<T>(load: () => Promise<T>, isEmpty: (data: T) => boolean, errorText: string) {
  const [view, setView] = useState<AsyncView<T>>({ state: 'loading' })
  const run = useCallback(() => {
    setView({ state: 'loading' })
    load()
      .then((data) => setView(isEmpty(data) ? { state: 'empty' } : { state: 'ready', data }))
      .catch(() => setView({ state: 'error', error: errorText }))
  }, [load, isEmpty, errorText])
  useEffect(run, [run])
  return { view, reload: run }
}
