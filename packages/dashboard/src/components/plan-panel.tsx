'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Chip, Link, Spinner } from '@heroui/react'
import { ago, useApi, useEventStream, type PlanCheck, type PlanSummary, type Project } from '@/lib/api'

interface PlanDetail {
  plan: PlanSummary & { prd: string }
  check: PlanCheck
  diff: Array<{ op: ' ' | '+' | '-'; line: string }> | null
}

const textarea =
  'w-full rounded-md border border-default-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-default-500'

/**
 * Idea → plan → approval.
 *
 * Every generation, refinement and hand edit becomes a new version, so the
 * history is a list of diffs rather than something overwritten. Approving a
 * version writes it to the repository as PRD.md; runners only ever read it
 * from there.
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
  const [showDiff, setShowDiff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const preview = useRef<HTMLPreElement>(null)

  const loadPlans = useCallback(
    () =>
      api<{ plans: PlanSummary[] }>(`/api/projects/${project.id}/plans`)
        .then(({ plans: rows }) => {
          setPlans(rows)
          setSelected((current) => current ?? rows[0]?.version ?? null)
        })
        .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load plans')),
    [api, project.id],
  )

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  useEffect(() => {
    if (selected === null) return
    api<PlanDetail>(`/api/projects/${project.id}/plans/${selected}`)
      .then(setDetail)
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load the plan'))
  }, [api, project.id, selected])

  useEffect(() => {
    if (preview.current) preview.current.scrollTop = preview.current.scrollHeight
  }, [writing])

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
          setMessage(
            check && !check.ok
              ? `Version ${version} needs attention before it can be approved: ${check.errors.join('; ')}.`
              : `Version ${version} is ready to review.`,
          )
        }
        if (event === 'error') setMessage(String(data['message'] ?? 'The planner failed.'))
      })
      await loadPlans()
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The planner failed.')
    } finally {
      setWriting(null)
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    if (editing === null) return
    setBusy(true)
    try {
      const saved = await api<{ version: number; check: PlanCheck }>(`/api/projects/${project.id}/plans`, {
        method: 'POST',
        body: JSON.stringify({ prd: editing }),
      })
      setEditing(null)
      setSelected(saved.version)
      setMessage(saved.check.ok ? `Saved as version ${saved.version}.` : `Saved as version ${saved.version}: ${saved.check.errors.join('; ')}.`)
      await loadPlans()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!detail) return
    if (!confirm(`Approve version ${detail.plan.version}? It is written to ${project.slug.replace('__', '/')} as PRD.md.`)) return
    setBusy(true)
    try {
      const result = await api<{ kind: 'committed' | 'pull-request'; sha?: string; url?: string }>(
        `/api/projects/${project.id}/plans/${detail.plan.version}/approve`,
        { method: 'POST' },
      )
      setMessage(
        result.kind === 'committed'
          ? 'Approved and committed to the default branch. Runners pick it up from their next iteration.'
          : 'The default branch is protected, so a pull request was opened. Merge it to let runners build from it.',
      )
      await loadPlans()
      setSelected(detail.plan.version)
      onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not approve')
    } finally {
      setBusy(false)
    }
  }

  if (plans === null) return <Spinner size="sm" aria-label="Loading plans" />

  // ---- no plan yet: describe the idea -----------------------------------------
  if (plans.length === 0 && writing === null) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void generate({ idea })
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">What do you want to build?</span>
          <span className="text-default-500">
            Describe it the way you would to a developer: who it is for, what they do with it, what
            matters most. The plan follows the project conventions, so you do not need to name a stack.
          </span>
          <textarea
            className={textarea}
            rows={8}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A shared shopping list for a household. Anyone can add items from their phone…"
            aria-label="Describe the idea"
            data-testid="plan-idea"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" size="sm" isDisabled={busy || idea.trim().length < 20} aria-label="Write the plan">
            Write the plan
          </Button>
          {message && <span className="text-sm text-default-500">{message}</span>}
        </div>
      </form>
    )
  }

  const current = detail?.plan
  const canApprove = Boolean(current && detail?.check.ok && current.status !== 'approved')

  return (
    <div className="flex flex-col gap-4">
      {/* versions */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-default-500">Version</span>
        <select
          className="rounded-md border border-default-300 bg-transparent px-2 py-1"
          value={selected ?? ''}
          onChange={(e) => {
            setSelected(Number(e.target.value))
            setEditing(null)
          }}
          aria-label="Plan version"
          data-testid="plan-version"
        >
          {plans.map((p) => (
            <option key={p.version} value={p.version}>
              v{p.version} · {p.source} · {ago(p.created_at)}
              {p.status === 'approved' ? ' · approved' : ''}
            </option>
          ))}
        </select>
        {current && (
          <Chip size="sm" color={current.status === 'approved' ? 'success' : 'default'}>
            {current.status}
          </Chip>
        )}
        {current?.pr_url && (
          <Link href={current.pr_url} target="_blank" rel="noreferrer">
            pull request
          </Link>
        )}
        {detail?.diff && (
          <label className="ml-auto flex items-center gap-1">
            <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} aria-label="Show changes" />
            changes since v{(current?.version ?? 1) - 1}
          </label>
        )}
      </div>

      {current?.prompt && (
        <p className="text-sm text-default-500">
          {current.source === 'refined' ? 'Change requested: ' : 'Idea: '}
          {current.prompt.length > 300 ? `${current.prompt.slice(0, 300)}…` : current.prompt}
        </p>
      )}

      {/* the document */}
      {writing !== null ? (
        <pre ref={preview} className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-default-100 p-3 text-sm" aria-live="polite">
          {writing || 'Thinking about the plan…'}
        </pre>
      ) : editing !== null ? (
        <textarea className={`${textarea} font-mono`} rows={24} value={editing} onChange={(e) => setEditing(e.target.value)} aria-label="Edit the plan" />
      ) : showDiff && detail?.diff ? (
        <pre className="max-h-[32rem] overflow-auto rounded-md bg-default-100 p-3 text-sm" data-testid="plan-diff">
          {detail.diff.map((d, i) => (
            <div key={i} className={d.op === '+' ? 'text-success' : d.op === '-' ? 'text-danger line-through' : 'text-default-500'}>
              {d.op} {d.line}
            </div>
          ))}
        </pre>
      ) : (
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-default-100 p-3 text-sm" data-testid="plan-prd">
          {current?.prd ?? ''}
        </pre>
      )}

      {detail && !detail.check.ok && writing === null && (
        <ul className="list-inside list-disc text-sm text-warning" role="alert">
          {detail.check.errors.map((e) => (
            <li key={e}>This version {e}.</li>
          ))}
        </ul>
      )}
      {detail?.check.ok && writing === null && editing === null && (
        <p className="text-sm text-default-500">{detail.check.tasks.length} tasks in the backlog.</p>
      )}

      {/* actions */}
      {editing !== null ? (
        <div className="flex gap-2">
          <Button variant="primary" size="sm" isDisabled={busy} onClick={() => void saveEdit()} aria-label="Save as a new version">
            Save as new version
          </Button>
          <Button variant="tertiary" size="sm" onClick={() => setEditing(null)} aria-label="Cancel editing">
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void generate({ instruction })
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Refine</span>
              <textarea
                className={textarea}
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Add a weekly digest email. Drop the admin area for now."
                aria-label="What to change"
                data-testid="plan-refine"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="outline" size="sm" isDisabled={busy || !instruction.trim()} aria-label="Revise the plan">
                Revise
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={busy || !current}
                onClick={() => setEditing(current?.prd ?? '')}
                aria-label="Edit by hand"
              >
                Edit by hand
              </Button>
              <Button
                variant="primary"
                size="sm"
                isDisabled={busy || !canApprove}
                onClick={() => void approve()}
                aria-label="Approve this version"
                data-testid="plan-approve"
              >
                Approve v{current?.version}
              </Button>
            </div>
          </form>
        </>
      )}

      {message && <p className="text-sm text-default-500" role="status">{message}</p>}
    </div>
  )
}
