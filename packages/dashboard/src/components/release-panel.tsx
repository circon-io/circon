'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Link, Spinner } from '@heroui/react'
import { ago, money, useApi } from '@/lib/api'

interface Report {
  pending: { number: number; url: string; title: string; body: string } | null
  lastRelease: { approved_at: string; pr_url: string; title: string | null } | null
  runs: Array<{ id: string; branch: string | null; pr_url: string | null; finished_at: string; cost_usd: number; commits: number; screenshots: string[] }>
  costUsd: number
  devBuild: { status: string; startedAt: string | null; artifacts: Array<{ name: string; url: string }> } | null
}

/**
 * Gate 2, for whoever owns the product: what changed, what it looks like, a
 * build to install — and one button. No diff anywhere on this page, by design.
 */
export function ReleasePanel({ projectId }: { projectId: string }) {
  const api = useApi()
  const [report, setReport] = useState<Report | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      api<Report>(`/api/projects/${projectId}/release`)
        .then(setReport)
        .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load the release')),
    [api, projectId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const approve = async () => {
    if (!report?.pending) return
    if (!confirm('Release this to users? The version PR is merged and the release workflow ships it.')) return
    setBusy(true)
    try {
      await api(`/api/projects/${projectId}/release/approve`, { method: 'POST' })
      setMessage('Released. The release workflow is shipping it now.')
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not release')
    } finally {
      setBusy(false)
    }
  }

  if (!report) return message ? <p className="text-sm text-danger">{message}</p> : <Spinner size="sm" aria-label="Loading release" />

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-default-500">
        {report.lastRelease ? `Last release ${ago(report.lastRelease.approved_at)}.` : 'Nothing released yet.'}
      </p>

      {!report.pending ? (
        <p className="text-sm">Nothing is waiting to be released — merge a run&apos;s pull request first.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">What changes for users</h3>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-default-100 p-3 text-sm" data-testid="release-changelog">
              {report.pending.body || report.pending.title}
            </pre>
          </section>

          {report.runs.some((r) => r.screenshots.length) && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">What it looks like</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {report.runs.flatMap((r) =>
                  r.screenshots.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-default-200">
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote GitHub images, not optimizable */}
                      <img src={src} alt={`Screenshot from ${r.branch ?? 'a run'}`} className="w-full" loading="lazy" />
                    </a>
                  )),
                )}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-1 text-sm">
            <h3 className="font-medium">Try it</h3>
            {report.devBuild ? (
              <>
                <span className="text-default-500">
                  Latest dev build: {report.devBuild.status}
                  {report.devBuild.startedAt ? `, ${ago(report.devBuild.startedAt)}` : ''}
                </span>
                {report.devBuild.artifacts.map((a) => (
                  <Link key={a.url} href={a.url} target="_blank" rel="noreferrer">
                    {a.name}
                  </Link>
                ))}
              </>
            ) : (
              <span className="text-default-500">
                No mobile dev build — add CODEMAGIC_API_TOKEN and CODEMAGIC_APP_ID to this project&apos;s secrets.
              </span>
            )}
          </section>

          <p className="text-sm text-default-500">
            {report.runs.length} run{report.runs.length === 1 ? '' : 's'} merged since the last release · {money(report.costUsd)}
          </p>

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" isDisabled={busy} onClick={() => void approve()} aria-label="Release to users" data-testid="release-approve">
              Release to users
            </Button>
            <Link href={report.pending.url} target="_blank" rel="noreferrer" className="text-sm">
              version PR #{report.pending.number}
            </Link>
          </div>
        </>
      )}
      {message && <p className="text-sm text-default-500" role="status">{message}</p>}
    </div>
  )
}
