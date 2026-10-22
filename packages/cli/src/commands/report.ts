import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { run } from '../core/exec.ts'
import { machineHealth } from '../core/machine.ts'
import { ui } from '../core/ui.ts'
import { paths } from '../core/paths.ts'
import { readTasks } from '../agent/progress.ts'
import { spentToday, usd } from '../agent/spend.ts'

/**
 * This machine's digest. Reports what was *built*, not just how many commits landed —
 * commit subjects carry the PRD task name, so the list reads as work done.
 */

interface ProjectActivity {
  name: string
  commits: number
  agentCommits: number
  subjects: string[]
  prdDone: number
  prdOpen: number
  lastNote: string | null
  complete: boolean
}

/** One repo per project, so stop descending as soon as a .git is found. */
function findProjects(root: string, maxDepth = 3): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || !existsSync(dir)) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.includes('.git')) {
      found.push(dir)
      return
    }
    for (const entry of entries) {
      // Skipping node_modules keeps a vendored repo from appearing as a project.
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1)
      } catch {
        /* unreadable directory — skip */
      }
    }
  }
  walk(root, 0)
  return found
}

async function activityFor(dir: string, since: string): Promise<ProjectActivity | null> {
  const log = await run('git', ['-C', dir, 'log', `--since=${since}`, '--format=%s'])
  const subjects = log.ok ? log.stdout.split('\n').filter(Boolean) : []
  if (subjects.length === 0) return null

  // Completion lives in .circon/progress.json now, not in PRD checkboxes —
  // the agent no longer ticks them, so counting them would always read zero.
  const tasks = readTasks(dir)
  const progressPath = join(dir, 'progress.txt')
  const progress = existsSync(progressPath) ? readFileSync(progressPath, 'utf8') : ''
  const notes = progress.split('\n').filter((l) => l.trim() && !l.includes('ALL_TASKS_COMPLETE'))

  return {
    name: dir.startsWith(`${paths.projects}/`) ? dir.slice(paths.projects.length + 1) : dir,
    commits: subjects.length,
    agentCommits: subjects.filter((s) =>
      /^(feat|fix|chore|refactor|test|docs|build|ci)(\(.+\))?!?:/.test(s),
    ).length,
    subjects: subjects.slice(0, 6),
    prdDone: tasks.filter((t) => t.done).length,
    prdOpen: tasks.filter((t) => !t.done).length,
    lastNote: notes.at(-1)?.slice(0, 180) ?? null,
    complete: progress.includes('ALL_TASKS_COMPLETE'),
  }
}

async function machineLines(): Promise<string[]> {
  const h = await machineHealth()
  const lines: string[] = []
  if (h.diskFreeGb !== null && h.diskTotalGb !== null) lines.push(`- Disk: ${h.diskFreeGb} GB free of ${h.diskTotalGb} GB`)
  lines.push(`- Load: ${Math.round(h.loadPerCore * 100)}% of all cores`)
  if (h.gpu) {
    const g = h.gpu
    lines.push(`- GPU: ${g.name} | ${g.utilization}% util | ${g.memoryUsedMb}/${g.memoryTotalMb} MiB | ${g.temperatureC}C`)
  }
  lines.push(`- Ollama: ${h.ollama ? 'running' : 'STOPPED'}`)
  return lines
}

export async function reportCommand(opts: { stdout?: boolean } = {}): Promise<number> {
  const since = '24 hours ago'
  const activities: ProjectActivity[] = []
  for (const dir of findProjects(paths.projects)) {
    const a = await activityFor(dir, since)
    if (a) activities.push(a)
  }

  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })

  const lines: string[] = [`📊 circon Daily Report — ${date}`, '─'.repeat(30)]

  if (activities.length) {
    const total = activities.reduce((n, a) => n + a.commits, 0)
    const agent = activities.reduce((n, a) => n + a.agentCommits, 0)
    lines.push(`🤖 ${total} commits in 24h, ${agent} from the agent`)
    for (const a of activities) {
      lines.push('', `📁 ${a.name} — ${a.commits} commits (${a.agentCommits} agent)`)
      for (const s of a.subjects) lines.push(`   · ${s}`)
      if (a.commits > a.subjects.length) {
        lines.push(`   · … and ${a.commits - a.subjects.length} more`)
      }
      lines.push(`   PRD: ${a.prdDone} done / ${a.prdOpen} open`)
      if (a.lastNote) lines.push(`   Last note: ${a.lastNote}`)
      if (a.complete) lines.push('   ✅ backlog finished')
    }
  } else {
    lines.push('😴 No repository activity in the last 24h.')
  }

  const today = spentToday()
  if (today > 0) lines.push('', `💷 Spent today: ${usd(today)}`)

  lines.push('', '🖥️ Machine', ...(await machineLines()))
  const report = lines.join('\n')

  // The fleet-wide digest lives in the dashboard, built from what every runner
  // reports; this is the view from this one machine.
  ui.info(report)
  return 0
}
