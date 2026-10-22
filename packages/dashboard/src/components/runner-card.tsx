'use client'

import { useCallback, useState } from 'react'
import NextLink from 'next/link'
import { Button, CardContent, CardHeader, CardRoot, Chip, Code } from '@heroui/react'
import { ago, money, useApi, type Runner } from '@/lib/api'
import { LogPane, useLiveLogs } from './live-logs'
import { ConfigEditor } from './config-editor'

const STATUS_COLOR: Record<string, 'accent' | 'success' | 'default'> = {
  running: 'accent',
  idle: 'success',
  offline: 'default',
}

export function RunnerCard({ runner, onChanged }: { runner: Runner; onChanged: () => void }) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<'logs' | 'settings' | null>(null)
  const logs = useLiveLogs(runner.id, onChanged)

  const status = runner.state?.status ?? 'offline'
  const running = status === 'running'

  const stop = useCallback(async () => {
    setBusy(true)
    try {
      await api(`/api/runners/${runner.id}/command`, {
        method: 'POST',
        body: JSON.stringify({ command: 'stop' }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [api, runner.id, onChanged])

  const revoke = useCallback(async () => {
    if (!confirm(`Revoke "${runner.name}"? Its token stops working immediately.`)) return
    setBusy(true)
    try {
      await api(`/api/runners/${runner.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [api, runner.id, runner.name, onChanged])

  const toggle = (next: 'logs' | 'settings') => {
    if (panel === 'logs') logs.stop()
    if (panel === next) {
      setPanel(null)
      return
    }
    setPanel(next)
    if (next === 'logs') void logs.start()
  }

  return (
    <CardRoot>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <Chip size="sm" color={STATUS_COLOR[status] ?? 'default'} data-testid={`status-${runner.id}`}>
          {status}
        </Chip>
        <span className="font-medium">{runner.name}</span>
        <span className="text-sm text-default-500">
          {running ? (
            <>
              {runner.state.runId ? (
                <NextLink href={`/runs/${runner.state.runId}`} className="underline">
                  {runner.state.project ?? 'run'}
                </NextLink>
              ) : (
                (runner.state.project ?? '—')
              )}
              {runner.state.iteration ? ` · iteration ${runner.state.iteration}` : ''}
              {` · ${money(runner.state.costUsd)}`}
            </>
          ) : (
            `last seen ${ago(runner.last_seen_at ?? runner.state?.lastSeenAt)}`
          )}
        </span>

        <div className="ml-auto flex gap-2">
          {running && (
            <Button
              size="sm"
              variant="danger"
              isDisabled={busy}
              onClick={() => void stop()}
              data-testid={`stop-${runner.id}`}
              aria-label={`Stop ${runner.name}`}
            >
              Stop
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle('logs')}
            data-testid={`logs-${runner.id}`}
            aria-label={`${panel === 'logs' ? 'Stop watching' : 'Watch'} logs for ${runner.name}`}
          >
            {panel === 'logs' ? 'Stop watching' : 'Live logs'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle('settings')}
            data-testid={`settings-${runner.id}`}
            aria-label={`Settings for ${runner.name}`}
          >
            Settings
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isDisabled={busy}
            onClick={() => void revoke()}
            data-testid={`revoke-${runner.id}`}
            aria-label={`Revoke ${runner.name}`}
          >
            Revoke
          </Button>
        </div>
      </CardHeader>

      {panel && (
        <CardContent className="flex flex-col gap-3">
          <Code>
            {`${runner.platform ?? 'unknown platform'} · CLI ${runner.cli_version ?? '?'} · conventions ${
              runner.conventions_ref ?? '?'
            }`}
          </Code>
          {panel === 'logs' && <LogPane lines={logs.lines} testId={`log-${runner.id}`} />}
          {panel === 'settings' && (
            <ConfigEditor
              initial={runner.config ?? {}}
              endpoint={`/api/runners/${runner.id}/config`}
              inheritsFrom="org default"
              onSaved={onChanged}
            />
          )}
        </CardContent>
      )}
    </CardRoot>
  )
}
