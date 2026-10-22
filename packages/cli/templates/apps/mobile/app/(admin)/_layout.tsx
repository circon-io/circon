import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { Spinner } from '@app/ui'

/**
 * The admin area: role-gated screens in the same app, served on the web too.
 * Hiding them here is convenience only; every admin route on the API checks
 * the role itself.
 */
export default function AdminLayout() {
  const { isLoaded, isSignedIn, orgRole } = useAuth()
  if (!isLoaded) return <Spinner />
  if (!isSignedIn || orgRole !== 'org:admin') return <Redirect href="/" />
  return <Stack />
}
