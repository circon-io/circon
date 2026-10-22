import { company } from '@/content/company'
import { CompanyAddress, Mail } from './address'
import type { LegalDocument } from './types'

/**
 * Impressum under § 5 DDG (the Digitale-Dienste-Gesetz replaced the TMG in
 * May 2024). No link to the EU ODR platform: it was shut down on 20 July 2025,
 * and the duty to link to it went with it. The § 36 VSBG statement remains.
 */
export const imprint: LegalDocument = {
  title: { en: 'Imprint', de: 'Impressum' },
  description: {
    en: `Legal notice for circon: provider information pursuant to Section 5 DDG for ${company.name}.`,
    de: `Impressum von circon: Anbieterkennzeichnung nach § 5 DDG für die ${company.name}.`,
  },
  updated: '2026-10-23',
  Body: {
    de: () => (
      <>
        <h2>Angaben gemäß § 5 DDG</h2>
        <CompanyAddress locale="de" />

        <h2>Vertreten durch</h2>
        <p>Geschäftsführer: {company.managingDirectors.join(', ')}</p>

        <h2>Kontakt</h2>
        <p>
          E-Mail: <Mail />
          {company.phone && (
            <>
              <br />
              Telefon: <a href={`tel:${company.phone.replace(/\s/g, '')}`}>{company.phone}</a>
            </>
          )}
        </p>

        <h2>Registereintrag</h2>
        <p>
          Eintragung im Handelsregister
          <br />
          Registergericht: {company.register.court.de}
          <br />
          Registernummer: {company.register.number}
        </p>

        <h2>Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:
          <br />
          {company.vatId}
        </p>

        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>
          {company.contentResponsible.name}
          <br />
          {company.contentResponsible.address}
        </p>

        <h2>Verbraucherstreitbeilegung</h2>
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen (§ 36 Verbraucherstreitbeilegungsgesetz).
        </p>

        <h2>Haftung für Inhalte</h2>
        <p>
          Die Inhalte dieser Website wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und
          Aktualität der Inhalte übernehmen wir jedoch keine Gewähr. Als Diensteanbieter sind wir für eigene Inhalte auf
          diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte
          oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
          rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen
          nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist erst ab dem Zeitpunkt
          der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen
          entfernen wir diese Inhalte umgehend.
        </p>

        <h2>Haftung für Links</h2>
        <p>
          Unsere Website enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für
          diese fremden Inhalte übernehmen wir keine Gewähr; verantwortlich ist stets der jeweilige Anbieter oder
          Betreiber der Seiten. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße
          überprüft; rechtswidrige Inhalte waren nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten
          Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
          Rechtsverletzungen entfernen wir derartige Links umgehend.
        </p>

        <h2>Urheberrecht</h2>
        <p>
          Die durch uns erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die
          Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts
          bedürfen der schriftlichen Zustimmung der {company.name}. Der Quellcode von circon ist davon ausgenommen und
          steht unter den im Repository angegebenen Lizenzen (MIT für die CLI, FSL-1.1-ALv2 für Control Plane und
          Dashboard). Inhalte Dritter sind als solche gekennzeichnet. Sollten Sie trotzdem auf eine
          Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis.
        </p>
      </>
    ),
    en: () => (
      <>
        <p className="note">
          This is a courtesy translation. In case of doubt, the German version of this imprint prevails.
        </p>

        <h2>Information pursuant to Section 5 DDG</h2>
        <p className="text-muted">German Digital Services Act (Digitale-Dienste-Gesetz)</p>
        <CompanyAddress locale="en" />

        <h2>Represented by</h2>
        <p>Managing directors: {company.managingDirectors.join(', ')}</p>

        <h2>Contact</h2>
        <p>
          Email: <Mail />
          {company.phone && (
            <>
              <br />
              Phone: <a href={`tel:${company.phone.replace(/\s/g, '')}`}>{company.phone}</a>
            </>
          )}
        </p>

        <h2>Commercial register</h2>
        <p>
          Registered in the commercial register (Handelsregister)
          <br />
          Register court: {company.register.court.en}
          <br />
          Register number: {company.register.number}
        </p>

        <h2>VAT ID</h2>
        <p>
          VAT identification number pursuant to Section 27a of the German VAT Act (UStG):
          <br />
          {company.vatId}
        </p>

        <h2>Responsible for content pursuant to Section 18 (2) MStV</h2>
        <p>
          {company.contentResponsible.name}
          <br />
          {company.contentResponsible.address}
        </p>

        <h2>Consumer dispute resolution</h2>
        <p>
          We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer
          arbitration board (Section 36 of the German Consumer Dispute Resolution Act, VSBG).
        </p>

        <h2>Liability for content</h2>
        <p>
          The content of this website has been prepared with the greatest care. However, we cannot guarantee that it is
          accurate, complete or up to date. As a service provider, we are responsible for our own content on these pages
          under the general laws. We are not, however, obliged to monitor third-party information that is transmitted or
          stored, or to investigate circumstances that indicate illegal activity. Obligations to remove or block the use
          of information under the general laws remain unaffected. Liability in this respect is only possible from the
          moment we become aware of a specific infringement. As soon as we become aware of such an infringement, we will
          remove the content concerned immediately.
        </p>

        <h2>Liability for links</h2>
        <p>
          Our website contains links to external third-party websites whose content we have no control over. We cannot
          accept any liability for this third-party content; the respective provider or operator of the linked pages is
          always responsible for it. The linked pages were checked for possible legal violations at the time of linking,
          and no illegal content was recognizable. Permanent monitoring of the linked pages is not reasonable without
          concrete evidence of an infringement. If we become aware of any infringements, we will remove such links
          immediately.
        </p>

        <h2>Copyright</h2>
        <p>
          The content and works created by us on these pages are subject to German copyright law. Reproduction, editing,
          distribution and any kind of use beyond the limits of copyright law require the written consent of{' '}
          {company.name}. The circon source code is excluded from this and is available under the licenses stated in the
          repository (MIT for the CLI, FSL-1.1-ALv2 for the control plane and dashboard). Third-party content is marked
          as such. If you nevertheless notice a copyright infringement, please let us know.
        </p>
      </>
    ),
  },
}
