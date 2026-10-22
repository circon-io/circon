import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { Agents } from '@/components/sections/agents'
import { Approve } from '@/components/sections/approve'
import { Conventions } from '@/components/sections/conventions'
import { Cta } from '@/components/sections/cta'
import { Faq } from '@/components/sections/faq-section'
import { Flow } from '@/components/sections/flow'
import { Gate } from '@/components/sections/gate'
import { Hero } from '@/components/sections/hero'
import { Pricing } from '@/components/sections/pricing'
import { Runner } from '@/components/sections/runner'
import { Stats } from '@/components/sections/stats'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { faqLd, graph, pageMetadata, softwareLd, webPageLd } from '@/lib/seo'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = getDictionary(locale)
  return pageMetadata({ locale, dict, title: dict.meta.title, description: dict.meta.description })
}

export default async function Home({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)

  return (
    <>
      <JsonLd
        data={graph(
          webPageLd(locale, dict.meta.title, dict.meta.description),
          softwareLd(locale, dict),
          faqLd(dict),
        )}
      />
      <Hero dict={dict} />
      <Stats dict={dict} />
      <Flow dict={dict} />
      <Gate dict={dict} />
      <Agents dict={dict} />
      <Runner dict={dict} />
      <Conventions dict={dict} />
      <Approve dict={dict} />
      <Pricing dict={dict} />
      <Faq dict={dict} />
      <Cta dict={dict} />
    </>
  )
}
