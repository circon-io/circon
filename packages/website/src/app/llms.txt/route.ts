import { legalDocuments } from '@/content/legal'
import { absolute, site } from '@/content/site'
import { locales, pages, pathFor, type PageId } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-static'

/**
 * llms.txt (llmstxt.org): the site as plain Markdown for language models and
 * answer engines. Built from the same dictionaries as the pages, so it cannot
 * say something the site does not.
 */
export function GET() {
  const en = getDictionary('en')
  const lines = [
    `# ${site.name}`,
    '',
    `> ${en.meta.description}`,
    '',
    en.hero.subtitle,
    '',
    '## Pages',
    '',
    ...locales.map((locale) => `- [${getDictionary(locale).meta.shortTitle} (${locale})](${absolute(pathFor(locale))})`),
    '',
    '## How it works',
    '',
    ...en.flow.steps.map((step, i) => `${i + 1}. **${step.title}** (${step.lane}): ${step.body}`),
    '',
    `## ${en.gate.title}`,
    '',
    en.gate.subtitle,
    '',
    ...en.gate.tiers.map((tier) => `- **${tier.title}** (${tier.cost}): ${tier.body}`),
    '',
    `## ${en.agents.title}`,
    '',
    en.agents.subtitle,
    '',
    ...en.agents.roles.map((role) => `- **${role.title}**: ${role.body}`),
    ...en.agents.points.map((point) => `- **${point.title}**: ${point.body}`),
    '',
    `## ${en.runner.title}`,
    '',
    en.runner.subtitle,
    '',
    ...en.runner.points.map((point) => `- **${point.title}**: ${point.body}`),
    '',
    'Install:',
    '',
    '```bash',
    site.installCommand,
    '```',
    '',
    '## Pricing',
    '',
    en.pricing.subtitle,
    '',
    ...en.pricing.plans.map((plan) => `- **${plan.name}** (${plan.price}): ${plan.features.join(', ')}`),
    '',
    '## FAQ',
    '',
    ...en.faq.items.flatMap((item) => [`### ${item.q}`, '', item.a, '']),
    '## Links',
    '',
    `- [Source code](${site.githubUrl})`,
    `- [Quick start](${site.docsUrl})`,
    `- [Dashboard](${site.dashboardUrl})`,
    ...locales.flatMap((locale) =>
      (Object.keys(pages) as PageId[]).map((id) => `- [${legalDocuments[id].title[locale]}](${absolute(pathFor(locale, id))})`),
    ),
    '',
  ]
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
