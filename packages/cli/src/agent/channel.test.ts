import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { BatchedChannel, type Outbound } from './channel.ts'

function channel(maxLines = 50) {
  const sent: Outbound[] = []
  // A long interval: these tests drive flushing explicitly.
  const ch = new BatchedChannel((m) => sent.push(m), { intervalMs: 60_000, maxLines })
  return { ch, sent }
}

const logged = (sent: Outbound[]) =>
  sent.flatMap((m) => (m.type === 'log' ? m.lines : []))

describe('run channel', () => {
  test('holds a partial line until its newline arrives', () => {
    const { ch, sent } = channel()
    ch.log('Applied ed')
    ch.flush()
    assert.deepEqual(logged(sent), [])
    ch.log('it to app.tsx\nnext')
    ch.flush()
    assert.deepEqual(logged(sent), ['Applied edit to app.tsx'])
    ch.close()
  })

  test('strips color and collapses carriage-return progress', () => {
    const { ch, sent } = channel()
    ch.log('\u001b[32m✓\u001b[0m done\n10%\r50%\r100%\n')
    ch.flush()
    assert.deepEqual(logged(sent), ['✓ done', '100%'])
    ch.close()
  })

  test('sends in batches, not a frame per line', () => {
    const { ch, sent } = channel(3)
    ch.log('a\nb\nc\nd\n')
    assert.equal(sent.length, 1)
    assert.deepEqual(logged(sent), ['a', 'b', 'c', 'd'])
    ch.close()
  })

  test('caps a pathological line', () => {
    const { ch, sent } = channel()
    ch.log(`${'x'.repeat(10_000)}\n`)
    ch.flush()
    assert.equal(logged(sent)[0]?.length, 2_001)
    ch.close()
  })

  test('finishing flushes the tail before announcing the outcome', () => {
    const { ch, sent } = channel()
    ch.started({ runId: 'r', project: 'p', branch: 'b' })
    ch.log('last words')
    ch.finished({ runId: 'r', outcome: 'complete', costUsd: 1.5 })
    assert.deepEqual(sent.map((m) => m.type), ['run-started', 'log', 'run-finished'])
    assert.deepEqual(logged(sent), ['last words'])
    ch.close()
  })

  test('progress is a heartbeat carrying the run', () => {
    const { ch, sent } = channel()
    ch.progress({ runId: 'r', project: 'p', branch: 'b', iteration: 3, costUsd: 0.4 })
    assert.deepEqual(sent[0], {
      type: 'heartbeat',
      state: { status: 'running', runId: 'r', project: 'p', branch: 'b', iteration: 3, costUsd: 0.4 },
    })
    ch.close()
  })
})
