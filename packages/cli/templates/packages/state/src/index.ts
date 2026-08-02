/**
 * Client state, one store per domain.
 *
 * Two rules that keep this from becoming a dumping ground:
 *
 *  - **Server data is not client state.** Do not mirror API responses in here.
 *    Fetch and cache them; this is for genuine UI and session state.
 *  - **Stores stay serialisable.** No class instances, no functions in state,
 *    so persistence and the dashboard can both read it.
 */

export interface SessionState {
  locale: 'en' | 'de'
  setLocale: (locale: 'en' | 'de') => void
}

export interface UiState {
  /** Keyed by a stable id, so two views can wait independently. */
  pending: Record<string, boolean>
  setPending: (key: string, value: boolean) => void
  isPending: (key: string) => boolean
}

/**
 * The store factories live here as types only; the concrete `create()` calls
 * belong in the app that owns the React runtime, so this package stays free of
 * a React dependency and can be imported by the Worker too.
 *
 * Example, in apps/web or apps/mobile:
 *
 *   import { create } from 'zustand'
 *   import type { SessionState } from '@app/state'
 *
 *   export const useSession = create<SessionState>((set) => ({
 *     locale: 'en',
 *     setLocale: (locale) => set({ locale }),
 *   }))
 */
export type StoreShape = SessionState | UiState
