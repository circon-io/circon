'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Switch } from '@heroui/react'
import { ApiError, useApi, type AgentBackend, type AgentRole, type RoleSpec, type RunConfig } from '@/lib/api'
import { Card, CardHeader, Notice, Segmented, SettingRow, Skeleton, cx, inputClass } from '../ui/primitives'
import { DollarIcon, LoopIcon, SparklesIcon } from '../ui/icons'
import { TIERS } from '../loops/tiers'

/**
 * One editor for a config layer: the org's defaults, a runner, or a project.
 *
 * Empty means "inherit from the layer below", which is the point of layering,
 * so nothing here writes a default on the user's behalf. All sections share
 * one draft and one save bar, so two sections can never overwrite each other.
 */

export type Section = 'agents' | 'budgets' | 'loops'

const BACKENDS: Array<{ value: AgentBackend; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'aider', label: 'aider' },
]

const MODELS: Record<AgentBackend, string[]> = {
  'claude-code': ['fable', 'opus', 'sonnet', 'haiku'],
  codex: ['gpt-5-codex', 'gpt-5'],
  aider: ['sonnet', 'opus', 'ollama_chat/qwen2.5-coder:7b'],
}

const ROLES: Array<{ role: AgentRole; title: string; description: string }> = [
  { role: 'plan', title: 'Plan', description: 'Reads the task and decides the approach before any code is written. Optional.' },
  { role: 'build', title: 'Build', description: 'Writes the code. Nothing it does is committed until the feedback loops pass.' },
  { role: 'review', title: 'Review', description: 'Reviews the diff every few iterations and after failures. A second vendor catches different mistakes.' },
]

/**
 * A failed load is an error, never an empty layer: saving an empty-looking form
 * would replace every stored setting at this layer with the one field touched.
 */
function useConfig(endpoint: string) {
  const api = useApi()
  const [saved, setSaved] = useState<RunConfig | null>(null)
  const [draft, setDraft] = useState<RunConfig | null>(null)
  const [inherited, setInherited] = useState<RunConfig>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    api<{ config: RunConfig; inherited?: RunConfig }>(endpoint)
      .then(({ config, inherited }) => {
        setSaved(config)
        setDraft(config)
        setInherited(inherited ?? {})
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Could not load these settings.'))
  }, [api, endpoint, attempt])
  const retry = useCallback(() => {
    setLoadError(null)
    setAttempt((n) => n + 1)
  }, [])
  return { api, saved, setSaved, draft, setDraft, inherited, loadError, retry }
}

export function ConfigForm({
  endpoint,
  sections,
  inheritsFrom,
  inDialog = false,
}: {
  endpoint: string
  sections: Section[]
  inheritsFrom: string
  /** In a dialog the save bar sticks to the dialog's bottom instead of the window's. */
  inDialog?: boolean
}) {
  const { api, saved, setSaved, draft, setDraft, inherited, loadError, retry } = useConfig(endpoint)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])

  const set = useCallback(<K extends keyof RunConfig>(key: K, value: RunConfig[K] | undefined) => {
    setMessage(null)
    setDraft((prev) => {
      const next = { ...(prev ?? {}) }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }, [setDraft])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setErrors([])
    try {
      const result = await api<{ config: RunConfig }>(endpoint, { method: 'POST', body: JSON.stringify({ config: draft }) })
      setSaved(result.config)
      setDraft(result.config)
      setMessage('Saved. Running loops apply it from their next iteration.')
    } catch (e) {
      setErrors(e instanceof ApiError && e.fields.length ? e.fields : [e instanceof Error ? e.message : 'Could not save'])
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Card>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">These settings could not be loaded</p>
            <p className="mt-0.5 text-sm text-muted">{loadError}</p>
          </div>
          <Button size="sm" variant="outline" onPress={retry}>
            Try again
          </Button>
        </div>
      </Card>
    )
  }

  if (!draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div className={cx('@container flex flex-col gap-5', !inDialog && 'pb-20')}>
      {sections.includes('agents') && <AgentsSection config={draft} set={set} inheritsFrom={inheritsFrom} inherited={inherited} />}
      {sections.includes('loops') && <LoopsSection config={draft} set={set} inheritsFrom={inheritsFrom} inherited={inherited} />}
      {sections.includes('budgets') && <BudgetsSection config={draft} set={set} inheritsFrom={inheritsFrom} inherited={inherited} />}

      {message && !dirty && <Notice tone="success">{message}</Notice>}

      <div
        className={cx(
          'z-20 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.12)] transition-all',
          inDialog
            ? cx('sticky bottom-0', !dirty && 'hidden')
            : cx('fixed inset-x-0 bottom-4 mx-auto w-[min(100%-2rem,40rem)] lg:left-[248px]', dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'),
        )}
        aria-hidden={!dirty}
      >
        <div className="min-w-0 flex-1 text-sm">
          {errors.length ? <span className="text-danger">{errors.join('; ')}</span> : 'You have unsaved changes.'}
        </div>
        <Button size="sm" variant="ghost" onPress={() => { setDraft(saved); setErrors([]) }} isDisabled={busy}>
          Discard
        </Button>
        <Button size="sm" variant="primary" onPress={() => void save()} isDisabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

type SectionProps = {
  config: RunConfig
  set: <K extends keyof RunConfig>(key: K, value: RunConfig[K] | undefined) => void
  inheritsFrom: string
  /** The layers below this one, merged, as far as the server can tell. */
  inherited: RunConfig
}

function AgentsSection({ config, set, inheritsFrom, inherited }: SectionProps) {
  const setRole = (role: AgentRole, spec: RoleSpec | null | undefined) => {
    const agents = { ...(config.agents ?? {}) }
    if (spec === undefined) delete agents[role]
    else agents[role] = spec
    set('agents', Object.keys(agents).length ? agents : undefined)
  }

  return (
    <Card>
      <CardHeader
        icon={<SparklesIcon />}
        title="Agents"
        description="Who plans, builds and reviews, and with which model. Claude Code and Codex run on your subscriptions when the runner is logged in."
      />
      <div className="grid gap-3 @2xl:grid-cols-3">
        {ROLES.map(({ role, title, description }) => {
          const spec = config.agents?.[role]
          const below = inherited.agents?.[role]
          const belowLabel = below === null ? 'off' : below ? [BACKENDS.find((b) => b.value === below.backend)?.label, below.model].filter(Boolean).join(' · ') : null
          const choice = spec === null ? 'off' : (spec?.backend ?? 'inherit')
          const options = [
            { value: 'inherit', label: 'Inherit' },
            ...(role === 'plan' ? [{ value: 'off', label: 'Off' }] : []),
            ...BACKENDS,
          ]
          return (
            <div key={role} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
              </div>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Backend
                <select
                  className={inputClass}
                  value={choice}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'inherit') setRole(role, undefined)
                    else if (v === 'off') setRole(role, null)
                    else setRole(role, { backend: v as AgentBackend })
                  }}
                  aria-label={`${title} backend`}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value === 'inherit' ? `Inherit (${belowLabel ? `${inheritsFrom}: ${belowLabel}` : inheritsFrom})` : o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Model
                <input
                  className={inputClass}
                  list={`models-${role}`}
                  disabled={!spec}
                  placeholder={spec ? 'Backend default' : '—'}
                  value={spec?.model ?? ''}
                  onChange={(e) => {
                    if (!spec) return
                    const next: RoleSpec = { ...spec }
                    if (e.target.value) next.model = e.target.value
                    else delete next.model
                    setRole(role, next)
                  }}
                  aria-label={`${title} model`}
                />
                <datalist id={`models-${role}`}>
                  {(spec ? MODELS[spec.backend] : []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function money(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function BudgetsSection({ config, set, inheritsFrom, inherited }: SectionProps) {
  const fields = [
    { key: 'budgetPerRunUsd' as const, title: 'Per run', description: 'A run stops between iterations once it has spent this much. 0 means no limit.' },
    { key: 'budgetPerDayUsd' as const, title: 'Per day, per runner', description: 'Machine-wide, so twenty small runs cannot add up to one runaway.' },
    { key: 'verifyBudgetUsd' as const, title: 'Per review pass', description: 'A hard cap on each review, where the backend supports one.' },
  ]
  return (
    <Card>
      <CardHeader
        icon={<DollarIcon />}
        title="Budgets"
        description="API spend only. Usage on a Claude or ChatGPT subscription is recorded but never counted against these."
      />
      <div>
        {fields.map((f) => (
          <SettingRow key={f.key} title={f.title} description={f.description}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">$</span>
              <input
                type="number"
                min={0}
                step="0.5"
                className={cx(inputClass, 'pl-7 tabular-nums')}
                placeholder={inherited[f.key] !== undefined ? `Inherit: ${inherited[f.key]}` : `Inherit (${inheritsFrom})`}
                value={money(config[f.key])}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                aria-label={f.title}
              />
            </div>
          </SettingRow>
        ))}
        <SettingRow title="Review cadence" description="Run the review pass every N iterations, as well as after every failure.">
          <input
            type="number"
            min={1}
            className={cx(inputClass, 'tabular-nums')}
            placeholder={inherited.verifyEvery !== undefined ? `Inherit: ${inherited.verifyEvery}` : `Inherit (${inheritsFrom})`}
            value={config.verifyEvery ?? ''}
            onChange={(e) => set('verifyEvery', e.target.value === '' ? undefined : Number(e.target.value))}
            aria-label="Review every N iterations"
          />
        </SettingRow>
      </div>
    </Card>
  )
}

function LoopsSection({ config, set, inheritsFrom, inherited }: SectionProps) {
  // `skipTiers` replaces rather than merges across layers, so the switches show
  // the effective set, and any toggle writes the whole set at this layer — an
  // empty list included, which is how a project turns back on what the org skips.
  const own = config.skipTiers
  const skipped = new Set(own ?? inherited.skipTiers ?? [])
  const toggle = (tier: string, enabled: boolean) => {
    const next = new Set(skipped)
    if (enabled) next.delete(tier)
    else next.add(tier)
    set('skipTiers', [...next])
  }
  const iosMode = config.iosRunnerMode ?? 'inherit'

  return (
    <Card>
      <CardHeader
        icon={<LoopIcon />}
        title="Feedback loops"
        description="Every iteration has to pass these, cheapest first, before anything is committed. A loop only runs when the project has what it needs."
        actions={
          own !== undefined && (
            <Button size="sm" variant="ghost" onPress={() => set('skipTiers', undefined)}>
              Follow {inheritsFrom}
            </Button>
          )
        }
      />
      {own === undefined && (inherited.skipTiers?.length ?? 0) > 0 && (
        <p className="-mt-2 mb-3 text-xs text-muted">Switched off by the {inheritsFrom}: {inherited.skipTiers?.join(', ')}. Turning one on here overrides it.</p>
      )}
      <div className="flex flex-col gap-2">
        {TIERS.map((tier) => {
          const Icon = tier.icon
          const enabled = !skipped.has(tier.id)
          return (
            <div key={tier.id} className={cx('flex items-start gap-4 rounded-lg border border-border p-4 transition-opacity', !enabled && 'opacity-60')}>
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">
                <Icon className="size-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{tier.label}</div>
                <p className="mt-0.5 text-sm text-muted">{tier.description}</p>
                <p className="mt-1 text-xs text-muted/80">Runs when: {tier.needs}</p>
                {tier.id === 'ios UI' && (
                  <div className="mt-3">
                    <Segmented
                      size="sm"
                      label="iOS mode"
                      value={iosMode}
                      onChange={(v) => set('iosRunnerMode', v === 'inherit' ? undefined : (v as RunConfig['iosRunnerMode']))}
                      options={[
                        { value: 'inherit', label: `Inherit (${inheritsFrom})` },
                        { value: 'none', label: 'Off' },
                        { value: 'simulator', label: 'Simulator (Mac)' },
                        { value: 'device', label: 'USB iPhone' },
                      ]}
                    />
                  </div>
                )}
              </div>
              <Switch isSelected={enabled} onChange={(on: boolean) => toggle(tier.id, on)} size="sm">
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <span className="sr-only">{tier.label} loop</span>
                </Switch.Content>
              </Switch>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
