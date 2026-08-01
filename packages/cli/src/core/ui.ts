import { styleText } from 'node:util'

/** Colour only when the terminal will render it; logs and pipes stay clean. */
const useColor = process.stdout.isTTY && !process.env['NO_COLOR']

type Style = Parameters<typeof styleText>[0]

function paint(style: Style, text: string): string {
  return useColor ? styleText(style, text) : text
}

export const ui = {
  heading(text: string): void {
    console.log('')
    console.log(paint(['bold'], text))
    console.log(paint(['dim'], '─'.repeat(Math.min(text.length, 60))))
  },
  info(text: string): void {
    console.log(text)
  },
  step(text: string): void {
    console.log(`${paint(['cyan'], '→')} ${text}`)
  },
  ok(text: string): void {
    console.log(`${paint(['green'], '✓')} ${text}`)
  },
  warn(text: string): void {
    console.log(`${paint(['yellow'], '!')} ${text}`)
  },
  error(text: string): void {
    console.error(`${paint(['red'], '✗')} ${text}`)
  },
  dim(text: string): void {
    console.log(paint(['dim'], text))
  },
  blank(): void {
    console.log('')
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
      console.log(line.trimEnd())
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
