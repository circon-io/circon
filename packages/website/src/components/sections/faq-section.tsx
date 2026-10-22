import type { Dictionary } from '@/i18n/dictionaries'
import { Reveal } from '../reveal'
import { Section, SectionHeading } from '../ui/section'
import { FaqList } from './faq'

export function Faq({ dict }: { dict: Dictionary }) {
  return (
    <Section id="faq">
      <SectionHeading eyebrow={dict.faq.eyebrow} title={dict.faq.title} />
      <Reveal className="mx-auto max-w-3xl">
        <FaqList items={dict.faq.items} />
      </Reveal>
    </Section>
  )
}
