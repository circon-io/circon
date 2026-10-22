'use client'

import { useEffect, useRef } from 'react'
import { cx } from '../ui/primitives'

/**
 * Live output in a terminal-like pane, pinned to the newest line: a log you
 * have to drag is useless while something is actively going wrong.
 */
export function LogView({ lines, className, testId }: { lines: string[]; className?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <div
      ref={ref}
      data-testid={testId}
      aria-live="polite"
      className={cx('max-h-[28rem] overflow-auto rounded-lg bg-terminal p-4 font-mono text-[12.5px] leading-relaxed text-terminal-foreground', className)}
    >
      {lines.length === 0 ? (
        <span className="text-terminal-foreground/50">Waiting for output…</span>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            className={cx(
              'whitespace-pre-wrap break-words',
              /^(✓|ok\s)/.test(line) && 'text-emerald-400',
              /^(✗|MISSING|Error|error)/.test(line) && 'text-rose-400',
              /^(──|→)/.test(line) && 'text-violet-300',
              /^(!|…)/.test(line) && 'text-amber-300',
            )}
          >
            {line || ' '}
          </div>
        ))
      )}
    </div>
  )
}
