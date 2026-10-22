'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import type { Dictionary } from '@/i18n/dictionaries'
import { cx } from '../ui/cx'
import { AppleIcon, CheckIcon, CodeIcon, FlaskIcon, GlobeIcon, PhoneIcon, XIcon } from '../ui/icons'

const ICONS = [CodeIcon, FlaskIcon, GlobeIcon, PhoneIcon, AppleIcon]
/** How long each tier "runs" in the animation: the cost curve, made visible. */
const RUN_MS = [500, 700, 1100, 1500, 1500]
/** In the failing scenario, Android (index 3) fails and iOS never starts. */
const FAIL_AT = 3

type TierState = 'idle' | 'running' | 'passed' | 'failed' | 'skipped'

/**
 * The gate, alternating between a clean pass and a failure: cheapest tier
 * first, stop at the first red. That stop is the whole idea, so the failing
 * run is shown as often as the passing one.
 */
export function GatePipeline({ t }: { t: Dictionary['gate'] }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: '-15% 0px' })
  const [scenario, setScenario] = useState<'pass' | 'fail'>('pass')
  const [step, setStep] = useState(-1) // -1 idle, 0..4 running tier, 5 done

  useEffect(() => {
    if (reduce || !visible) return
    const stopAt = scenario === 'fail' ? FAIL_AT : 4
    let ms: number
    let next: () => void
    if (step < 0) {
      ms = 700
      next = () => setStep(0)
    } else if (step <= stopAt) {
      ms = RUN_MS[step]
      next = () => setStep(step === stopAt ? 5 : step + 1)
    } else {
      ms = 2800
      next = () => {
        setScenario(scenario === 'pass' ? 'fail' : 'pass')
        setStep(-1)
      }
    }
    const timer = setTimeout(next, ms)
    return () => clearTimeout(timer)
  }, [step, scenario, reduce, visible])

  const s = reduce ? 5 : step
  const failing = scenario === 'fail'
  const stateOf = (i: number): TierState => {
    if (s < 0) return 'idle'
    if (s === 5) {
      if (!failing) return 'passed'
      return i < FAIL_AT ? 'passed' : i === FAIL_AT ? 'failed' : 'skipped'
    }
    return i < s ? 'passed' : i === s ? 'running' : 'idle'
  }
  const progress = s < 0 ? 0 : s === 5 ? (failing ? FAIL_AT / 4 : 1) : s / 4

  return (
    <div ref={ref} className="relative">
      {/* The rail behind the nodes, filling as tiers pass. */}
      <div className="absolute left-[10%] right-[10%] top-7 hidden h-px bg-border md:block" aria-hidden>
        <motion.div
          className={cx('h-full origin-left', failing && s === 5 ? 'bg-danger' : 'bg-accent')}
          animate={{ scaleX: progress }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      </div>

      <ol className="relative grid gap-3 md:grid-cols-5 md:gap-4">
        {t.tiers.map((tier, i) => {
          const state = stateOf(i)
          const Icon = ICONS[i]
          return (
            <li key={tier.title} className="flex gap-4 md:flex-col md:items-center md:text-center">
              <div
                className={cx(
                  'relative grid size-14 shrink-0 place-items-center rounded-2xl border bg-surface transition-all duration-300',
                  state === 'idle' && 'border-border text-muted',
                  state === 'running' && 'border-accent text-accent shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_15%,transparent)]',
                  state === 'passed' && 'border-success/40 text-success',
                  state === 'failed' && 'border-danger text-danger shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_15%,transparent)]',
                  state === 'skipped' && 'border-dashed border-border text-muted/50',
                )}
              >
                <Icon className="size-5" />
                <AnimatePresence>
                  {(state === 'passed' || state === 'failed') && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className={cx(
                        'absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-white ring-2 ring-background',
                        state === 'passed' ? 'bg-success' : 'bg-danger',
                      )}
                    >
                      {state === 'passed' ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                    </motion.span>
                  )}
                </AnimatePresence>
                {state === 'running' && (
                  <span className="absolute inset-0 animate-ping rounded-2xl border border-accent/40" aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col pt-1 md:pt-0">
                <div className="flex items-center gap-2 md:justify-center">
                  <span className="text-xs tabular-nums text-muted">{i + 1}</span>
                  <h3 className="text-sm font-semibold">{tier.title}</h3>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{tier.body}</p>
                {/* Cost grows left to right: cheapest first. */}
                <div className="mt-2 flex items-center gap-2 md:mt-auto md:justify-center md:pt-2">
                  <span className="h-1 rounded-full bg-accent/50" style={{ width: `${12 + i * 10}px` }} aria-hidden />
                  <span className="text-[11px] text-muted">{tier.cost}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-8 flex justify-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {s === 5 && (
            <motion.div
              key={scenario}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cx(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
                failing ? 'border-danger/30 bg-danger-soft text-danger-soft-foreground' : 'border-success/30 bg-success-soft text-success-soft-foreground',
              )}
            >
              {failing ? <XIcon className="size-4" /> : <CheckIcon className="size-4" />}
              {failing ? t.scenarioFail : t.scenarioPass}
            </motion.div>
          )}
          {s !== 5 && <div key="placeholder" className="h-[38px]" aria-hidden />}
        </AnimatePresence>
      </div>
    </div>
  )
}
