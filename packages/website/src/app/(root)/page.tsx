import { defaultLocale, localeCookie, localeTags, locales, pathFor } from '@/i18n/config'
import { absolute } from '@/content/site'
import { LogoMark } from '@/components/logo'

/**
 * `/` without the Worker (a plain static host, `npx serve out`): the same
 * choice the Worker makes, in the browser. Links for anyone without script.
 */
const redirect = `(() => {
  const supported = ${JSON.stringify(locales)};
  const saved = document.cookie.split('; ').find((c) => c.startsWith('${localeCookie}='))?.split('=')[1];
  const preferred = (navigator.languages || [navigator.language]).map((l) => l.toLowerCase().split('-')[0]);
  const locale = supported.includes(saved) ? saved : preferred.find((l) => supported.includes(l)) || '${defaultLocale}';
  location.replace('/' + locale + '/' + location.search + location.hash);
})()`

export default function RootRedirect() {
  return (
    <>
      {locales.map((locale) => (
        <link key={locale} rel="alternate" hrefLang={localeTags[locale].lang} href={absolute(pathFor(locale))} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={absolute(pathFor(defaultLocale))} />
      <script dangerouslySetInnerHTML={{ __html: redirect }} />
      <main className="grid min-h-screen place-items-center px-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <LogoMark className="size-10" />
          <nav className="flex gap-3 text-sm">
            {locales.map((locale) => (
              <a key={locale} href={pathFor(locale)} hrefLang={localeTags[locale].lang} className="rounded-lg border border-border px-4 py-2 hover:border-accent/50">
                {localeTags[locale].name}
              </a>
            ))}
          </nav>
        </div>
      </main>
    </>
  )
}
