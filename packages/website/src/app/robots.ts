import type { MetadataRoute } from 'next'
import { absolute } from '@/content/site'

export const dynamic = 'force-static'

/**
 * Everyone may read everything, AI crawlers included and by name: being
 * quotable by answer engines is the point of the FAQ and llms.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      {
        userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'],
        allow: '/',
      },
    ],
    sitemap: absolute('/sitemap.xml'),
  }
}
