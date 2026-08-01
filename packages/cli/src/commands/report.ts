import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths } from '../core/paths.ts'
import { notify } from '../agent/notify.ts'

/**
 * The daily digest. Reports what was *built*, not just how many commits landed —
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

  const prdPath = join(dir, 'PRD.md')
  const prd = existsSync(prdPath) ? readFileSync(prdPath, 'utf8') : ''
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
    prdDone: (prd.match(/^- \[[xX]\]/gm) ?? []).length,
    prdOpen: (prd.match(/^- \[ \]/gm) ?? []).length,
    lastNote: notes.at(-1)?.slice(0, 180) ?? null,
    complete: progress.includes('ALL_TASKS_COMPLETE'),
  }
}

async function machineHealth(): Promise<string[]> {
  const lines: string[] = []

  const df = await run('df', ['-h', process.env['HOME'] ?? '/'])
  const dfLine = df.stdout.split('\n')[1]?.trim().split(/\s+/)
  if (dfLine && dfLine.length >= 5) {
    lines.push(`- Disk: ${dfLine[3]} free of ${dfLine[1]} (${dfLine[4]} used)`)
  }

  const uptime = await run('uptime', [])
  const load = uptime.stdout.match(/load averages?:\s*(.+)$/)
  if (load?.[1]) lines.push(`- Load: ${load[1].trim()}`)

  if (await which('nvidia-smi')) {
    const gpu = await run('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits',
    ])
    const first = gpu.stdout.trim().split('\n')[0]?.split(',').map((s) => s.trim())
    if (first && first.length >= 5) {
      lines.push(`- GPU: ${first[0]} | ${first[1]}% util | ${first[2]}/${first[3]} MiB | ${first[4]}C`)
    }
  }

  const ollama = await run('systemctl', ['is-active', '--quiet', 'ollama'])
  lines.push(`- Ollama: ${ollama.ok ? 'running' : 'STOPPED'}`)

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

  lines.push('', '🖥️ Machine', ...(await machineHealth()))
  const report = lines.join('\n')

  if (opts.stdout) {
    ui.info(report)
    return 0
  }

  const sent = await notify(report)
  if (!sent) {
    ui.warn('Telegram not configured — printing instead.')
    ui.info(report)
  }
  return 0
}
