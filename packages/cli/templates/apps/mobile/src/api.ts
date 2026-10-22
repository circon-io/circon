import { useMemo } from 'react'
import { useAuth } from '@clerk/expo'
import { createApiClient } from '@app/shared'

/** The typed API client, carrying the signed-in user's session token. */
export function useApi() {
  const { getToken } = useAuth()
  return useMemo(
    () =>
      createApiClient({
        baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
        getToken: () => getToken(),
      }),
    [getToken],
  )
}
