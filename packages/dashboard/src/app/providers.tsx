'use client'

/**
 * HeroUI 3 is composable and needs no root provider — the v2 `HeroUIProvider`
 * no longer exists. Theming comes from the Tailwind plugin in globals.css, so
 * this stays a thin boundary for anything client-side we add later.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
