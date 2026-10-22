'use client'

import { motion } from 'framer-motion'

/** A check mark that draws itself once it scrolls into view. */
export function DrawCheck({ delay = 0 }: { delay?: number }) {
  return (
    <svg viewBox="0 0 52 52" className="size-12" aria-hidden>
      <motion.circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="var(--success)"
        strokeWidth="2"
        initial={{ pathLength: 0, opacity: 0.2 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
      />
      <motion.path
        d="M16 27l7 7 14-15"
        fill="none"
        stroke="var(--success)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: delay + 0.7, ease: 'easeOut' }}
      />
    </svg>
  )
}
