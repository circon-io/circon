import { Fragment } from 'react'
import { cx } from '../ui/primitives'

/**
 * A PRD rendered for reading. Deliberately small: the planner writes a known
 * subset of markdown (headings, lists, task boxes, emphasis), so this handles
 * that and shows anything else as plain text rather than pulling in a parser.
 */

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) =>
    part.startsWith('**') ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') ? (
      <code key={i} className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function PrdView({ markdown }: { markdown: string }) {
  const blocks: React.ReactNode[] = []
  const lines = markdown.split('\n')
  let list: Array<{ text: string; task: boolean; done: boolean }> = []
  let ordered = false

  const flush = (key: number) => {
    if (!list.length) return
    const items = list
    list = []
    const Tag = ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l${key}`} className={cx('my-3 flex flex-col gap-1.5 text-sm', ordered ? 'list-decimal pl-5' : items.some((i) => i.task) ? '' : 'list-disc pl-5')}>
        {items.map((item, i) =>
          item.task ? (
            <li key={i} className="flex items-start gap-2.5 rounded-md px-1 py-0.5">
              <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', item.done ? 'border-success bg-success text-success-foreground' : 'border-border')} aria-hidden>
                {item.done ? '✓' : ''}
              </span>
              <span className={cx(item.done && 'text-muted line-through')}>{inline(item.text)}</span>
            </li>
          ) : (
            <li key={i}>{inline(item.text)}</li>
          ),
        )}
      </Tag>,
    )
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    const numbered = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (task?.[2]) {
      if (ordered) flush(i)
      ordered = false
      list.push({ text: task[2], task: true, done: task[1] !== ' ' })
      return
    }
    if (bullet?.[1]) {
      if (ordered) flush(i)
      ordered = false
      list.push({ text: bullet[1], task: false, done: false })
      return
    }
    if (numbered?.[1]) {
      if (!ordered) flush(i)
      ordered = true
      list.push({ text: numbered[1], task: false, done: false })
      return
    }
    flush(i)
    if (!line.trim()) return
    if (line.startsWith('# ')) blocks.push(<h1 key={i} className="mb-2 text-xl font-semibold tracking-tight">{line.slice(2)}</h1>)
    else if (line.startsWith('## ')) blocks.push(<h2 key={i} className="mb-1 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{line.slice(3)}</h2>)
    else if (line.startsWith('### ')) blocks.push(<h3 key={i} className="mt-4 text-sm font-semibold">{line.slice(4)}</h3>)
    else if (line.startsWith('<!--')) return
    else blocks.push(<p key={i} className="my-2 text-sm leading-relaxed">{inline(line.trim())}</p>)
  })
  flush(lines.length)
  return <article className="max-w-none">{blocks}</article>
}
