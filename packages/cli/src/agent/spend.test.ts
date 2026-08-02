import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseAiderCost, parseClaudeCost, RunBudget, usd } from './spend.ts'

describe('parsing aider cost', () => {
  test('reads the session total from the real output shape', () => {
    const out = [
      'Tokens: 3.1k sent, 412 received.',
      'Cost: $0.0123 message, $0.0456 session.',
    ].join('\n')
    assert.equal(parseAiderCost(out), 0.0456)
  })

  test('takes the last session figure when several are printed', () => {
    const out = [
      'Cost: $0.01 message, $0.01 session.',
      'Cost: $0.02 message, $0.03 session.',
    ].join('\n')
    assert.equal(parseAiderCost(out), 0.03)
  })

  test('falls back to a bare Cost line if the wording changes', () => {
    assert.equal(parseAiderCost('Cost: $1.25'), 1.25)
  })

  test('returns null rather than 0 when no cost was printed', () => {
    // A local-only model prints nothing. Recording 0 would silently understate
    // spend; null lets the caller tell "free" from "unknown".
    assert.equal(parseAiderCost('Applied edit to src/app.tsx\nDone.'), null)
  })

  test('is not fooled by a dollar amount in the diff', () => {
    assert.equal(parseAiderCost('+  const price = "$9.99"\n'), null)
  })
})

describe('parsing claude cost', () => {
  test('reads total_cost_usd', () => {
    assert.equal(parseClaudeCost(JSON.stringify({ total_cost_usd: 0.42, result: 'CLEAN' })), 0.42)
  })

  test('accepts the alternative field spellings', () => {
    assert.equal(parseClaudeCost(JSON.stringify({ cost_usd: 0.1 })), 0.1)
    assert.equal(parseClaudeCost(JSON.stringify({ totalCostUsd: 0.2 })), 0.2)
  })

  test('returns null for plain text', () => {
    assert.equal(parseClaudeCost('CLEAN'), null)
  })
})

describe('run budget', () => {
  const budget = (perRun: number, perDay = 0) => new RunBudget('t', perRun, perDay)

  test('a zero cap means no limit', () => {
    const b = budget(0)
    b.add('aider', 100)
    assert.equal(b.exceeded(), null)
  })

  test('stops once the per-run cap is reached', () => {
    const b = budget(1)
    b.add('aider', 0.4)
    assert.equal(b.exceeded(), null)
    b.add('aider', 0.7)
    assert.match(b.exceeded() ?? '', /run budget reached/)
  })

  test('ignores nonsense amounts rather than corrupting the total', () => {
    const b = budget(10)
    b.add('aider', Number.NaN)
    b.add('aider', -5)
    b.add('aider', Number.POSITIVE_INFINITY)
    assert.equal(b.total, 0)
  })

  test('summary reports the run total and the cap', () => {
    const b = budget(5)
    b.add('aider', 1.5)
    assert.match(b.summary(), /this run \$1\.50/)
    assert.match(b.summary(), /cap \$5\.00/)
  })
})

describe('formatting', () => {
  test('always two decimals', () => {
    assert.equal(usd(0), '$0.00')
    assert.equal(usd(1.005), '$1.00')
    assert.equal(usd(12.3456), '$12.35')
  })
})
