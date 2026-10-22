import { company } from '@/content/company'
import type { Locale } from '@/i18n/config'

/** The postal block, as both legal pages print it. */
export function CompanyAddress({ locale }: { locale: Locale }) {
  return (
    <address className="not-italic">
      {company.name}
      <br />
      {company.street}
      <br />
      {company.postalCode} {company.city}
      <br />
      {company.country[locale]}
    </address>
  )
}

export function Mail() {
  return <a href={`mailto:${company.email}`}>{company.email}</a>
}
