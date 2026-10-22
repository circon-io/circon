'use client'

import { useState } from 'react'
import { Card, CardHeader, PageHeader, cx } from '@/components/ui/primitives'
import { ConfigForm } from '@/components/config/config-form'
import { SecretsList } from '@/components/secrets/secrets-list'
import { BillingPanel } from '@/components/billing/billing-panel'
import { DollarIcon, KeyIcon, LoopIcon, SparklesIcon } from '@/components/ui/icons'

const SECTIONS = [
  { id: 'agents', label: 'Agents & budgets', icon: SparklesIcon, description: 'Who plans, builds and reviews, and what a run may spend.' },
  { id: 'loops', label: 'Feedback loops', icon: LoopIcon, description: 'What every iteration has to pass before it is committed.' },
  { id: 'secrets', label: 'Runner secrets', icon: KeyIcon, description: 'Credentials every runner receives for each job.' },
  { id: 'billing', label: 'Plan & billing', icon: DollarIcon, description: 'Your plan, usage and invoices.' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

/**
 * Organization defaults. Every runner and project starts from these and
 * overrides only what it sets itself; a project's settings win over a
 * runner's, which win over these.
 */
export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>('agents')

  return (
    <>
      <PageHeader title="Settings" description="Organization defaults. Runners and projects inherit these and override only what they set." />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                title={s.description}
                aria-current={section === s.id ? 'page' : undefined}
                className={cx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  section === s.id ? 'bg-surface font-medium shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-border' : 'text-muted hover:bg-surface-secondary hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </button>
            )
          })}
        </nav>
        <div className="min-w-0">
          {section === 'agents' && <ConfigForm endpoint="/api/settings" sections={['agents', 'budgets']} inheritsFrom="CLI default" />}
          {section === 'loops' && <ConfigForm endpoint="/api/settings" sections={['loops']} inheritsFrom="CLI default" />}
          {section === 'secrets' && (
            <Card>
              <CardHeader
                icon={<KeyIcon />}
                title="Runner secrets"
                description="For example the API keys agents bill to. Change one here and every runner uses the new value from its next job. Project credentials belong in each project's Secrets tab."
              />
              <SecretsList scope="machine" />
            </Card>
          )}
          {section === 'billing' && <BillingPanel />}
        </div>
      </div>
    </>
  )
}
