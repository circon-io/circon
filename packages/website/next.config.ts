import type { NextConfig } from 'next'

/**
 * A static site: `next build` writes plain files to `out/`, and the Worker in
 * `worker/` serves them as static assets. Nothing renders at request time, so
 * there is nothing here that needs a server: no image optimization, no proxy,
 * no redirects (the one redirect, `/` to a language, is the Worker's).
 */
const nextConfig: NextConfig = {
  output: 'export',
  // `/en/` is `out/en/index.html`. Canonical URLs carry the slash to match.
  trailingSlash: true,
  images: { unoptimized: true },
  // The root layout sits under `[locale]`, so there is no single layout a
  // 404 could be composed from; global-not-found renders on its own.
  experimental: { globalNotFound: true },
}

export default nextConfig
