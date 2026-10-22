import type { ReactNode } from 'react'
import {
  Button as HeroButton,
  FieldError,
  Input,
  Label,
  Spinner,
  TextField as HeroTextField,
} from 'heroui-native'

/**
 * Design-system adapter over HeroUI Native.
 *
 * Every wrapper forwards `testID` and `accessibilityLabel`: the gate addresses
 * elements by them, and a wrapper that dropped them would make everything
 * beneath it invisible to the agent.
 */

export interface Addressable {
  /** Required, not optional: an element the gate cannot address is not built. */
  testID: string
  accessibilityLabel: string
}

export interface ButtonProps extends Addressable {
  onPress: () => void
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  disabled?: boolean
  loading?: boolean
}

export function Button({ testID, accessibilityLabel, onPress, children, variant = 'primary', disabled, loading }: ButtonProps) {
  return (
    <HeroButton
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      variant={variant}
      isDisabled={Boolean(disabled || loading)}
    >
      {loading ? <Spinner /> : children}
    </HeroButton>
  )
}

export interface TextFieldProps extends Addressable {
  label: string
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  error?: string | null
  onSubmitEditing?: () => void
}

export function TextField(props: TextFieldProps) {
  return (
    <HeroTextField isInvalid={Boolean(props.error)}>
      <Label>{props.label}</Label>
      <Input
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        secureTextEntry={props.secureTextEntry}
        onSubmitEditing={props.onSubmitEditing}
      />
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </HeroTextField>
  )
}

export { Spinner }

/**
 * Every async view owes the user three states besides the happy one. Screens
 * that render only the happy path are unfinished, so the type makes the others
 * impossible to forget.
 */
export type AsyncView<T> =
  | { state: 'loading' }
  | { state: 'error'; error: string; retry?: () => void }
  | { state: 'empty' }
  | { state: 'ready'; data: T }

export function isReady<T>(view: AsyncView<T>): view is { state: 'ready'; data: T } {
  return view.state === 'ready'
}
