import { negotiateLocale } from '../src/i18n/negotiate.ts'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

/**
 * The only code on the site. wrangler.jsonc routes `/` here (and nothing else):
 * it answers with a redirect to `/en/` or `/de/`. Static files cannot read
 * Accept-Language, which is the one thing a language root needs.
 *
 * 302, not 301: the answer depends on the visitor, so no cache may keep it.
 */
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/') return env.ASSETS.fetch(request)

    const locale = negotiateLocale(request.headers.get('accept-language'), request.headers.get('cookie'))
    return new Response(null, {
      status: 302,
      headers: {
        location: new URL(`/${locale}/${url.search}`, url).toString(),
        vary: 'Accept-Language, Cookie',
        'cache-control': 'private, no-store',
      },
    })
  },
}

export default worker
