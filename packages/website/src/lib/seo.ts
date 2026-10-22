import type { Metadata } from 'next'
import { company } from '@/content/company'
import { absolute, site } from '@/content/site'
import { defaultLocale, localeTags, locales, pathFor, type Locale, type PageId } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries'

/**
 * Canonical and hreflang for a page: every language version names itself as
 * canonical and lists all the others, plus x-default for everyone else.
 */
export function alternatesFor(locale: Locale, page?: PageId): NonNullable<Metadata['alternates']> {
  return {
    canonical: absolute(pathFor(locale, page)),
    languages: {
      ...Object.fromEntries(locales.map((l) => [localeTags[l].lang, absolute(pathFor(l, page))])),
      'x-default': absolute(pathFor(defaultLocale, page)),
    },
  }
}

/** The share card for a language, rendered at build time by app/[locale]/og.png. */
export function ogImage(locale: Locale): string {
  return absolute(`/${locale}/og.png`)
}

export function pageMetadata({
  locale,
  page,
  title,
  description,
  dict,
}: {
  locale: Locale
  page?: PageId
  title: string
  description: string
  dict: Dictionary
}): Metadata {
  const url = absolute(pathFor(locale, page))
  return {
    title: page ? title : { absolute: title },
    description,
    keywords: page ? undefined : [...dict.meta.keywords],
    alternates: alternatesFor(locale, page),
    openGraph: {
      type: 'website',
      url,
      siteName: site.name,
      title,
      description,
      locale: localeTags[locale].og,
      alternateLocale: locales.filter((l) => l !== locale).map((l) => localeTags[l].og),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: title, type: 'image/png' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage(locale)] },
  }
}

// ---- structured data ----------------------------------------------------------

const orgId = `${site.url}/#organization`
const websiteId = `${site.url}/#website`
const softwareId = `${site.url}/#software`

/** Who publishes the site. Read from the same record as the imprint. */
export function organizationLd(locale: Locale) {
  return {
    '@type': 'Organization',
    '@id': orgId,
    name: company.name,
    url: site.url,
    logo: absolute('/icon.svg'),
    email: company.email,
    vatID: company.vatId,
    address: {
      '@type': 'PostalAddress',
      streetAddress: company.street,
      postalCode: company.postalCode,
      addressLocality: company.city,
      addressCountry: company.countryCode,
    },
    sameAs: [site.githubUrl],
    brand: { '@type': 'Brand', name: site.name },
    knowsLanguage: locales.map((l) => localeTags[l].lang),
    description: locale === 'de' ? 'Betreiber von circon.' : 'Operator of circon.',
  }
}

export function websiteLd(locale: Locale, dict: Dictionary) {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    url: site.url,
    name: site.name,
    description: dict.meta.description,
    inLanguage: locales.map((l) => localeTags[l].lang),
    publisher: { '@id': orgId },
  }
}

export function softwareLd(locale: Locale, dict: Dictionary) {
  return {
    '@type': 'SoftwareApplication',
    '@id': softwareId,
    name: site.name,
    url: absolute(pathFor(locale)),
    description: dict.meta.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Ubuntu 24.04+, macOS (Apple Silicon)',
    inLanguage: localeTags[locale].lang,
    publisher: { '@id': orgId },
    license: 'https://opensource.org/license/mit',
    codeRepository: site.githubUrl,
    installUrl: site.githubUrl,
    featureList: [...dict.gate.tiers.map((t) => t.title), ...dict.agents.roles.map((r) => r.title)],
    offers: dict.pricing.plans.map((plan, i) => ({
      '@type': 'Offer',
      name: plan.name,
      description: plan.description,
      ...(i === 0 ? { price: '0', priceCurrency: 'EUR' } : {}),
      url: site.dashboardUrl,
    })),
  }
}

export function faqLd(dict: Dictionary) {
  return {
    '@type': 'FAQPage',
    mainEntity: dict.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

export function webPageLd(locale: Locale, title: string, description: string, page?: PageId) {
  return {
    '@type': page === 'imprint' ? 'AboutPage' : 'WebPage',
    '@id': `${absolute(pathFor(locale, page))}#webpage`,
    url: absolute(pathFor(locale, page)),
    name: title,
    description,
    inLanguage: localeTags[locale].lang,
    isPartOf: { '@id': websiteId },
    publisher: { '@id': orgId },
  }
}

export function breadcrumbLd(locale: Locale, dict: Dictionary, page: PageId, title: string) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: dict.legal.breadcrumbHome, item: absolute(pathFor(locale)) },
      { '@type': 'ListItem', position: 2, name: title, item: absolute(pathFor(locale, page)) },
    ],
  }
}

/** One graph per page, so the nodes can reference each other by @id. */
export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
