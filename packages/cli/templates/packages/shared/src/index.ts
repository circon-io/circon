/**
 * Types and validation shared by the client and the API.
 *
 * Both sides import these, so a change to a payload breaks compilation on
 * whichever side has not caught up — the drift shows up at build time rather
 * than as a runtime surprise in production.
 */

export interface ApiError {
  /** Stable, machine-readable. Clients switch on this, never on the message. */
  code: string
  message: string
  details?: Record<string, unknown>
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

export function err(code: string, message: string, details?: Record<string, unknown>): ApiResult<never> {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } }
}

/**
 * A tiny validator, so the boundary is checked without another dependency.
 * Swap for zod or valibot when the shapes outgrow it — the call sites do not
 * change, only this file.
 */
export type Validator<T> = (input: unknown) => T

export class ValidationError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
    this.field = field
    this.name = 'ValidationError'
  }
}

export function str(field: string, opts: { min?: number; max?: number } = {}): Validator<string> {
  return (input) => {
    if (typeof input !== 'string') throw new ValidationError(field, 'must be a string')
    const value = input.trim()
    if (opts.min !== undefined && value.length < opts.min) {
      throw new ValidationError(field, `must be at least ${opts.min} characters`)
    }
    if (opts.max !== undefined && value.length > opts.max) {
      throw new ValidationError(field, `must be at most ${opts.max} characters`)
    }
    return value
  }
}

export function object<T extends Record<string, Validator<unknown>>>(
  shape: T,
): Validator<{ [K in keyof T]: ReturnType<T[K]> }> {
  return (input) => {
    if (typeof input !== 'object' || input === null) {
      throw new ValidationError('body', 'must be an object')
    }
    const source = input as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, validate] of Object.entries(shape)) {
      out[key] = validate(source[key])
    }
    return out as { [K in keyof T]: ReturnType<T[K]> }
  }
}
