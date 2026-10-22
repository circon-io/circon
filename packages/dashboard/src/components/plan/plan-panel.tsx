'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@heroui/react'
import { ago, useApi, useEventStream, type PlanCheck, type PlanSummary, type Project } from '@/lib/api'
import { Badge, Card, Notice, Skeleton, cx, inputClass } from '../ui/primitives'
import { CheckIcon, SparklesIcon } from '../ui/icons'
import { PrdView } from './prd-view'

interface PlanDetail {
  plan: PlanSummary & { prd: string }
  check: PlanCheck
  diff: Array<{ op: ' ' | '+' | '-'; line: string }> | null
}

const EXAMPLES = [
  'A booking app for a small physiotherapy practice: patients pick a slot, staff manage the calendar.',
  'A shared shopping list for a household, synced across phones, with check-off and undo.',
  'An internal tool to track equipment loans: who has what, when it is due back, reminders.',
]

/**
 * Idea → plan → approval. Every generation, refinement and hand edit is a new
 * version; approving one writes it to the repository as PRD.md, and runners
 * only ever read it from there.
 */
export function PlanPanel({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const api = useApi()
  const stream = useEventStream()
  const [plans, setPlans] = useState<PlanSummary[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const [idea, setIdea] = useState('')
  const [instruction, setInstruction] = useState('')
  const [writing, setWriting] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [view, setView] = useState<'document' | 'changes'>('document')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)

  const loadPlans = useCallback(
    () =>
      api<{ plans: PlanSummary[] }>(`/api/projects/${project.id}/plans`)
        .then(({ plans: rows }) => {
          setPlans(rows)
          setSelected((current) => current ?? rows[0]?.version ?? null)
        })
        .catch((e: unknown) => setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not load plans' })),
    [api, project.id],
  )
  useEffect(() => {
    void loadPlans()
  }, [loadPlans])
  useEffect(() => {
    if (selected === null) return
    api<PlanDetail>(`/api/projects/${project.id}/plans/${selected}`)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [api, project.id, selected])

  const generate = async (body: { idea: string } | { instruction: string }) => {
    setBusy(true)
    setMessage(null)
    setWriting('')
    try {
      await stream(`/api/projects/${project.id}/plans/stream`, body, (event, data) => {
        if (event === 'delta') setWriting((prev) => (prev ?? '') + String(data['text'] ?? ''))
        if (event === 'done') {
          const version = Number(data['version'])
          const check = data['check'] as PlanCheck | undefined
          setSelected(version)
          setInstruction('')
          setView('document')
          setMessage(
            check && !check.ok
              ? { tone: 'warning', text: `Version ${version} needs attention before it can be approved: ${check.errors.join('; ')}.` }
              : { tone: 'success', text: `Version ${version} is ready to review.` },
          )
        }
        if (event === 'error') setMessage({ tone: 'danger', text: String(data['message'] ?? 'The planner failed.') })
      })
      await loadPlans()
      onChanged()
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'The planner failed.' })
    } finally {
      setWriting(null)
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    if (editing === null) return
    setBusy(true)
    try {
      const saved = await api<{ version: number; check: PlanCheck }>(`/api/projects/${project.id}/plans`, { method: 'POST', body: JSON.stringify({ prd: editing }) })
      setEditing(null)
      setSelected(saved.version)
      setMessage(saved.check.ok ? { tone: 'success', text: `Saved as version ${saved.version}.` } : { tone: 'warning', text: `Saved as version ${saved.version}: ${saved.check.errors.join('; ')}.` })
      await loadPlans()
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!detail) return
    setBusy(true)
    try {
      const result = await api<{ kind: 'committed' | 'pull-request' }>(`/api/projects/${project.id}/plans/${detail.plan.version}/approve`, { method: 'POST' })
      setMessage({
        tone: 'success',
        text: result.kind === 'committed'
          ? 'Approved and committed as PRD.md. Runners pick it up from their next iteration.'
          : 'The default branch is protected, so a pull request was opened. Merge it to let runners build from it.',
      })
      await loadPlans()
      onChanged()
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not approve' })
    } finally {
      setBusy(false)
    }
  }

  if (plans === null) return <Skeleton className="h-96" />

  // ---- first plan: describe the idea ----------------------------------------------------
  if (plans.length === 0 && writing === null) {
    return (
      <Card className="mx-auto max-w-3xl">
        <div className="mx-auto mb-5 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <SparklesIcon className="size-5" />
        </div>
        <h2 className="text-center text-lg font-semibold">What do you want to build?</h2>
        <p className="mx-auto mt-1 max-w-lg text-center text-sm text-muted">
          Describe it the way you would to a developer: who it is for, what they do with it, what matters most. The plan follows your conventions, so there is no need to name a stack.
        </p>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void generate({ idea })
          }}
        >
          <textarea
            className={cx(inputClass, 'min-h-40 resize-y text-[15px] leading-relaxed')}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A booking app for a small practice…"
            aria-label="Describe the idea"
            data-testid="plan-idea"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setIdea(example)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-foreground"
              >
                {example.split(':')[0]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">Takes a minute or two. You can refine it afterwards.</span>
            <Button type="submit" variant="primary" isDisabled={busy || idea.trim().length < 20}>
              <SparklesIcon className="size-4" /> Write the plan
            </Button>
          </div>
        </form>
        {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
      </Card>
    )
  }

  const current = detail?.plan
  const canApprove = Boolean(current && detail?.check.ok && current.status !== 'approved')

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* the document */}
      <Card className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-separator pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">PRD.md</span>
            {current && <span className="text-sm text-muted">· version {current.version}</span>}
            {current?.status === 'approved' && <Badge tone="success"><CheckIcon className="size-3" /> Approved</Badge>}
            {current?.status === 'draft' && <Badge tone="warning" dot>Draft</Badge>}
          </div>
          {detail?.diff && writing === null && editing === null && (
            <div className="flex rounded-lg bg-surface-secondary p-0.5 text-xs">
              {(['document', 'changes'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={cx('rounded-md px-2.5 py-1 font-medium capitalize', view === v ? 'bg-surface shadow-sm' : 'text-muted')}>
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>

        {writing !== null ? (
          <div aria-live="polite">
            <div className="mb-3 flex items-center gap-2 text-sm text-accent">
              <span className="size-1.5 rounded-full bg-accent animate-pulse-ring" /> Writing the plan…
            </div>
            <PrdView markdown={writing || ' '} />
          </div>
        ) : editing !== null ? (
          <textarea className={cx(inputClass, 'min-h-[32rem] font-mono text-[13px] leading-relaxed')} value={editing} onChange={(e) => setEditing(e.target.value)} aria-label="Edit the plan" />
        ) : view === 'changes' && detail?.diff ? (
          <pre className="overflow-auto text-[13px] leading-relaxed" data-testid="plan-diff">
            {detail.diff.filter((d) => d.op !== ' ' || d.line.startsWith('#')).map((d, i) => (
              <div key={i} className={cx('px-2', d.op === '+' && 'bg-success-soft text-success-soft-foreground', d.op === '-' && 'bg-danger-soft text-danger-soft-foreground line-through', d.op === ' ' && 'text-muted')}>
                {d.op === ' ' ? ' ' : d.op} {d.line}
              </div>
            ))}
          </pre>
        ) : current ? (
          <div data-testid="plan-prd"><PrdView markdown={current.prd} /></div>
        ) : (
          <Skeleton className="h-96" />
        )}
      </Card>

      {/* the controls */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        {writing !== null ? (
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-1.5 rounded-full bg-accent animate-pulse-ring" /> The planner is writing
            </div>
            <p className="mt-1 text-sm text-muted">
              It reads your conventions and decides the scope, the flows and the task order. A minute or two; the result is saved as a new version even if you leave this page.
            </p>
          </Card>
        ) : editing !== null ? (
          <Card>
            <div className="text-sm font-semibold">Editing by hand</div>
            <p className="mt-1 text-sm text-muted">Saving creates a new version; nothing is overwritten.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="sm" isDisabled={busy} onPress={() => void saveEdit()}>Save as new version</Button>
              <Button variant="ghost" size="sm" onPress={() => setEditing(null)}>Cancel</Button>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <div className="text-sm font-semibold">{current?.status === 'approved' ? 'This version is live' : 'Ready to build?'}</div>
              <p className="mt-1 text-sm text-muted">
                {detail?.check.ok
                  ? `${detail.check.tasks.length} tasks. Approving writes PRD.md to ${project.default_branch}.`
                  : detail
                    ? `This version ${detail.check.errors.join('; ')}.`
                    : 'Loading…'}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="primary" isDisabled={busy || !canApprove} onPress={() => void approve()} data-testid="plan-approve" fullWidth>
                  <CheckIcon className="size-4" /> {current?.status === 'approved' ? 'Approved' : `Approve version ${current?.version ?? ''}`}
                </Button>
                <Button variant="outline" isDisabled={busy || !current} onPress={() => setEditing(current?.prd ?? '')} fullWidth>
                  Edit by hand
                </Button>
              </div>
            </Card>

            <Card>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void generate({ instruction })
                }}
              >
                <label className="text-sm font-semibold" htmlFor="plan-refine">Refine with AI</label>
                <textarea
                  id="plan-refine"
                  className={cx(inputClass, 'mt-2 min-h-24 resize-y')}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Add a weekly digest email. Drop the admin area for now."
                  data-testid="plan-refine"
                />
                <Button type="submit" variant="secondary" size="sm" className="mt-2" isDisabled={busy || !instruction.trim()} fullWidth>
                  <SparklesIcon className="size-4" /> Revise the plan
                </Button>
              </form>
            </Card>
          </>
        )}

        <Card>
          <div className="mb-3 text-sm font-semibold">History</div>
          <ol className="relative flex flex-col gap-0.5 border-l border-border pl-4">
            {plans.map((p) => (
              <li key={p.version}>
                <button
                  type="button"
                  onClick={() => { setSelected(p.version); setEditing(null); setView('document') }}
                  className={cx('relative w-full rounded-lg px-2 py-1.5 text-left transition-colors', selected === p.version ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/60')}
                >
                  <span className={cx('absolute -left-[21px] top-3 size-2.5 rounded-full border-2 border-surface', p.status === 'approved' ? 'bg-success' : p.status === 'draft' ? 'bg-warning' : 'bg-surface-tertiary')} />
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">v{p.version}</span>
                    <span className="text-xs text-muted">{ago(p.created_at)}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {p.source === 'generated' ? 'Written by AI' : p.source === 'refined' ? `Refined: ${p.prompt ?? ''}` : 'Edited by hand'}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
