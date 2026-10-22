'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import type { Dictionary } from '@/i18n/dictionaries'
import { CodeIcon, EyeIcon, LoopIcon, SparklesIcon } from '../ui/icons'

/**
 * Configurations a team might really run, cycled to show that each role is
 * filled independently. Same shape as `agents` in config.json.
 */
const SETUPS = [
  [
    ['Claude Code', 'fable'],
    ['Claude Code', 'opus'],
    ['Codex', 'gpt-5'],
  ],
  [
    ['Claude Code', 'opus'],
    ['aider', 'qwen2.5-coder · local'],
    ['Claude Code', 'sonnet'],
  ],
  [
    ['Codex', 'gpt-5'],
    ['Claude Code', 'sonnet'],
    ['Claude Code', 'opus'],
  ],
] as const

const ICONS = [SparklesIcon, CodeIcon, EyeIcon]
/** Node centers as percentages of the diagram box: plan, build, review. */
const POSITIONS = [
  { x: 22, y: 20 },
  { x: 78, y: 20 },
  { x: 50, y: 84 },
]
const HUB = { x: 50, y: 46 }

export function AgentsDiagram({ t }: { t: Dictionary['agents'] }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const [setup, setSetup] = useState(0)

  useEffect(() => {
    if (reduce || !visible) return
    const timer = setInterval(() => setSetup((s) => (s + 1) % SETUPS.length), 3200)
    return () => clearInterval(timer)
  }, [reduce, visible])

  return (
    <div ref={ref} className="relative mx-auto aspect-[10/9] w-full max-w-lg" aria-hidden>
      <div className="bg-dots absolute inset-0 rounded-3xl [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]" />

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <defs>
          {/* User-space units: a vertical line has a zero-width bounding box, and a
              bounding-box gradient on it would paint nothing. */}
          <linearGradient id="agent-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--glow)" />
          </linearGradient>
        </defs>
        {POSITIONS.map((p, i) => (
          <line
            key={i}
            x1={HUB.x}
            y1={HUB.y}
            x2={p.x}
            y2={p.y}
            stroke="url(#agent-line)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="dash-flow"
            style={{ animationDirection: i === 2 ? 'reverse' : 'normal' }}
          />
        ))}
      </svg>

      {/* The hub: the loop that hands work from role to role. */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }}>
        <div className="relative grid size-20 place-items-center rounded-full border border-accent/40 bg-surface shadow-[0_0_60px_-10px_var(--accent)] sm:size-24">
          <motion.div
            className="absolute inset-1.5 rounded-full border border-dashed border-accent/40"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          />
          <div className="flex flex-col items-center gap-1">
            <LoopIcon className="size-5 text-accent" />
            <span className="font-mono text-[10px] text-muted">{t.hub}</span>
          </div>
        </div>
      </div>

      {t.roles.map((role, i) => {
        const Icon = ICONS[i]
        const [backend, model] = SETUPS[setup][i]
        return (
          <div
            key={role.title}
            className="absolute w-[44%] max-w-[13rem] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${POSITIONS[i].x}%`, top: `${POSITIONS[i].y}%` }}
          >
            <div className="rounded-xl border border-border bg-surface/95 p-3 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-accent-soft text-accent">
                  <Icon className="size-3.5" />
                </span>
                <span className="text-sm font-semibold">{role.title}</span>
              </div>
              <div className="relative mt-2 h-9 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={`${backend}-${model}`}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    className="absolute inset-0"
                  >
                    <div className="truncate text-xs font-medium">{backend}</div>
                    <div className="truncate font-mono text-[10.5px] text-muted">{model}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
