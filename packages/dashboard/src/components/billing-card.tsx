'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, CardContent, CardHeader, CardRoot, CardTitle, Chip } from '@heroui/react'
import { useApi } from '@/lib/api'

interface Billing {
  plan: { id: string; name: string; priceLabel: string }
  status: string
  limits: { runners: number; queuedJobs: number; runHistoryDays: number }
  usage: { runners: number }
  hasSubscription: boolean
  plans: Array<{ id: string; name: string; priceLabel: string; limits: { runners: number } }>
}

/**
 * Plan, usage and the upgrade path.
 *
 * Usage is shown as "1 of 1" rather than a bare refusal, because the useful
 * information when you hit a limit is how close you were and what lifts it.
 */
export function BillingCard() {
  const api = useApi()
  const [billing, setBilling] = useState<Billing | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setBilling(await api<Billing>('/api/billing'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load billing')
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const go = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const { url } = await api<{ url: string }>(path, {
          method: 'POST',
          body: JSON.stringify({ ...body, returnTo: window.location.origin }),
        })
        window.location.href = url
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach Stripe')
        setBusy(false)
      }
    },
    [api],
  )

  if (!billing) {
    return (
      <CardRoot>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-default-500">{error ?? 'Loading…'}</p>
        </CardContent>
      </CardRoot>
    )
  }

  const atLimit = billing.usage.runners >= billing.limits.runners
  const canUpgrade = billing.plan.id === 'basic'

  return (
    <CardRoot>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <CardTitle>Plan</CardTitle>
        <Chip size="sm" color={billing.plan.id === 'pro' ? 'accent' : 'default'} data-testid="plan">
          {billing.plan.name}
        </Chip>
        {billing.status !== 'active' && (
          <Chip size="sm" color="warning" data-testid="plan-status">
            {billing.status}
          </Chip>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-6 text-sm">
          <span data-testid="usage-runners">
            <span className={atLimit ? 'text-warning' : ''}>
              {billing.usage.runners} of {billing.limits.runners}
            </span>{' '}
            <span className="text-default-500">runners</span>
          </span>
          <span className="text-default-500">{billing.limits.queuedJobs} queued jobs</span>
          <span className="text-default-500">{billing.limits.runHistoryDays} days of history</span>
        </div>

        {atLimit && canUpgrade && (
          <p className="text-sm text-warning" role="status">
            You are at the {billing.plan.name} runner limit. Upgrading to Pro raises it to{' '}
            {billing.plans.find((p) => p.id === 'pro')?.limits.runners ?? 10}.
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          {canUpgrade && (
            <Button
              variant="primary"
              size="sm"
              isDisabled={busy}
              onClick={() => void go('/api/billing/checkout', { plan: 'pro' })}
              data-testid="upgrade"
              aria-label="Upgrade to Pro"
            >
              {busy ? 'Opening Stripe…' : 'Upgrade to Pro'}
            </Button>
          )}
          {billing.hasSubscription && (
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy}
              onClick={() => void go('/api/billing/portal', {})}
              data-testid="manage-billing"
              aria-label="Manage billing"
            >
              Manage billing
            </Button>
          )}
        </div>
      </CardContent>
    </CardRoot>
  )
}
