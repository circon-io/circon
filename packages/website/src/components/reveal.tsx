import { cx } from './ui/cx'

/**
 * Fades content up once as it scrolls into view. Plain markup with a class:
 * the content is visible in the static HTML, and is only hidden for the
 * animation when the head script has marked the page `.js`. RevealObserver
 * does the rest, one observer for the whole page.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'article'
}) {
  return (
    <Tag className={cx('reveal', className)} style={delay ? ({ '--reveal-delay': `${delay}s` } as React.CSSProperties) : undefined}>
      {children}
    </Tag>
  )
}
