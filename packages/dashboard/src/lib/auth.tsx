'use client'

import { ClerkProvider, OrganizationSwitcher, UserButton, useAuth } from '@clerk/nextjs'

/**
 * The only place the dashboard touches Clerk.
 *
 * Preview mode (`NEXT_PUBLIC_PREVIEW=1 next dev`) swaps in a fixed session and
 * sample data, so the interface can be developed and screenshotted without a
 * Clerk instance or a control plane. It is compiled out of production builds:
 * the flag is checked together with NODE_ENV, both inlined at build time.
 */
export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === '1' && process.env.NODE_ENV === 'development'

function useClerkToken(): () => Promise<string | null> {
  return useAuth().getToken
}

function usePreviewToken(): () => Promise<string | null> {
  return previewToken
}
const previewToken = async () => 'preview'

/** A function returning the current session token. */
export const useSessionToken = PREVIEW ? usePreviewToken : useClerkToken

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return PREVIEW ? <>{children}</> : <ClerkProvider>{children}</ClerkProvider>
}

export function OrgSwitcher() {
  if (PREVIEW) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
        <span className="grid size-6 place-items-center rounded-md bg-accent text-xs font-semibold text-accent-foreground">A</span>
        <span className="font-medium">Acme</span>
      </div>
    )
  }
  return (
    <OrganizationSwitcher
      hidePersonal={false}
      appearance={{ elements: { rootBox: 'w-full', organizationSwitcherTrigger: 'w-full justify-between px-2 py-1.5' } }}
    />
  )
}

export function UserMenu() {
  if (PREVIEW) {
    return <span className="grid size-8 place-items-center rounded-full bg-surface-tertiary text-xs font-medium">PT</span>
  }
  return <UserButton />
}
