import { styleText } from 'node:util'

/** Color only when the terminal will render it; logs and pipes stay clean. */
const useColor = process.stdout.isTTY && !process.env['NO_COLOR']

type Style = Parameters<typeof styleText>[0]

function paint(style: Style, text: string): string {
  return useColor ? styleText(style, text) : text
}

/**
 * A second destination for every line the CLI prints, uncolored. A dispatched
 * run points it at the dashboard, so the log there reads like the terminal.
 */
let sink: ((line: string) => void) | null = null

export function setOutputSink(next: ((line: string) => void) | null): void {
  sink = next
}

function out(line: string, plain: string = line): void {
  console.log(line)
  sink?.(plain)
}

export const ui = {
  heading(text: string): void {
    out('')
    out(paint(['bold'], text), text)
    out(paint(['dim'], '─'.repeat(Math.min(text.length, 60))), '─'.repeat(Math.min(text.length, 60)))
  },
  info(text: string): void {
    out(text)
  },
  step(text: string): void {
    out(`${paint(['cyan'], '→')} ${text}`, `→ ${text}`)
  },
  ok(text: string): void {
    out(`${paint(['green'], '✓')} ${text}`, `✓ ${text}`)
  },
  warn(text: string): void {
    out(`${paint(['yellow'], '!')} ${text}`, `! ${text}`)
  },
  error(text: string): void {
    console.error(`${paint(['red'], '✗')} ${text}`)
    sink?.(`✗ ${text}`)
  },
  dim(text: string): void {
    out(paint(['dim'], text), text)
  },
  blank(): void {
    out('')
  },
  /** Left-aligned columns; widths derived from content. */
  table(rows: string[][]): void {
    if (rows.length === 0) return
    const widths: number[] = []
    for (const row of rows) {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] ?? 0, stripAnsi(cell).length)
      })
    }
    for (const row of rows) {
      const line = row
        .map((cell, i) => {
          const pad = (widths[i] ?? 0) - stripAnsi(cell).length
          return i === row.length - 1 ? cell : cell + ' '.repeat(pad)
        })
        .join('  ')
      out(line.trimEnd(), stripAnsi(line).trimEnd())
    }
  },
  label: {
    ok: () => paint(['green'], 'ok'),
    missing: () => paint(['yellow'], 'missing'),
    outdated: () => paint(['magenta'], 'outdated'),
    foreign: () => paint(['blue'], 'foreign'),
    failed: () => paint(['red'], 'failed'),
    skipped: () => paint(['dim'], 'skipped'),
  },
  bold: (text: string) => paint(['bold'], text),
  muted: (text: string) => paint(['dim'], text),
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g
function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}
