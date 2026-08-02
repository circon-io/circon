/**
 * Design-system adapter.
 *
 * Screens import from here so the underlying library can change without a
 * rewrite. Every wrapper must forward `testID` and `accessibilityLabel` — the
 * gate addresses elements by those, and a wrapper that drops them makes
 * everything beneath it invisible to the agent.
 */

export interface Addressable {
  /** Required, not optional: an element the gate cannot address is not built. */
  testID: string
  accessibilityLabel: string
}

export interface ButtonProps extends Addressable {
  onPress: () => void
  children?: unknown
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
}

export interface TextFieldProps extends Addressable {
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  error?: string
}

/**
 * Every async view owes the user three states. Screens that render only the
 * happy path are unfinished, so the type makes the other two impossible to
 * forget.
 */
export type AsyncView<T> =
  | { state: 'loading' }
  | { state: 'error'; error: string; retry?: () => void }
  | { state: 'empty' }
  | { state: 'ready'; data: T }

export function isReady<T>(view: AsyncView<T>): view is { state: 'ready'; data: T } {
  return view.state === 'ready'
}

// Platform implementations live alongside this file:
//   index.web.tsx     HeroUI + Fragment UI
//   index.native.tsx  HeroUI Native
// Metro and the Next.js bundler pick the right one by extension.
