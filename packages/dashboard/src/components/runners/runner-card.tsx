'use client'

import { useState } from 'react'
import NextLink from 'next/link'
import { Button } from '@heroui/react'
import { ago, money, repoName, useApi, type MachineHealth, type Runner } from '@/lib/api'
import { Badge, Card, Mono, cx } from '../ui/primitives'
import { RunnerBadge } from '../ui/status'
import { Dialog } from '../ui/dialog'
import { ConfigForm } from '../config/config-form'
import { LogView } from '../runs/log-view'
import { useLiveLogs } from '../live-logs'
import { AlertIcon, AppleIcon, BranchIcon, CpuIcon, SettingsIcon, StopIcon, TerminalIcon } from '../ui/icons'

export function RunnerCard({ runner, newestCli, onChanged }: { runner: Runner; newestCli: string | null; onChanged: () => void }) {
  const api = useApi()
  const [logsOpen, setLogsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const logs = useLiveLogs(runner.id, onChanged)
  const status = runner.state?.status ?? 'offline'
  const mac = runner.platform?.startsWith('darwin')
  const outdated = Boolean(newestCli && runner.cli_version && runner.cli_version !== newestCli)

  const stop = async () => {
    await api(`/api/runners/${runner.id}/command`, { method: 'POST', body: JSON.stringify({ command: 'stop' }) })
    onChanged()
  }
  const revoke = async () => {
    if (!confirm(`Revoke "${runner.name}"? Its token stops working immediately.`)) return
    await api(`/api/runners/${runner.id}`, { method: 'DELETE' })
    onChanged()
  }
  const toggleLogs = () => {
    if (logsOpen) logs.stop()
    else void logs.start()
    setLogsOpen(!logsOpen)
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted">
          {mac ? <AppleIcon className="size-5" /> : <CpuIcon className="size-5" />}
        </div>
        <div className="min-w-[10rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{runner.name}</span>
            <RunnerBadge status={status} />
          </div>
          <div className="mt-1 text-sm text-muted">
            {status === 'running' && runner.state.project ? (
              <span className="inline-flex flex-wrap items-center gap-x-1.5">
                <NextLink href={runner.state.runId ? `/runs/${runner.state.runId}` : '#'} className="font-medium text-foreground hover:underline">
                  {repoName(runner.state.project)}
                </NextLink>
                <BranchIcon className="size-3" />
                <Mono className="text-xs">{(runner.state.branch ?? '').replace('circon/', '')}</Mono>
                <span>· iteration {runner.state.iteration ?? '—'} · {money(runner.state.costUsd)}</span>
              </span>
            ) : (
              <span>{mac ? 'macOS' : 'Linux'} · {status === 'offline' ? `last seen ${ago(runner.last_seen_at ?? runner.state?.lastSeenAt)}` : 'waiting for work'}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={outdated ? 'warning' : 'neutral'}>CLI {runner.cli_version ?? '?'}{outdated ? ' · update' : ''}</Badge>
          <Badge>conventions {runner.conventions_ref ?? '?'}</Badge>
          {runner.config?.iosRunnerMode && runner.config.iosRunnerMode !== 'none' && (
            <Badge tone="accent">iOS {runner.config.iosRunnerMode === 'device' ? 'USB device' : 'simulator'}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'running' && (
            <Button size="sm" variant="danger-soft" onPress={() => void stop()} aria-label={`Stop ${runner.name}`}>
              <StopIcon className="size-3.5" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onPress={toggleLogs} aria-label={`Logs for ${runner.name}`}>
            <TerminalIcon className="size-3.5" /> {logsOpen ? 'Hide logs' : 'Logs'}
          </Button>
          <Button size="sm" variant="outline" isIconOnly onPress={() => setSettingsOpen(true)} aria-label={`Settings for ${runner.name}`}>
            <SettingsIcon className="size-4" />
          </Button>
        </div>
      </div>
      {runner.state?.health && <HealthStrip health={runner.state.health} />}
      {logsOpen && (
        <div className="border-t border-separator p-5">
          <LogView lines={logs.lines} />
        </div>
      )}
      <Dialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        size="lg"
        title={`${runner.name} settings`}
        description="Overrides for this machine. Anything left empty follows the organization defaults, and a project's own settings win over these."
        footer={
          <Button size="sm" variant="danger-soft" onPress={() => void revoke()}>
            Revoke this runner
          </Button>
        }
      >
        <ConfigForm endpoint={`/api/runners/${runner.id}/config`} sections={['loops', 'agents', 'budgets']} inheritsFrom="org default" inDialog />
      </Dialog>
    </Card>
  )
}

/** Under this much free disk an Android system image or a model pull fails part-way. */
const LOW_DISK_GB = 20

function HealthStrip({ health }: { health: MachineHealth }) {
  const { diskFreeGb, diskTotalGb, gpu, loadPerCore, ollama } = health
  const lowDisk = diskFreeGb !== null && (diskFreeGb < LOW_DISK_GB || (diskTotalGb ? diskFreeGb / diskTotalGb < 0.1 : false))
  const items: Array<{ label: string; warn?: boolean }> = []
  if (diskFreeGb !== null) items.push({ label: `${Math.round(diskFreeGb)} GB free${diskTotalGb ? ` of ${Math.round(diskTotalGb)}` : ''}`, warn: lowDisk })
  if (gpu) items.push({ label: `${gpu.name.replace(/^NVIDIA (GeForce )?/, '')} · ${gpu.utilization}% · ${gpu.temperatureC}°C`, warn: gpu.temperatureC >= 85 })
  if (loadPerCore !== null) items.push({ label: `CPU ${Math.round(loadPerCore * 100)}%` })
  items.push({ label: ollama ? 'Ollama running' : 'Ollama stopped' })
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-separator px-5 py-2.5 text-xs text-muted">
      {items.map((item) => (
        <span key={item.label} className={cx('inline-flex items-center gap-1', item.warn && 'font-medium text-warning')}>
          {item.warn && <AlertIcon className="size-3.5" />}
          {item.label}
        </span>
      ))}
      <span className="ml-auto">checked {ago(health.checkedAt)}</span>
    </div>
  )
}
