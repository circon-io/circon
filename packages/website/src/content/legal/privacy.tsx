import { company } from '@/content/company'
import { localeCookie } from '@/i18n/config'
import { themeKey } from '@/lib/theme'
import { CompanyAddress, Mail } from './address'
import type { LegalDocument } from './types'

/**
 * Datenschutzerklärung under Art. 13 GDPR, for this site only: a static page on
 * Cloudflare, fonts served from our own origin, no analytics, no third-party
 * embeds, no consent banner because nothing here needs consent. If any of that
 * changes (an analytics script, an embedded video), this text must change in
 * the same commit.
 */
export const privacy: LegalDocument = {
  title: { en: 'Privacy policy', de: 'Datenschutzerklärung' },
  description: {
    en: 'How the circon website processes personal data: hosting on Cloudflare, no tracking, no analytics, no third-party embeds.',
    de: 'Wie die circon-Website personenbezogene Daten verarbeitet: Hosting bei Cloudflare, kein Tracking, keine Analyse, keine eingebundenen Drittinhalte.',
  },
  updated: '2026-10-23',
  Body: {
    de: () => (
      <>
        <h2>1. Verantwortlicher</h2>
        <p>Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
        <CompanyAddress locale="de" />
        <p>
          E-Mail: <Mail />
        </p>

        <h2>2. Das Wichtigste in Kürze</h2>
        <ul>
          <li>Diese Website ist eine statische Informationsseite. Sie hat kein Nutzerkonto und kein Kontaktformular.</li>
          <li>Wir verwenden keine Analyse-, Tracking- oder Marketing-Werkzeuge und keine Cookies zu diesen Zwecken.</li>
          <li>
            Wir binden keine Inhalte Dritter ein (keine externen Schriftarten, Videos, Karten oder Social-Media-Plugins).
            Schriftarten werden von unserem eigenen Server ausgeliefert.
          </li>
          <li>Personenbezogene Daten fallen nur beim technisch notwendigen Abruf der Seiten an (siehe Abschnitt 3).</li>
        </ul>

        <h2>3. Hosting und Server-Logdaten</h2>
        <p>
          Diese Website wird über die Plattform von Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA
          („Cloudflare“) ausgeliefert. Cloudflare betreibt ein weltweites Netzwerk von Rechenzentren und schützt die
          Website vor Angriffen. Beim Aufruf der Website verarbeitet Cloudflare in unserem Auftrag technisch notwendige
          Daten, die Ihr Browser automatisch übermittelt:
        </p>
        <ul>
          <li>IP-Adresse des anfragenden Geräts,</li>
          <li>Datum und Uhrzeit des Abrufs,</li>
          <li>aufgerufene Adresse (URL) und übertragene Datenmenge,</li>
          <li>Referrer-URL (die zuvor besuchte Seite), soweit übermittelt,</li>
          <li>Browsertyp, Betriebssystem und bevorzugte Sprache (Accept-Language).</li>
        </ul>
        <p>
          Die Verarbeitung dient dazu, die Website auszuliefern, ihre Stabilität und Sicherheit zu gewährleisten und
          Angriffe abzuwehren. Die bevorzugte Sprache Ihres Browsers wird beim Aufruf der Startadresse ausgewertet, um Sie
          auf die deutsche oder englische Fassung weiterzuleiten; sie wird dabei nicht gespeichert. Rechtsgrundlage ist
          Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der sicheren und zuverlässigen Bereitstellung
          unseres Webangebots. Die Daten werden nur so lange gespeichert, wie es für diese Zwecke erforderlich ist, und
          danach gelöscht. Wir führen sie nicht mit anderen Daten zusammen und werten sie nicht zur Identifikation von
          Personen aus.
        </p>
        <p>
          Mit Cloudflare besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Dabei können Daten in die USA
          übermittelt werden. Cloudflare ist unter dem EU-U.S. Data Privacy Framework zertifiziert; die Übermittlung
          erfolgt damit auf Grundlage des Angemessenheitsbeschlusses der Europäischen Kommission (Art. 45 DSGVO) sowie
          ergänzend auf Grundlage von Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Weitere Informationen:{' '}
          <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.
        </p>

        <h2>4. Speicherung auf Ihrem Gerät</h2>
        <p>Diese Website speichert nur dann etwas auf Ihrem Gerät, wenn Sie es ausdrücklich auswählen:</p>
        <ul>
          <li>
            <strong>Farbschema:</strong> Wenn Sie zwischen hellem und dunklem Modus wechseln, wird Ihre Wahl im lokalen
            Speicher Ihres Browsers abgelegt (Schlüssel <code>{themeKey}</code>). Dieser Wert verlässt Ihr Gerät nicht.
          </li>
          <li>
            <strong>Sprache:</strong> Wenn Sie die Sprache wechseln, wird Ihre Wahl in einem Cookie (
            <code>{localeCookie}</code>, Speicherdauer ein Jahr) gespeichert, damit Sie beim nächsten Aufruf der
            Startadresse direkt in Ihrer Sprache landen.
          </li>
        </ul>
        <p>
          Beides ist für die von Ihnen ausdrücklich gewünschte Funktion unbedingt erforderlich und daher nach § 25 Abs. 2
          Nr. 2 TDDDG ohne Einwilligung zulässig. Sie können diese Einträge jederzeit in den Einstellungen Ihres Browsers
          löschen.
        </p>

        <h2>5. Kontakt per E-Mail</h2>
        <p>
          Wenn Sie uns per E-Mail kontaktieren, verarbeiten wir Ihre Angaben (E-Mail-Adresse, Name, Inhalt der Nachricht),
          um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihre Anfrage mit einem
          Vertrag oder vorvertraglichen Maßnahmen zusammenhängt, im Übrigen Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
          Interesse an der Beantwortung von Anfragen). Wir löschen die Daten, sobald sie nicht mehr erforderlich sind,
          sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>

        <h2>6. Links zu anderen Angeboten</h2>
        <p>
          Diese Website verlinkt auf GitHub und auf das circon-Dashboard. Erst wenn Sie einem solchen Link folgen,
          werden Daten an das jeweilige Angebot übertragen; dort gelten dessen eigene Datenschutzhinweise.
        </p>

        <h2>7. Ihre Rechte</h2>
        <p>Sie haben gegenüber uns die folgenden Rechte hinsichtlich Ihrer personenbezogenen Daten:</p>
        <ul>
          <li>Recht auf Auskunft (Art. 15 DSGVO),</li>
          <li>Recht auf Berichtigung (Art. 16 DSGVO),</li>
          <li>Recht auf Löschung (Art. 17 DSGVO),</li>
          <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO).</li>
        </ul>
        <p>
          <strong>Widerspruchsrecht:</strong> Soweit wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten,
          können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit Widerspruch gegen die
          Verarbeitung einlegen (Art. 21 DSGVO). Eine formlose Nachricht an <Mail /> genügt.
        </p>

        <h2>8. Beschwerderecht bei einer Aufsichtsbehörde</h2>
        <p>
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Für uns
          zuständig ist: {company.supervisoryAuthority.name.de}, {company.supervisoryAuthority.address},{' '}
          <a href={company.supervisoryAuthority.url}>{company.supervisoryAuthority.url.replace('https://', '')}</a>.
        </p>

        <h2>9. Pflicht zur Bereitstellung und automatisierte Entscheidungen</h2>
        <p>
          Sie sind nicht verpflichtet, uns personenbezogene Daten bereitzustellen. Ohne die in Abschnitt 3 genannten
          technischen Daten kann die Website jedoch nicht ausgeliefert werden. Eine automatisierte Entscheidungsfindung
          einschließlich Profiling nach Art. 22 DSGVO findet nicht statt.
        </p>

        <h2>10. Änderungen</h2>
        <p>
          Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die Rechtslage ändert. Es gilt die jeweils
          hier veröffentlichte Fassung.
        </p>
      </>
    ),
    en: () => (
      <>
        <p className="note">
          This is a courtesy translation. In case of doubt, the German version of this privacy policy prevails.
        </p>

        <h2>1. Controller</h2>
        <p>The controller responsible for data processing on this website within the meaning of the General Data Protection Regulation (GDPR) is:</p>
        <CompanyAddress locale="en" />
        <p>
          Email: <Mail />
        </p>

        <h2>2. In short</h2>
        <ul>
          <li>This website is a static information site. It has no user accounts and no contact form.</li>
          <li>We use no analytics, tracking or marketing tools, and no cookies for any of those purposes.</li>
          <li>
            We embed no third-party content (no external fonts, videos, maps or social media plugins). Fonts are served
            from our own server.
          </li>
          <li>Personal data is processed only as technically necessary to deliver the pages (see section 3).</li>
        </ul>

        <h2>3. Hosting and server log data</h2>
        <p>
          This website is delivered through the platform of Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107,
          USA (“Cloudflare”). Cloudflare operates a global network of data centers and protects the website against
          attacks. When you visit the website, Cloudflare processes, on our behalf, technically necessary data that your
          browser sends automatically:
        </p>
        <ul>
          <li>the IP address of the requesting device,</li>
          <li>the date and time of the request,</li>
          <li>the address (URL) requested and the amount of data transferred,</li>
          <li>the referrer URL (the page visited before), if sent,</li>
          <li>browser type, operating system and preferred language (Accept-Language).</li>
        </ul>
        <p>
          This processing serves to deliver the website, to ensure its stability and security, and to defend against
          attacks. Your browser’s preferred language is evaluated when you open the root address, to redirect you to the
          English or German version; it is not stored in the process. The legal basis is Art. 6 (1) (f) GDPR; our
          legitimate interest is the secure and reliable provision of our website. The data is stored only for as long as
          these purposes require and is then deleted. We do not combine it with other data or use it to identify
          individuals.
        </p>
        <p>
          We have concluded a data processing agreement with Cloudflare under Art. 28 GDPR. Data may be transferred to
          the USA in the process. Cloudflare is certified under the EU-U.S. Data Privacy Framework, so the transfer is
          based on the European Commission’s adequacy decision (Art. 45 GDPR) and, additionally, on standard contractual
          clauses (Art. 46 (2) (c) GDPR). More information:{' '}
          <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare’s privacy policy</a>.
        </p>

        <h2>4. Storage on your device</h2>
        <p>This website stores something on your device only when you explicitly choose it:</p>
        <ul>
          <li>
            <strong>Color scheme:</strong> when you switch between light and dark mode, your choice is kept in your
            browser’s local storage (key <code>{themeKey}</code>). This value never leaves your device.
          </li>
          <li>
            <strong>Language:</strong> when you switch languages, your choice is stored in a cookie (
            <code>{localeCookie}</code>, kept for one year) so that the root address takes you straight to your language
            next time.
          </li>
        </ul>
        <p>
          Both are strictly necessary for a function you explicitly requested and are therefore permitted without
          consent under Section 25 (2) No. 2 of the German Telecommunications Digital Services Data Protection Act
          (TDDDG). You can delete them at any time in your browser settings.
        </p>

        <h2>5. Contact by email</h2>
        <p>
          If you contact us by email, we process the information you provide (email address, name, content of the
          message) to answer your request. The legal basis is Art. 6 (1) (b) GDPR where your request relates to a contract
          or pre-contractual measures, and otherwise Art. 6 (1) (f) GDPR (our legitimate interest in answering
          inquiries). We delete the data once it is no longer needed, unless statutory retention obligations apply.
        </p>

        <h2>6. Links to other services</h2>
        <p>
          This website links to GitHub and to the circon dashboard. Data is transferred to those services only when you
          follow such a link; their own privacy notices apply there.
        </p>

        <h2>7. Your rights</h2>
        <p>You have the following rights regarding your personal data:</p>
        <ul>
          <li>the right of access (Art. 15 GDPR),</li>
          <li>the right to rectification (Art. 16 GDPR),</li>
          <li>the right to erasure (Art. 17 GDPR),</li>
          <li>the right to restriction of processing (Art. 18 GDPR),</li>
          <li>the right to data portability (Art. 20 GDPR).</li>
        </ul>
        <p>
          <strong>Right to object:</strong> where we process data on the basis of Art. 6 (1) (f) GDPR, you may object to
          the processing at any time on grounds relating to your particular situation (Art. 21 GDPR). An informal message
          to <Mail /> is enough.
        </p>

        <h2>8. Right to lodge a complaint</h2>
        <p>
          You have the right to lodge a complaint with a data protection supervisory authority (Art. 77 GDPR). The
          authority responsible for us is the {company.supervisoryAuthority.name.en}, {company.supervisoryAuthority.address},{' '}
          <a href={company.supervisoryAuthority.url}>{company.supervisoryAuthority.url.replace('https://', '')}</a>.
        </p>

        <h2>9. Obligation to provide data and automated decisions</h2>
        <p>
          You are not obliged to provide us with personal data. Without the technical data listed in section 3, however,
          the website cannot be delivered. No automated decision-making, including profiling, within the meaning of
          Art. 22 GDPR takes place.
        </p>

        <h2>10. Changes</h2>
        <p>
          We update this privacy policy when the website or the law changes. The version published here applies.
        </p>
      </>
    ),
  },
}
