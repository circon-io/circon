/**
 * The operator of the site, as the imprint (§ 5 DDG) and the privacy policy
 * (Art. 13 GDPR) must name it. Both legal pages and the JSON-LD Organization
 * read this, so a change of address is one edit.
 *
 * Optional fields render only when set. `phone` is worth setting: § 5 DDG asks
 * for a second fast channel besides email.
 */
export const company = {
  name: 'solyd GmbH',
  legalForm: { en: 'limited liability company (GmbH)', de: 'Gesellschaft mit beschränkter Haftung' },
  street: 'Birkenstraße 23',
  postalCode: '40233',
  city: 'Düsseldorf',
  country: { en: 'Germany', de: 'Deutschland' },
  countryCode: 'DE',
  email: 'info@getsolyd.com',
  phone: undefined as string | undefined,
  managingDirectors: ['Paul Tiedtke'],
  register: { court: { en: 'Local Court (Amtsgericht) Düsseldorf', de: 'Amtsgericht Düsseldorf' }, number: 'HRB 89127' },
  vatId: 'DE333292358',
  /** § 18 (2) MStV: the person responsible for editorial content, with a summonable address. */
  contentResponsible: { name: 'Paul Tiedtke', address: 'Birkenstraße 23, 40233 Düsseldorf' },
  /** The data protection authority for the company's seat (North Rhine-Westphalia). */
  supervisoryAuthority: {
    name: {
      en: 'State Commissioner for Data Protection and Freedom of Information North Rhine-Westphalia (LDI NRW)',
      de: 'Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW)',
    },
    address: 'Kavalleriestr. 2–4, 40213 Düsseldorf',
    url: 'https://www.ldi.nrw.de',
  },
} as const
