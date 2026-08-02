import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readTasks, openTasks, markComplete, inferCompletedTask, allComplete, taskId } from './progress.ts'

let dir = ''

function writePrd(body: string) {
  writeFileSync(join(dir, 'PRD.md'), body)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'circon-progress-'))
  mkdirSync(join(dir, '.circon'), { recursive: true })
})

after(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
})

describe('reading tasks', () => {
  test('only checkbox bullets count, prose is ignored', () => {
    writePrd(`# PRD

Some prose that mentions - [ ] nothing in particular inline.

## Task Backlog
- [ ] Build the login screen
- [x] Set up the repo
* [ ] Wire the API
`)
    const tasks = readTasks(dir)
    assert.deepEqual(
      tasks.map((t) => t.text),
      ['Build the login screen', 'Set up the repo', 'Wire the API'],
    )
  })

  test('a checkbox already ticked by a human counts as done', () => {
    writePrd('- [x] Already handled\n- [ ] Not yet\n')
    const tasks = readTasks(dir)
    assert.equal(tasks[0]?.done, true)
    assert.equal(tasks[1]?.done, false)
  })

  test('no PRD means no tasks, not a crash', () => {
    assert.deepEqual(readTasks(dir), [])
  })

  test('a corrupt progress file does not lose the task list', () => {
    writePrd('- [ ] Something\n')
    writeFileSync(join(dir, '.circon', 'progress.json'), '{not json')
    assert.equal(readTasks(dir).length, 1)
  })
})

describe('completion recorded outside PRD.md', () => {
  test('marking complete does not modify PRD.md', () => {
    const original = '- [ ] Build the login screen\n- [ ] Wire the API\n'
    writePrd(original)

    markComplete(dir, 'Build the login screen', 'abc123')

    // This is the whole point: the human owns PRD.md, so merging main mid-run
    // can never conflict on it.
    assert.equal(readFileSync(join(dir, 'PRD.md'), 'utf8'), original)
  })

  test('completion survives into the next read', () => {
    writePrd('- [ ] Build the login screen\n- [ ] Wire the API\n')
    markComplete(dir, 'Build the login screen', 'abc123')

    const tasks = readTasks(dir)
    assert.equal(tasks[0]?.done, true)
    assert.equal(tasks[0]?.commit, 'abc123')
    assert.equal(tasks[1]?.done, false)
    assert.deepEqual(openTasks(dir).map((t) => t.text), ['Wire the API'])
  })

  test('ids are stable across edits to other lines', () => {
    const before = taskId('Wire the API')
    writePrd('- [ ] A totally different first task\n- [ ] Wire the API\n')
    const after = readTasks(dir).find((t) => t.text === 'Wire the API')?.id
    assert.equal(after, before)
  })

  test('allComplete only when every task is done', () => {
    writePrd('- [ ] One\n- [ ] Two\n')
    assert.equal(allComplete(dir), false)
    markComplete(dir, 'One')
    assert.equal(allComplete(dir), false)
    markComplete(dir, 'Two')
    assert.equal(allComplete(dir), true)
  })

  test('an empty PRD is not "complete"', () => {
    writePrd('# PRD\n\nNo tasks yet.\n')
    assert.equal(allComplete(dir), false)
  })
})

describe('inferring what the agent finished', () => {
  const open = [
    { id: 'a', text: 'Build the login screen', done: false },
    { id: 'b', text: 'Wire the API', done: false },
  ]

  test('an exact COMPLETED: line wins', () => {
    const got = inferCompletedTask(dir, 'Did some work.\nCOMPLETED: Wire the API', open)
    assert.equal(got?.text, 'Wire the API')
  })

  test('a loose match still resolves', () => {
    const got = inferCompletedTask(dir, 'COMPLETED: Wire the API endpoint', open)
    assert.equal(got?.text, 'Wire the API')
  })

  test('falls back to the highest-priority open task', () => {
    const got = inferCompletedTask(dir, 'no declaration here', open)
    assert.equal(got?.text, 'Build the login screen')
  })

  test('returns null when nothing is open', () => {
    assert.equal(inferCompletedTask(dir, 'COMPLETED: anything', []), null)
  })
})
