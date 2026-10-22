import type { Metadata } from 'next'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { ChevronLeftIcon } from '@/components/ui/icons'
import { legalDocuments } from '@/content/legal'
import { isLocale, locales, pageForSlug, pages, pathFor, type Locale, type PageId } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { breadcrumbLd, graph, pageMetadata, webPageLd } from '@/lib/seo'

type Props = { params: Promise<{ locale: string; slug: string }> }

export const dynamicParams = false

/** Every page in every language, each under its own translated slug. */
export function generateStaticParams() {
  return locales.flatMap((locale) => (Object.keys(pages) as PageId[]).map((id) => ({ locale, slug: pages[id][locale] })))
}

function resolve(locale: string, slug: string): { locale: Locale; page: PageId } | null {
  if (!isLocale(locale)) return null
  const page = pageForSlug(locale, slug)
  return page ? { locale, page } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: l, slug } = await params
  const found = resolve(l, slug)
  if (!found) return {}
  const { locale, page } = found
  const doc = legalDocuments[page]
  return pageMetadata({ locale, page, dict: getDictionary(locale), title: doc.title[locale], description: doc.description[locale] })
}

export default async function LegalPage({ params }: Props) {
  const { locale: l, slug } = await params
  const found = resolve(l, slug)
  if (!found) notFound()
  const { locale, page } = found
  const dict = getDictionary(locale)
  const doc = legalDocuments[page]
  const Body = doc.Body[locale]
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(doc.updated))

  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <JsonLd
        data={graph(
          { ...webPageLd(locale, doc.title[locale], doc.description[locale], page), dateModified: doc.updated },
          breadcrumbLd(locale, dict, page, doc.title[locale]),
        )}
      />
      <NextLink href={pathFor(locale)} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        {dict.legal.back}
      </NextLink>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{doc.title[locale]}</h1>
      <p className="mt-2 text-sm text-muted">
        {dict.legal.updated}: <time dateTime={doc.updated}>{updated}</time>
      </p>
      <div className="legal-prose mt-10">
        <Body />
      </div>
    </article>
  )
}
