'use client'

import { useState } from 'react'
import { cx } from './ui/cx'
import { CheckIcon, CopyIcon } from './ui/icons'

/** The install one-liner, with a copy button that says it worked. */
export function CopyCommand({ command, copy, copied, className }: { command: string; copy: string; copied: string; className?: string }) {
  const [done, setDone] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    } catch {
      /* no clipboard permission: the command is still selectable */
    }
  }
  return (
    <div className={cx('group flex items-center gap-3 rounded-xl border border-border bg-terminal py-2 pl-4 pr-2 font-mono text-[13px] text-terminal-foreground shadow-sm', className)}>
      <span className="select-none text-accent" aria-hidden>$</span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">{command}</code>
      <button
        type="button"
        onClick={onCopy}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-sans text-xs text-terminal-foreground/70 transition-colors hover:bg-white/10 hover:text-terminal-foreground"
        aria-live="polite"
      >
        {done ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
        {done ? copied : copy}
      </button>
    </div>
  )
}
