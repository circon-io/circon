'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@heroui/react'
import { useApi } from '@/lib/api'
import { Dialog } from '../ui/dialog'
import { Badge, EmptyState, Skeleton, cx, inputClass } from '../ui/primitives'
import { GithubIcon } from '../ui/icons'

interface Integration {
  id: string
  account_login: string | null
  revoked_at: string | null
}

interface Repo {
  id: string
  fullName: string
  defaultBranch: string
  private: boolean
  connected: boolean
}

/**
 * Turning a repository into a project. A project *is* a connected repository:
 * there is no way to create one without a repo behind it, which is what stops a
 * build being queued for something the runner cannot clone.
 */
export function ConnectDialog({ isOpen, onOpenChange, onConnected }: { isOpen: boolean; onOpenChange: (open: boolean) => void; onConnected: () => void }) {
  const api = useApi()
  const [integrations, setIntegrations] = useState<Integration[] | null>(null)
  const [account, setAccount] = useState<string>('')
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    api<{ integrations: Integration[] }>('/api/integrations')
      .then(({ integrations: rows }) => {
        const live = rows.filter((i) => !i.revoked_at)
        setIntegrations(live)
        setAccount((current) => current || live[0]?.id || '')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load accounts'))
  }, [api, isOpen])

  useEffect(() => {
    if (!account) return
    api<{ repositories: Repo[] }>(`/api/integrations/${account}/repos`)
      .then(({ repositories }) => setRepos(repositories))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not list repositories'))
  }, [api, account])

  const installGithub = useCallback(async () => {
    try {
      const { url } = await api<{ url: string }>('/api/integrations/github/install-url')
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the GitHub install')
    }
  }, [api])

  const connect = async (repo: Repo) => {
    try {
      await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ integrationId: account, repoId: repo.id, fullName: repo.fullName, defaultBranch: repo.defaultBranch }),
      })
      onConnected()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect that repository')
    }
  }

  const shown = (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      title="Connect a repository"
      description="The agent clones it, works on a branch per run and opens a pull request. It can be an empty repository."
      footer={
        <Button variant="ghost" size="sm" onPress={() => void installGithub()}>
          <GithubIcon className="size-4" /> {integrations?.length ? 'Connect another GitHub account' : 'Connect GitHub'}
        </Button>
      }
    >
      {!integrations ? (
        <Skeleton className="h-40" />
      ) : integrations.length === 0 ? (
        <EmptyState
          icon={<GithubIcon />}
          title="Connect GitHub first"
          action={<Button variant="primary" size="sm" onPress={() => void installGithub()}><GithubIcon className="size-4" /> Connect GitHub</Button>}
        >
          Install the circon app on your account or organization. You choose which repositories it can see.
        </EmptyState>
      ) : (
        <>
          <div className="flex gap-2">
            {integrations.length > 1 && (
              <select className={cx(inputClass, 'w-48')} value={account} onChange={(e) => { setAccount(e.target.value); setRepos(null) }} aria-label="GitHub account">
                {integrations.map((i) => (
                  <option key={i.id} value={i.id}>{i.account_login ?? 'GitHub'}</option>
                ))}
              </select>
            )}
            <input className={inputClass} placeholder="Filter repositories" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter repositories" />
          </div>
          {!repos ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="max-h-80 divide-y divide-separator overflow-auto rounded-lg border border-border">
              {shown.length === 0 && <li className="p-4 text-sm text-muted">No repositories match. Grant the app access to more on GitHub.</li>}
              {shown.map((repo) => (
                <li key={repo.id} className="flex items-center gap-3 px-3 py-2.5">
                  <GithubIcon className="size-4 text-muted" />
                  <span className="flex-1 truncate text-sm font-medium">{repo.fullName}</span>
                  {repo.private && <Badge>Private</Badge>}
                  {repo.connected ? (
                    <span className="text-xs text-muted">Connected</span>
                  ) : (
                    <Button size="sm" variant="secondary" onPress={() => void connect(repo)}>Connect</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  )
}
