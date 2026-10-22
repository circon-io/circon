/**
 * Where things live. The canonical origin is what every absolute URL (canonical,
 * hreflang, sitemap, Open Graph, JSON-LD) is built from, so a staging build can
 * set NEXT_PUBLIC_SITE_URL and point nothing at production. The deploy workflow
 * sets both from WEBSITE_DOMAIN and DASHBOARD_ORIGIN; the fallbacks are production.
 */
export const site = {
  name: 'circon',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://circon.io').replace(/\/$/, ''),
  dashboardUrl: (process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://platform.circon.io').replace(/\/$/, ''),
  githubUrl: 'https://github.com/circon-io/circon',
  installCommand: 'curl -fsSL https://raw.githubusercontent.com/circon-io/circon/main/init.sh | bash',
} as const

export function absolute(path: string): string {
  return `${site.url}${path}`
}
