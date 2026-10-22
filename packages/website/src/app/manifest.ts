import type { MetadataRoute } from 'next'
import { site } from '@/content/site'
import { en } from '@/i18n/dictionaries/en'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: en.meta.description,
    start_url: '/',
    display: 'browser',
    background_color: '#16151a',
    theme_color: '#7c5cff',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  }
}
