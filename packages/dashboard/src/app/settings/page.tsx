'use client'

import { useEffect, useState } from 'react'
import { CardContent, CardHeader, CardRoot, CardTitle, Spinner } from '@heroui/react'
import { AppShell } from '@/components/app-shell'
import { ConfigEditor } from '@/components/config-editor'
import { SecretsEditor } from '@/components/secrets-editor'
import { useApi, type RunConfig } from '@/lib/api'

/**
 * Org-wide defaults. Every runner and project starts from these, and overrides
 * only what it sets itself.
 */
export default function SettingsPage() {
  const api = useApi()
  const [config, setConfig] = useState<RunConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ config: RunConfig }>('/api/settings')
      .then((data) => setConfig(data.config))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load settings'))
  }, [api])

  return (
    <AppShell>
      <CardRoot>
        <CardHeader className="flex flex-col items-start gap-1">
          <CardTitle>Organization defaults</CardTitle>
          <p className="text-sm text-default-500">
            Applied to every run. A runner&apos;s settings override these, and a project&apos;s
            override both. Empty fields fall back to the CLI&apos;s own defaults.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {!config && !error && <Spinner size="sm" aria-label="Loading settings" />}
          {config && <ConfigEditor initial={config} endpoint="/api/settings" inheritsFrom="CLI default" />}
        </CardContent>
      </CardRoot>
      <CardRoot>
        <CardHeader className="flex flex-col items-start gap-1">
          <CardTitle>Runner secrets</CardTitle>
          <p className="text-sm text-default-500">
            Given to every runner in the organization for each job — for example the API keys agents
            bill to. Change one here and every runner uses the new value from its next job.
          </p>
        </CardHeader>
        <CardContent>
          <SecretsEditor scope="machine" />
        </CardContent>
      </CardRoot>
    </AppShell>
  )
}
