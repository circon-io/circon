'use client'

import { useCallback, useState } from 'react'
import { Button } from '@heroui/react'
import { useApi } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge, Card, CardHeader, Skeleton, cx } from '../ui/primitives'
import { DollarIcon } from '../ui/icons'

interface Billing {
  plan: { id: string; name: string; priceLabel: string }
  status: string
  limits: { runners: number; projects?: number; queuedJobs: number; runHistoryDays: number; planGenerations?: number }
  usage: { runners: number }
  hasSubscription: boolean
  plans: Array<{ id: string; name: string; priceLabel: string; limits: { runners: number } }>
}

/** Plan, usage and the way up. "3 of 10", never a bare refusal. */
export function BillingPanel() {
  const api = useApi()
  const load = useCallback(() => api<Billing>('/api/billing'), [api])
  const { data } = useData(load)
  const [busy, setBusy] = useState(false)

  const go = async (path: string, body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const { url } = await api<{ url: string }>(path, { method: 'POST', body: JSON.stringify({ ...body, returnTo: window.location.href }) })
      window.location.href = url
    } catch {
      setBusy(false)
    }
  }

  if (!data) return <Skeleton className="h-48" />
  const used = data.usage.runners / Math.max(1, data.limits.runners)
  return (
    <Card>
      <CardHeader
        icon={<DollarIcon />}
        title={<span className="flex items-center gap-2">Plan <Badge tone="accent">{data.plan.name}</Badge></span>}
        description={data.plan.priceLabel}
        actions={
          data.hasSubscription ? (
            <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void go('/api/billing/portal', {})}>Manage billing</Button>
          ) : (
            <Button size="sm" variant="primary" isDisabled={busy} onPress={() => void go('/api/billing/checkout', { plan: 'pro' })}>Upgrade to Pro</Button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex justify-between text-sm"><span className="text-muted">Runners</span><span className="tabular-nums">{data.usage.runners} of {data.limits.runners}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
            <div className={cx('h-full rounded-full', used >= 1 ? 'bg-warning' : 'bg-accent')} style={{ width: `${Math.min(100, used * 100)}%` }} />
          </div>
        </div>
        <div className="text-sm"><div className="text-muted">Queued jobs</div><div className="mt-1 tabular-nums">{data.limits.queuedJobs}</div></div>
        <div className="text-sm"><div className="text-muted">Run history</div><div className="mt-1 tabular-nums">{data.limits.runHistoryDays} days</div></div>
      </div>
    </Card>
  )
}
