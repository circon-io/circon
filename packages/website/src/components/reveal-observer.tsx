'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MotionConfig } from 'framer-motion'

/**
 * Marks every `.reveal` visible once it enters the viewport. Re-scans after
 * each client-side navigation, since a new page brings new elements.
 */
export function RevealObserver({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useEffect(() => {
    const pending = document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -60px 0px' },
    )
    pending.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pathname])

  // The graphics animate with framer-motion; it follows the visitor's
  // reduced-motion setting everywhere below this.
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
