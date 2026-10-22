'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { cx } from '../ui/cx'

type Line =
  | { kind: 'cmd'; text: string }
  | { kind: 'out'; text: string; tone?: 'ok' | 'miss' | 'foreign' | 'accent' | 'muted' }

/**
 * doctor → setup → enroll: the runner's whole story in three commands. Setup
 * installs only what doctor found missing, which is the point worth showing.
 * CLI output is English in every locale, as the real CLI's is.
 */
const SCRIPT: Line[] = [
  { kind: 'cmd', text: 'circon doctor' },
  { kind: 'out', text: '  ok       git · pnpm · docker', tone: 'ok' },
  { kind: 'out', text: '  foreign  node 24 via nvm (adopted, left alone)', tone: 'foreign' },
  { kind: 'out', text: '  ok       nvidia driver · cuda · ollama', tone: 'ok' },
  { kind: 'out', text: '  missing  qwen2.5-coder:7b', tone: 'miss' },
  { kind: 'out', text: '  missing  android sdk · emulator circon_pixel', tone: 'miss' },
  { kind: 'cmd', text: 'circon setup' },
  { kind: 'out', text: '  → pulling qwen2.5-coder:7b … done', tone: 'muted' },
  { kind: 'out', text: '  → installing android sdk … done', tone: 'muted' },
  { kind: 'out', text: '  2 installed · 14 already ok · 1 adopted', tone: 'ok' },
  { kind: 'cmd', text: 'circon enroll --token ••••••••' },
  { kind: 'out', text: '  enrolled as "rtx-3060" · waiting for jobs', tone: 'accent' },
]

const TONES = {
  ok: 'text-success',
  miss: 'text-warning',
  foreign: 'text-glow',
  accent: 'text-accent',
  muted: 'text-terminal-foreground/60',
}

export function TerminalDemo({ title }: { title: string }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: '-10% 0px' })
  const [line, setLine] = useState(0)
  const [chars, setChars] = useState(0)

  useEffect(() => {
    if (reduce || !visible) return
    let timer: ReturnType<typeof setTimeout>
    if (line >= SCRIPT.length) {
      timer = setTimeout(() => {
        setLine(0)
        setChars(0)
      }, 4000)
    } else {
      const current = SCRIPT[line]
      if (current.kind === 'cmd' && chars < current.text.length) {
        timer = setTimeout(() => setChars(chars + 1), 45 + Math.random() * 40)
      } else {
        timer = setTimeout(
          () => {
            setLine(line + 1)
            setChars(0)
          },
          current.kind === 'cmd' ? 450 : 260,
        )
      }
    }
    return () => clearTimeout(timer)
  }, [line, chars, reduce, visible])

  const shown = reduce ? SCRIPT.length : line

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-border bg-terminal shadow-[0_30px_60px_-25px_rgb(0_0_0/0.45)]">
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <span className="font-mono text-[11px] text-terminal-foreground/50">{title}</span>
      </div>
      {/* Every line is in the markup; the animation only reveals them. */}
      <pre className="min-h-[21rem] overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-terminal-foreground">
        {SCRIPT.map((l, i) => {
          const hidden = i > shown
          const typing = i === shown && !reduce
          if (l.kind === 'cmd') {
            const text = typing ? l.text.slice(0, chars) : l.text
            return (
              <div key={i} className={cx(hidden && 'invisible', i > 0 && 'mt-2')}>
                <span className="text-accent">❯ </span>
                <span className={cx(typing && 'caret')}>{hidden ? l.text : text}</span>
              </div>
            )
          }
          return (
            <div key={i} className={cx(hidden || typing ? 'invisible' : '', TONES[l.tone ?? 'muted'])}>
              {l.text}
            </div>
          )
        })}
        {shown >= SCRIPT.length && !reduce && (
          <div className="mt-2">
            <span className="text-accent">❯ </span>
            <span className="caret" />
          </div>
        )}
      </pre>
    </div>
  )
}
