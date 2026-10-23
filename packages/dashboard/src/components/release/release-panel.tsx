'use client'

import { useCallback, useState } from 'react'
import { Button } from '@heroui/react'
import { ago, money, useApi } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, CardHeader, EmptyState, Notice, Skeleton } from '../ui/primitives'
import { FindingsList } from '../runs/findings'
import { PrdView } from '../plan/prd-view'
import { ExternalIcon, PhoneIcon, RocketIcon, ShieldIcon } from '../ui/icons'

interface Report {
  pending: { number: number; url: string; title: string; body: string } | null
  lastRelease: { approved_at: string; pr_url: string; title: string | null } | null
  runs: Array<{ id: string; branch: string | null; screenshots: string[]; cost_usd: number; audit_findings: string[] | null }>
  costUsd: number
  devBuild: { status: string; startedAt: string | null; artifacts: Array<{ name: string; url: string }> } | null
}

/**
 * Gate 2, for whoever owns the product: what changes for users, what it looks
 * like, a build to try — and one button. No diff anywhere, by design.
 */
export function ReleasePanel({ projectId }: { projectId: string }) {
  const api = useApi()
  const load = useCallback(() => api<Report>(`/api/projects/${projectId}/release`), [api, projectId])
  const { data, error, reload } = useData(load)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const release = async () => {
    if (!confirm('Release this to users? The version PR is merged and the release workflow ships it.')) return
    setBusy(true)
    try {
      await api(`/api/projects/${projectId}/release/approve`, { method: 'POST' })
      setMessage('Released. The release workflow is deploying the API and web app and starting the store builds.')
      reload()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not release')
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <Notice tone="danger">{error}</Notice>
  if (!data) return <Skeleton className="h-80" />

  if (!data.pending) {
    return (
      <Card>
        <EmptyState icon={<RocketIcon />} title="Nothing waiting to be released">
          {data.lastRelease ? `The last release went out ${ago(data.lastRelease.approved_at)}. ` : ''}
          Merge a run&apos;s pull request and its changes queue up here.
        </EmptyState>
      </Card>
    )
  }

  const shots = data.runs.flatMap((r) => r.screenshots)
  const audited = data.runs.filter((r) => r.audit_findings !== null)
  const auditFindings = [...new Set(audited.flatMap((r) => r.audit_findings ?? []))]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="What changes for users" description={data.lastRelease ? `Since the release ${ago(data.lastRelease.approved_at)}` : 'The first release'} />
          <div data-testid="release-changelog"><PrdView markdown={data.pending.body || data.pending.title} /></div>
        </Card>
        {shots.length > 0 && (
          <Card>
            <CardHeader title="What it looks like" description="Captured after the feedback loops passed." />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shots.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote GitHub images */}
                  <img src={src} alt="Screenshot from a run" className="w-full" loading="lazy" />
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        {message && <Notice tone="success">{message}</Notice>}
        <Card>
          <div className="text-sm font-semibold">Release to users</div>
          <p className="mt-1 text-sm text-muted">
            {data.runs.length} run{data.runs.length === 1 ? '' : 's'} merged · {money(data.costUsd)} in agent spend
          </p>
          <Button variant="primary" className="mt-4" fullWidth isDisabled={busy} onPress={() => void release()} data-testid="release-approve">
            <RocketIcon className="size-4" /> Release
          </Button>
          <a href={data.pending.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted hover:text-foreground">
            Version PR #{data.pending.number} <ExternalIcon className="size-3" />
          </a>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldIcon className="size-4 text-muted" /> Security audit</div>
          {audited.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No run in this release finished its plan, so none was audited.</p>
          ) : auditFindings.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              <Badge tone="success">Nothing found</Badge>
              <span className="ml-2">in {audited.length} of {data.runs.length} run{data.runs.length === 1 ? '' : 's'}</span>
            </p>
          ) : (
            <div className="mt-3" data-testid="release-audit"><FindingsList findings={auditFindings} /></div>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm font-semibold"><PhoneIcon className="size-4 text-muted" /> Try it on a phone</div>
          {data.devBuild ? (
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Dev build {data.devBuild.status}{data.devBuild.startedAt ? `, ${ago(data.devBuild.startedAt)}` : ''}</span>
              {data.devBuild.artifacts.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{a.name}</a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Add CODEMAGIC_API_TOKEN and CODEMAGIC_APP_ID to this project&apos;s secrets to offer a build here.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
