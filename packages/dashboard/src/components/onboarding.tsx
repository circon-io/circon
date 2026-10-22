'use client'

import NextLink from 'next/link'
import { repoName, type Project, type Run, type Runner } from '@/lib/api'
import { Card, cx } from './ui/primitives'
import { CheckIcon, ChevronRightIcon } from './ui/icons'

interface Step {
  label: string
  detail: string
  done: boolean
  href: string
  action: string
}

/**
 * The path from nothing to a first build, in the order it has to happen.
 * It disappears once everything is done: a guide, not furniture.
 */
export function Onboarding({
  integrations,
  projects,
  runners,
  runs,
}: {
  integrations: number
  projects: Project[]
  runners: Runner[]
  runs: Run[]
}) {
  const first = projects[0]
  const planned = projects.find((p) => p.approved_plan)
  const steps: Step[] = [
    { label: 'Connect GitHub', detail: 'Install the circon app on your account or organization.', done: integrations > 0, href: '/projects', action: 'Connect' },
    { label: 'Add a repository', detail: 'The repository the app will live in. It can be empty.', done: projects.length > 0, href: '/projects', action: 'Add repository' },
    {
      label: 'Plan it',
      detail: 'Describe the idea; the AI writes the plan, you refine and approve it.',
      done: Boolean(planned),
      href: first ? `/projects/${first.id}?tab=plan` : '/projects',
      action: first ? `Plan ${repoName(first.slug)}` : 'Plan',
    },
    { label: 'Connect a runner', detail: 'Enroll the machine that builds, with one command.', done: runners.length > 0, href: '/runners', action: 'Add runner' },
    { label: 'Start the first build', detail: 'The runner scaffolds the project and works through the plan.', done: runs.length > 0, href: planned ? `/projects/${planned.id}` : '/projects', action: 'Start build' },
  ]
  if (steps.every((s) => s.done)) return null
  const next = steps.findIndex((s) => !s.done)
  const current = steps[next]
  const done = steps.filter((s) => s.done).length

  return (
    <Card className="overflow-hidden p-0" padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-separator px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">From idea to a running build</h2>
          <p className="mt-0.5 text-sm text-muted">{done} of {steps.length} done</p>
        </div>
        {current && (
          <NextLink
            href={current.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {current.action}
            <ChevronRightIcon className="size-3.5" />
          </NextLink>
        )}
      </div>
      <ol className="grid sm:grid-cols-5">
        {steps.map((step, i) => (
          <li key={step.label} className={cx('border-separator px-5 py-4 sm:border-l sm:first:border-l-0', i === next && 'bg-accent-soft/40')}>
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                  step.done ? 'bg-success text-success-foreground' : i === next ? 'bg-accent text-accent-foreground' : 'bg-surface-tertiary text-muted',
                )}
              >
                {step.done ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              <span className={cx('text-sm font-medium', step.done && 'text-muted line-through')}>{step.label}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}
