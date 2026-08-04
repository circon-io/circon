'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, CardContent, CardHeader, CardRoot, CardTitle, Chip, Spinner } from '@heroui/react'
import { useApi } from '@/lib/api'

interface Integration {
  id: string
  provider: string
  account_login: string | null
  revoked_at: string | null
}

interface Project {
  id: string
  slug: string
  status: string
  default_branch: string
  account_login: string | null
  integration_revoked: string | null
}

interface Repo {
  id: string
  fullName: string
  defaultBranch: string
  private: boolean
  connected: boolean
}

/**
 * Connecting GitHub, and turning a repository into a project.
 *
 * A project *is* a connected repository — there is no way to create one without
 * a repo behind it, which is what stops a job being queued for something the
 * runner cannot clone.
 */
export function Projects({ onChanged }: { onChanged: () => void }) {
  const api = useApi()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [i, p] = await Promise.all([
        api<{ integrations: Integration[] }>('/api/integrations'),
        api<{ projects: Project[] }>('/api/projects'),
      ])
      setIntegrations(i.integrations)
      setProjects(p.projects)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const connectGithub = async () => {
    try {
      const { url } = await api<{ url: string }>('/api/integrations/github/install-url')
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the GitHub install')
    }
  }

  const pickRepos = async (integrationId: string) => {
    setPicking(integrationId)
    setRepos(null)
    try {
      const { repositories } = await api<{ repositories: Repo[] }>(
        `/api/integrations/${integrationId}/repos`,
      )
      setRepos(repositories)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not list repositories')
      setPicking(null)
    }
  }

  const connectRepo = async (integrationId: string, repo: Repo) => {
    try {
      await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          integrationId,
          repoId: repo.id,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
        }),
      })
      setPicking(null)
      setRepos(null)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect that repository')
    }
  }

  const disconnect = async (project: Project) => {
    if (!confirm(`Disconnect ${project.slug}? Runs already made are kept.`)) return
    await api(`/api/projects/${project.id}`, { method: 'DELETE' })
    await load()
    onChanged()
  }

  const live = integrations.filter((i) => !i.revoked_at)

  return (
    <CardRoot>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <CardTitle>Projects</CardTitle>
        <div className="ml-auto">
          <Button
            variant={live.length ? 'outline' : 'primary'}
            size="sm"
            onClick={() => void connectGithub()}
            data-testid="connect-github"
            aria-label="Connect a GitHub account"
          >
            {live.length ? 'Connect another account' : 'Connect GitHub'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        {loading && <Spinner />}

        {!loading && live.length === 0 && (
          <p className="rounded-md border border-dashed border-default-300 p-6 text-center text-default-500">
            Connect a GitHub account to create your first project. A project is one
            repository — the agent clones it, works on a branch and opens a PR.
          </p>
        )}

        {projects.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="project-list">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-default-200 px-3 py-2"
              >
                <span className="font-mono text-sm">{project.slug.replace('__', '/')}</span>
                <Chip
                  size="sm"
                  color={project.status === 'active' && !project.integration_revoked ? 'success' : 'warning'}
                >
                  {project.integration_revoked ? 'disconnected' : project.status}
                </Chip>
                <span className="text-sm text-default-400">{project.default_branch}</span>
                <div className="ml-auto">
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => void disconnect(project)}
                    aria-label={`Disconnect ${project.slug}`}
                  >
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {live.map((integration) => (
          <div key={integration.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-default-600">
                {integration.account_login ?? integration.provider}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void pickRepos(integration.id)}
                data-testid={`add-project-${integration.id}`}
                aria-label={`Add a repository from ${integration.account_login ?? 'GitHub'}`}
              >
                Add repository
              </Button>
            </div>

            {picking === integration.id && (
              <div className="rounded-md border border-default-200 p-2">
                {!repos ? (
                  <Spinner />
                ) : repos.length === 0 ? (
                  <p className="p-2 text-sm text-default-500">
                    The installation can see no repositories. Grant it access on GitHub.
                  </p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
                    {repos.map((repo) => (
                      <li key={repo.id} className="flex items-center gap-2 px-1 py-0.5">
                        <span className="font-mono text-sm">{repo.fullName}</span>
                        {repo.private && (
                          <Chip size="sm" color="default">
                            private
                          </Chip>
                        )}
                        <div className="ml-auto">
                          {repo.connected ? (
                            <span className="text-sm text-default-400">connected</span>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void connectRepo(integration.id, repo)}
                              aria-label={`Connect ${repo.fullName}`}
                            >
                              Connect
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </CardRoot>
  )
}
