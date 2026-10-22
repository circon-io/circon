import { cpus, loadavg } from 'node:os'
import { run, which } from './exec.ts'

/**
 * How the machine itself is doing: what the daily report used to print into
 * the journal. The daemon sends it to the control plane, where the dashboard
 * shows it on the runner's card; `circon report` prints it locally.
 */

export interface MachineHealth {
  diskFreeGb: number | null
  diskTotalGb: number | null
  /** One-minute load average divided by core count: 1 means every core busy. */
  loadPerCore: number
  gpu: GpuHealth | null
  /** Whether Ollama answers on its local port. */
  ollama: boolean
  checkedAt: string
}

export interface GpuHealth {
  name: string
  utilization: number
  memoryUsedMb: number
  memoryTotalMb: number
  temperatureC: number
}

/** `df -Pk` output: POSIX format, so a long device name never wraps the line. */
export function parseDf(stdout: string): { freeGb: number; totalGb: number } | null {
  const fields = stdout.trim().split('\n')[1]?.trim().split(/\s+/)
  const total = Number(fields?.[1])
  const free = Number(fields?.[3])
  if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0) return null
  const gb = (kb: number) => Math.round((kb / 1024 / 1024) * 10) / 10
  return { freeGb: gb(free), totalGb: gb(total) }
}

/** The first GPU from `nvidia-smi --format=csv,noheader,nounits`. */
export function parseNvidiaSmi(stdout: string): GpuHealth | null {
  const fields = stdout.trim().split('\n')[0]?.split(',').map((s) => s.trim())
  if (!fields || fields.length < 5 || !fields[0]) return null
  const [name, utilization, used, total, temperature] = fields
  const numbers = [utilization, used, total, temperature].map(Number)
  if (numbers.some((n) => !Number.isFinite(n))) return null
  return {
    name,
    utilization: numbers[0] ?? 0,
    memoryUsedMb: numbers[1] ?? 0,
    memoryTotalMb: numbers[2] ?? 0,
    temperatureC: numbers[3] ?? 0,
  }
}

async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function machineHealth(): Promise<MachineHealth> {
  const df = await run('df', ['-Pk', process.env['HOME'] ?? '/'])
  const disk = df.ok ? parseDf(df.stdout) : null

  let gpu: GpuHealth | null = null
  if (await which('nvidia-smi')) {
    const smi = await run('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits',
    ])
    if (smi.ok) gpu = parseNvidiaSmi(smi.stdout)
  }

  return {
    diskFreeGb: disk?.freeGb ?? null,
    diskTotalGb: disk?.totalGb ?? null,
    loadPerCore: Math.round(((loadavg()[0] ?? 0) / Math.max(1, cpus().length)) * 100) / 100,
    gpu,
    ollama: await ollamaUp(),
    checkedAt: new Date().toISOString(),
  }
}
