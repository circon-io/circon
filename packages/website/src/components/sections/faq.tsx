'use client'

import { Accordion } from '@heroui/react'
import type { Dictionary } from '@/i18n/dictionaries'

/**
 * HeroUI's accordion. Collapsed answers are still in the HTML (hidden, not
 * absent), so search and answer engines read every one, matching the
 * FAQPage structured data on the same page.
 */
export function FaqList({ items }: { items: Dictionary['faq']['items'] }) {
  return (
    <Accordion className="rounded-2xl border border-border bg-surface px-2 sm:px-4" defaultExpandedKeys={['0']}>
      {items.map((item, i) => (
        <Accordion.Item key={item.q} id={String(i)}>
          <Accordion.Heading>
            <Accordion.Trigger className="py-5 text-left text-[15px] font-medium">
              {item.q}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="pb-5 text-[15px] leading-relaxed text-muted">{item.a}</Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}
