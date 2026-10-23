/**
 * The one format every advisory pass answers in — code review, design review
 * and security audit alike: one finding per line, `- <where>: <problem> -> <fix>`,
 * or exactly `CLEAN`.
 */

const MAX_FINDINGS = 30

export function parseFindings(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim())
  if (lines.some((l) => l === 'CLEAN')) return []
  return lines
    .filter((l) => /^[-*]\s+\S/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').slice(0, 400))
    .slice(0, MAX_FINDINGS)
}
