'use client'

import { useCallback, useEffect, useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import { Chip, Spinner } from '@heroui/react'
import { RunnerCard } from '@/components/runner-card'
import { EnrollRunner } from '@/components/enroll-runner'
import { QueueJob } from '@/components/queue-job'
import { RunsTable } from '@/components/runs-table'
import { BillingCard } from '@/components/billing-card'
import { Projects } from '@/components/projects'
import { money, useApi, type Run, type Runner } from '@/lib/api'

export default function DashboardPage() {
  const api = useApi()
  const [runners, setRunners] = useState<Runner[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [spend, setSpend] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumped when a project is connected or removed, to remount the queue form's list.
  const [projectEpoch, setProjectEpoch] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [runnerData, runData] = await Promise.all([
        api<{ runners: Runner[] }>('/api/runners'),
        api<{ runs: Run[]; spentLast24h: number }>('/api/runs?limit=25'),
      ])
      setRunners(runnerData.runners)
      setRuns(runData.runs)
      setSpend(runData.spentLast24h)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the control plane')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
    // Each runner's socket carries its own live logs; this only keeps the list
    // and the cost figure current, so a slow interval is plenty.
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [refresh])

  const online = runners.filter((r) => r.state?.status !== 'offline').length

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">circon</h1>
        {!loading && (
          <>
            <Chip size="sm" data-testid="runner-count">
              {runners.length} runner{runners.length === 1 ? '' : 's'}, {online} online
            </Chip>
            <Chip size="sm" color="warning" data-testid="spend-24h">
              {money(spend)} last 24h
            </Chip>
          </>
        )}
        <div className="ml-auto">
          <UserButton />
        </div>
      </header>

      {error && (
        <p className="text-small text-danger" role="alert" data-testid="error">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-medium font-medium">Runners</h2>
        {loading ? (
          <Spinner size="sm" aria-label="Loading runners" />
        ) : runners.length === 0 ? (
          <p className="rounded-medium border border-dashed border-default-300 p-8 text-center text-default-500">
            No runners yet. Create an enrollment token below, then run that command on the machine.
          </p>
        ) : (
          runners.map((runner) => (
            <RunnerCard key={runner.id} runner={runner} onChanged={() => void refresh()} />
          ))
        )}
      </section>

      <Projects
        onChanged={() => {
          setProjectEpoch((n) => n + 1)
          void refresh()
        }}
      />

      <BillingCard />

      <div className="grid gap-4 md:grid-cols-2">
        <EnrollRunner onEnrolled={() => void refresh()} />
        <QueueJob key={projectEpoch} onQueued={() => void refresh()} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-medium font-medium">Recent runs</h2>
        <RunsTable runs={runs} />
      </section>
    </main>
  )
}
