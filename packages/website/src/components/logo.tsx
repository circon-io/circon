import NextLink from 'next/link'

/** The dashboard's mark: an open ring, the loop that never quite closes. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-lg bg-foreground text-background ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
        <path d="M17 7.5A6.5 6.5 0 1 0 17 16.5" />
      </svg>
    </span>
  )
}

export function Logo({ href, label }: { href: string; label: string }) {
  return (
    <NextLink href={href} className="flex items-center gap-2.5" aria-label={label}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">circon</span>
    </NextLink>
  )
}
