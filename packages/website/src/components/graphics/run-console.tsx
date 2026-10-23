'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import type { Dictionary } from '@/i18n/dictionaries'
import { cx } from '../ui/cx'
import { AppleIcon, BranchIcon, CheckIcon, CodeIcon, FlaskIcon, GlobeIcon, PhoneIcon, PullRequestIcon, SparklesIcon } from '../ui/icons'

const TIER_ICONS = [CodeIcon, FlaskIcon, GlobeIcon, PhoneIcon, AppleIcon]
const TIER_SHORT = ['tsc', 'unit', 'web', 'android', 'ios']
const COMMITS = ['a1f3c9e', '7be0d42', 'c94a1f0']
const DIFFS = ['+412 −38', '+268 −51', '+190 −12']

/**
 * One iteration is a fixed script of beats: plan, build, five gate tiers,
 * commit, PR, a pause. Each beat has a duration; the console advances through
 * them and moves on to the next task, the way a real run does.
 */
const BEATS = [
  { id: 'plan', ms: 1300 },
  { id: 'build', ms: 2000 },
  { id: 'tier-0', ms: 600 },
  { id: 'tier-1', ms: 800 },
  { id: 'tier-2', ms: 1100 },
  { id: 'tier-3', ms: 1200 },
  { id: 'tier-4', ms: 1200 },
  { id: 'commit', ms: 900 },
  { id: 'pr', ms: 2600 },
] as const
const LAST = BEATS.length - 1

type State = 'queued' | 'running' | 'passed'

function stateOf(beat: number, index: number): State {
  if (beat > index) return 'passed'
  return beat === index ? 'running' : 'queued'
}

export function RunConsole({ t }: { t: Dictionary['console'] }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: '-10% 0px' })
  const [task, setTask] = useState(0)
  const [beat, setBeat] = useState(0)

  useEffect(() => {
    if (reduce || !visible) return
    const timer = setTimeout(() => {
      if (beat < LAST) setBeat(beat + 1)
      else {
        setBeat(0)
        setTask((task + 1) % t.tasks.length)
      }
    }, BEATS[beat].ms)
    return () => clearTimeout(timer)
  }, [beat, task, reduce, visible, t.tasks.length])

  // Reduced motion: a finished iteration, still.
  const b = reduce ? LAST : beat
  const tierBeat = (i: number) => 2 + i
  const gateState: State = b < 2 ? 'queued' : b <= 6 ? 'running' : 'passed'
  const cost = (0.18 + task * 0.31 + Math.min(b, LAST) * 0.03).toFixed(2)

  return (
    <div ref={ref} className="beam-border rounded-2xl bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.25)] dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)]">
      <div className="overflow-hidden rounded-2xl" role="img" aria-label={t.label}>
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-secondary/60 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted">
            <BranchIcon className="size-3.5 shrink-0" />
            <span className="truncate">{t.branch}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-accent animate-pulse-ring" />
            <span className="tabular-nums">
              {t.iteration} {task + 3}/50
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
          {/* The plan */}
          <div className="hidden border-r border-border p-4 sm:block">
            <div className="mb-3 font-mono text-[11px] text-muted">{t.tasksTitle}</div>
            <ul className="space-y-2.5">
              {t.tasks.map((label, i) => {
                const done = i < task || (i === task && b === LAST)
                const current = i === task && !done
                return (
                  <li key={label} className="flex items-start gap-2 text-xs leading-snug">
                    <span
                      className={cx(
                        'mt-px grid size-3.5 shrink-0 place-items-center rounded border transition-colors duration-500',
                        done ? 'border-success bg-success text-success-foreground' : current ? 'border-accent' : 'border-border',
                      )}
                    >
                      {done && <CheckIcon className="size-2.5" />}
                    </span>
                    <span className={cx('transition-colors duration-500', done ? 'text-muted line-through decoration-muted/40' : current ? 'text-foreground' : 'text-muted')}>
                      {label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* The iteration */}
          <ol className="space-y-1 p-4 text-[13px]">
            <Row state={stateOf(b, 0)} label={t.plan} meta="claude-code · fable" icon={<SparklesIcon className="size-3.5" />} t={t} />
            <Row state={stateOf(b, 1)} label={t.build} meta="claude-code · opus" icon={<CodeIcon className="size-3.5" />} t={t} />
            <Row state={gateState} label={t.gate} meta={t.gateChecks} icon={<FlaskIcon className="size-3.5" />} t={t}>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                {TIER_SHORT.map((name, i) => {
                  const s = stateOf(b, tierBeat(i))
                  const Icon = TIER_ICONS[i]
                  return (
                    <span
                      key={name}
                      className={cx(
                        'flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] transition-all duration-300',
                        s === 'passed' && 'border-success/30 bg-success-soft text-success-soft-foreground',
                        s === 'running' && 'border-accent/50 bg-accent-soft text-accent-soft-foreground animate-pulse-ring',
                        s === 'queued' && 'border-border text-muted',
                      )}
                    >
                      {s === 'passed' ? <CheckIcon className="size-3" /> : <Icon className="size-3" />}
                      {name}
                    </span>
                  )
                })}
              </div>
            </Row>
            <Row
              state={stateOf(b, 7)}
              label={t.commit}
              icon={<BranchIcon className="size-3.5" />}
              t={t}
              meta={b >= 7 ? COMMITS[task] : '—'}
              trailing={b > 7 ? <span className="font-mono text-[11px] text-success">{DIFFS[task]}</span> : null}
            />
            <Row state={b === LAST ? 'passed' : 'queued'} label={t.pr} icon={<PullRequestIcon className="size-3.5" />} t={t} meta={`#${42 + task}`}>
              <AnimatePresence>
                {b === LAST && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35 }}
                    className="overflow-hidden pl-8"
                  >
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-xs text-accent-soft-foreground">
                      <PullRequestIcon className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">feat: {t.tasks[task].toLowerCase()}</span>
                      <span className="ml-auto shrink-0 font-medium">{t.prOpened}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Row>
          </ol>
        </div>

        {/* Footer: what it cost */}
        <div className="flex items-center justify-between border-t border-border bg-surface-secondary/40 px-4 py-2 text-[11px] text-muted">
          <span className="font-mono">~/circon-projects/acme__shop</span>
          <span className="tabular-nums">
            {t.cost} ${cost} · {t.notional}
          </span>
        </div>
      </div>
    </div>
  )
}

function Row({
  state,
  label,
  meta,
  icon,
  trailing,
  children,
  t,
}: {
  state: State
  label: string
  meta?: string
  icon: React.ReactNode
  trailing?: React.ReactNode
  children?: React.ReactNode
  t: Dictionary['console']
}) {
  return (
    <li className={cx('rounded-lg px-2 py-1.5 transition-colors duration-300', state === 'running' && 'bg-surface-secondary/70')}>
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300',
            state === 'passed' && 'bg-success-soft text-success',
            state === 'running' && 'bg-accent-soft text-accent',
            state === 'queued' && 'bg-surface-secondary text-muted',
          )}
        >
          {state === 'passed' ? <CheckIcon className="size-3" /> : icon}
        </span>
        <span className={cx('font-medium', state === 'queued' && 'text-muted')}>{label}</span>
        {meta && <span className="min-w-0 truncate font-mono text-[11px] text-muted">{meta}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {trailing}
          <span
            className={cx(
              'text-[11px]',
              state === 'passed' && 'text-success',
              state === 'running' && 'text-accent',
              state === 'queued' && 'text-muted/70',
            )}
          >
            {state === 'passed' ? t.passed : state === 'running' ? t.running : t.queued}
          </span>
        </span>
      </div>
      {children}
    </li>
  )
}
