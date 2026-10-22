'use client'

import { useCallback, useState } from 'react'
import { Button } from '@heroui/react'
import { useApi, type Runner } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { RunnerCard } from '@/components/runners/runner-card'
import { EnrollDialog } from '@/components/runners/enroll-dialog'
import { PlusIcon, ServerIcon } from '@/components/ui/icons'

function newest(versions: Array<string | null>): string | null {
  return versions.filter((v): v is string => Boolean(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? null
}

export default function RunnersPage() {
  const api = useApi()
  const load = useCallback(() => api<{ runners: Runner[] }>('/api/runners').then((d) => d.runners), [api])
  const { data: runners, error, reload } = useData(load, { intervalMs: 5000 })
  const [enrolling, setEnrolling] = useState(false)

  return (
    <>
      <PageHeader
        title="Runners"
        description="The machines that build. Each runs the loop on your own hardware, and a job goes to whichever one is free."
        actions={
          <Button variant="primary" size="sm" onPress={() => setEnrolling(true)}>
            <PlusIcon className="size-4" /> Add runner
          </Button>
        }
      />
      {error && <p className="mb-4 text-sm text-danger" role="alert">{error}</p>}
      {!runners ? (
        <Skeleton className="h-40" />
      ) : runners.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ServerIcon />}
            title="No runners yet"
            action={<Button variant="primary" size="sm" onPress={() => setEnrolling(true)}>Add your first runner</Button>}
          >
            A runner is a Linux box with an NVIDIA GPU or a Mac. One command installs the toolchain and connects it here.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {runners.map((runner) => (
            <RunnerCard key={runner.id} runner={runner} newestCli={newest(runners.map((r) => r.cli_version))} onChanged={reload} />
          ))}
        </div>
      )}
      <EnrollDialog isOpen={enrolling} onOpenChange={setEnrolling} onEnrolled={reload} />
    </>
  )
}
