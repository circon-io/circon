'use client'

import { useEffect, useState } from 'react'
import NextLink from 'next/link'
import { CardContent, CardHeader, CardRoot, CardTitle } from '@heroui/react'
import { useApi, type Project, type Run, type Runner } from '@/lib/api'

interface Step {
  label: string
  done: boolean
  hint: React.ReactNode
}

/**
 * The path from nothing to a first build, in the order it has to happen.
 * Hidden once everything is done: it is a guide, not a permanent fixture.
 */
export function Onboarding({ runners, runs }: { runners: Runner[]; runs: Run[] }) {
  const api = useApi()
  const [state, setState] = useState<{ integrations: number; projects: Project[] } | null>(null)

  useEffect(() => {
    Promise.all([api<{ integrations: Array<{ revoked_at: string | null }> }>('/api/integrations'), api<{ projects: Project[] }>('/api/projects')])
      .then(([i, p]) => setState({ integrations: i.integrations.filter((x) => !x.revoked_at).length, projects: p.projects }))
      .catch(() => setState(null))
  }, [api, runners.length, runs.length])

  if (!state) return null
  const firstProject = state.projects[0]
  const planned = state.projects.find((p) => p.approved_plan)
  const steps: Step[] = [
    { label: 'Connect GitHub', done: state.integrations > 0, hint: 'Install the circon GitHub App on your account or organization, under Projects below.' },
    { label: 'Add a repository', done: state.projects.length > 0, hint: 'Pick the repository the app will live in. It can be empty.' },
    {
      label: 'Describe it and approve the plan',
      done: Boolean(planned),
      hint: firstProject ? (
        <NextLink href={`/projects/${firstProject.id}`} className="underline">
          Open {firstProject.slug.replace('__', '/')} and describe what to build
        </NextLink>
      ) : (
        'Describe the idea; the AI writes the plan, you refine and approve it.'
      ),
    },
    { label: 'Connect a runner', done: runners.length > 0, hint: 'Create an enrollment token below and run the command it shows on your machine.' },
    {
      label: 'Start the first build',
      done: runs.length > 0,
      hint: planned ? (
        <NextLink href={`/projects/${planned.id}`} className="underline">
          Start a build of {planned.slug.replace('__', '/')}
        </NextLink>
      ) : (
        'Once a plan is approved and a runner is connected.'
      ),
    },
  ]
  if (steps.every((s) => s.done)) return null
  const next = steps.findIndex((s) => !s.done)

  return (
    <CardRoot data-testid="onboarding">
      <CardHeader>
        <CardTitle>From idea to a running build</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2 text-sm">
          {steps.map((step, i) => (
            <li key={step.label} className="flex gap-3">
              <span aria-hidden className={step.done ? 'text-success' : i === next ? 'text-foreground' : 'text-default-400'}>
                {step.done ? '✓' : `${i + 1}.`}
              </span>
              <div>
                <div className={step.done ? 'text-default-500 line-through' : i === next ? 'font-medium' : 'text-default-500'}>
                  {step.label}
                </div>
                {i === next && <div className="text-default-500">{step.hint}</div>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </CardRoot>
  )
}
