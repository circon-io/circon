import { Badge, cx, type Tone } from '../ui/primitives'

/**
 * Advisory findings — design review or security audit — in the one format every
 * pass answers in: `<where>: <problem> -> <fix>`, optionally led by a severity.
 */

const SEVERITY: Record<string, Tone> = { high: 'danger', medium: 'warning', low: 'neutral' }

function split(finding: string) {
  const severity = /^\[(high|medium|low)\]\s*/i.exec(finding)
  const rest = severity ? finding.slice(severity[0].length) : finding
  const [problem, fix] = rest.split(/\s+->\s+/, 2)
  const where = /^([^:]{1,80}):\s+/.exec(problem ?? '')
  return {
    severity: severity?.[1]?.toLowerCase() ?? null,
    where: where?.[1] ?? null,
    problem: where ? (problem ?? '').slice(where[0].length) : (problem ?? ''),
    fix: fix ?? null,
  }
}

export function FindingsList({ findings, className }: { findings: string[]; className?: string }) {
  return (
    <ul className={cx('flex flex-col divide-y divide-separator', className)}>
      {findings.map((finding, i) => {
        const f = split(finding)
        return (
          <li key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              {f.severity && <Badge tone={SEVERITY[f.severity] ?? 'neutral'}>{f.severity}</Badge>}
              {f.where && <span className="font-mono text-xs text-muted">{f.where}</span>}
            </div>
            <p className="text-sm">{f.problem}</p>
            {f.fix && <p className="text-sm text-muted">→ {f.fix}</p>}
          </li>
        )
      })}
    </ul>
  )
}
