'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import { ApiError, useApi, type AgentBackend, type AgentRole, type RoleSpec, type RunConfig } from '@/lib/api'

const TIERS = ['typecheck', 'unit tests', 'web UI', 'android UI', 'ios UI']
const BACKENDS: AgentBackend[] = ['aider', 'claude-code', 'codex']
const ROLES: Array<{ role: AgentRole; label: string; hint: string }> = [
  { role: 'plan', label: 'Plan', hint: 'optional — a read-only step that plans each task before building it' },
  { role: 'build', label: 'Build', hint: 'writes the code' },
  { role: 'review', label: 'Review', hint: 'reviews the diff every few iterations and after failures' },
]

const input =
  'rounded-md border border-default-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-default-500'

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * One editor for every config layer: org defaults, a runner, a project.
 *
 * An empty field means "inherit", which is the whole point of layering — so
 * nothing here ever writes a default value on the user's behalf.
 */
export function ConfigEditor({
  initial,
  endpoint,
  inheritsFrom,
  onSaved,
}: {
  initial: RunConfig
  endpoint: string
  /** Shown as the placeholder hint, e.g. "org default". */
  inheritsFrom: string
  onSaved?: (config: RunConfig) => void
}) {
  const api = useApi()
  const [config, setConfig] = useState<RunConfig>(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K] | undefined) => {
    setConfig((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  const setRole = (role: AgentRole, spec: RoleSpec | null | undefined) => {
    setConfig((prev) => {
      const agents = { ...(prev.agents ?? {}) }
      if (spec === undefined) delete agents[role]
      else agents[role] = spec
      const rest = { ...prev }
      delete rest.agents
      return Object.keys(agents).length ? { ...rest, agents } : rest
    })
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    setErrors([])
    try {
      const saved = await api<{ config: RunConfig }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config }),
      })
      setConfig(saved.config)
      setMessage('Saved. Running loops apply it from their next iteration.')
      onSaved?.(saved.config)
    } catch (e) {
      if (e instanceof ApiError && e.fields.length) setErrors(e.fields)
      else setMessage(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const placeholder = `inherit (${inheritsFrom})`
  const skip = new Set(config.skipTiers ?? [])

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Budgets (USD, 0 = no limit)</legend>
        {(
          [
            ['budgetPerRunUsd', 'Per run'],
            ['budgetPerDayUsd', 'Per day, per runner'],
            ['verifyBudgetUsd', 'Per review pass'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-default-600">{label}</span>
            <input
              type="number"
              min={0}
              step="0.5"
              className={input}
              placeholder={placeholder}
              value={config[key] ?? ''}
              onChange={(e) => set(key, numberOrUndefined(e.target.value))}
              aria-label={label}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-default-600">Review every N iterations</span>
          <input
            type="number"
            min={1}
            className={input}
            placeholder={placeholder}
            value={config.verifyEvery ?? ''}
            onChange={(e) => set('verifyEvery', numberOrUndefined(e.target.value))}
            aria-label="Review every N iterations"
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Agents</legend>
        {ROLES.map(({ role, label, hint }) => {
          const spec = config.agents?.[role]
          return (
            <div key={role} className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_1fr]">
              <div className="text-sm">
                <div className="font-medium">{label}</div>
                <div className="text-xs text-default-500">{hint}</div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-default-600">Backend</span>
                <select
                  className={input}
                  value={spec === null ? 'off' : (spec?.backend ?? '')}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '') setRole(role, undefined)
                    else if (v === 'off') setRole(role, null)
                    else setRole(role, { ...(spec ?? {}), backend: v as AgentBackend })
                  }}
                  aria-label={`${label} backend`}
                >
                  <option value="">{placeholder}</option>
                  {role === 'plan' && <option value="off">off</option>}
                  {BACKENDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-default-600">Model</span>
                <input
                  className={input}
                  disabled={!spec}
                  placeholder={spec ? 'backend default' : '—'}
                  value={spec?.model ?? ''}
                  onChange={(e) => {
                    if (!spec) return
                    const next: RoleSpec = { ...spec }
                    if (e.target.value) next.model = e.target.value
                    else delete next.model
                    setRole(role, next)
                  }}
                  aria-label={`${label} model`}
                />
              </label>
            </div>
          )
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Gate</legend>
        <label className="flex flex-col gap-1 text-sm sm:w-64">
          <span className="text-default-600">iOS testing</span>
          <select
            className={input}
            value={config.iosRunnerMode ?? ''}
            onChange={(e) =>
              set('iosRunnerMode', (e.target.value || undefined) as RunConfig['iosRunnerMode'])
            }
            aria-label="iOS testing"
          >
            <option value="">{placeholder}</option>
            <option value="none">off</option>
            <option value="simulator">simulator (macOS runners)</option>
            <option value="device">USB device</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-default-600">Skip tiers:</span>
          {TIERS.map((tier) => (
            <label key={tier} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={skip.has(tier)}
                onChange={(e) => {
                  const next = new Set(skip)
                  if (e.target.checked) next.add(tier)
                  else next.delete(tier)
                  set('skipTiers', next.size ? [...next] : undefined)
                }}
                aria-label={`Skip ${tier}`}
              />
              {tier}
            </label>
          ))}
        </div>
      </fieldset>

      {errors.length > 0 && (
        <ul className="list-inside list-disc text-sm text-danger" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" isDisabled={busy} aria-label="Save settings">
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {message && <span className="text-sm text-default-500">{message}</span>}
      </div>
    </form>
  )
}
