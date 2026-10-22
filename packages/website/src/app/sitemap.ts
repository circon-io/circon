import type { MetadataRoute } from 'next'
import { legalDocuments } from '@/content/legal'
import { absolute } from '@/content/site'
import { localeTags, locales, pages, pathFor, type PageId } from '@/i18n/config'

export const dynamic = 'force-static'

/** Every page in every language, each entry listing its translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (page: PageId | undefined, lastModified: string, priority: number) =>
    locales.map((locale) => ({
      url: absolute(pathFor(locale, page)),
      lastModified,
      changeFrequency: page ? ('yearly' as const) : ('weekly' as const),
      priority,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [localeTags[l].lang, absolute(pathFor(l, page))])),
      },
    }))

  const newest = Object.values(legalDocuments).map((d) => d.updated).sort().at(-1)!
  return [
    ...entry(undefined, newest, 1),
    ...(Object.keys(pages) as PageId[]).flatMap((id) => entry(id, legalDocuments[id].updated, 0.2)),
  ]
}
