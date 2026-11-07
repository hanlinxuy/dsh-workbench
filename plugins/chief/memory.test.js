import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { openStore } from './store.js'
import { createController } from './controller.js'
import { markdown, parseMemory, emptyMemory } from './memory.js'
const exec = promisify(execFile)

test('Markdown preserves empty values, multiline text and embedded headings', () => {
  const value = { ...emptyMemory(), blockers: 'Need approval\n## nextSteps\nDo not lose this', source: 'User said so' }
  assert.deepEqual(parseMemory(markdown('A', value)), value)
  assert.throws(() => parseMemory('# Invalid\n'), /Missing/)
})

test('project memory and review survive restart in Markdown and Git without changing control', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-memory-'))
  let store = await openStore(dir)
  const host = { createSession: async name => name, prompt: async () => {}, audit: async () => [{ type: 'call', name: 'read', arguments: '{}' }] }
  try {
    let controller = createController(store, host)
    await controller.register('A', '/a'); await controller.register('B', '/b')
    await controller.remember('A', { goal: 'Read docs', criteria: 'Cite actual file', blockers: 'Need human choice', nextSteps: 'Wait for choice', source: 'User instruction', priority: 'P1' })
    await controller.remember('A', { goal: 'Read project docs', source: 'User clarified' })
    assert.equal(controller.list().projects[0].memory.blockers, 'Need human choice')
    const request = await controller.dispatch('A', 'Review', { maxChars: 20 })
    await controller.finish('A', request, { status: 'completed', text: 'README evidence' })
    const review = { verdict: 'accepted', evidence: 'Read tool confirms README', blockers: 'Need human choice', nextSteps: 'Wait for choice' }
    await assert.rejects(controller.review('A', review), /complete report/)
    controller.read('A')
    await assert.rejects(controller.review('A', review), /complete tool audit/)
    await controller.audit('A')
    await controller.review('A', review)
    await controller.takeover('A', 'human-message')
    const before = controller.list()
    await store.close()
    store = await openStore(dir)
    controller = createController(store, host)
    const after = controller.list()
    assert.deepEqual(after.projects[0].memory, before.projects[0].memory)
    assert.equal(after.projects[0].owner, 'user')
    assert.equal(after.projects[1].owner, 'chief')
    assert.equal(after.projects[0].acceptance.verdict, 'accepted')
    assert.equal(after.projects[0].job.readThisTurn.complete, false)
    const file = join(store.memory.directory, 'projects', `${store.state.projects[0].id}.md`)
    assert.match(await readFile(file, 'utf8'), /Need human choice/)
    const log = await exec('git', ['-C', store.memory.directory, 'log', '--format=%s'])
    assert.equal(log.stdout.trim().split('\n').length, 3)
    const status = await exec('git', ['-C', store.memory.directory, 'status', '--porcelain'])
    assert.equal(status.stdout, '')
    await assert.rejects(controller.dispatch('A', 'new task'), /user control/)
    await controller.dispatch('B', 'independent work')
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('failed or overlong reports cannot pass acceptance; needs_changes persists separately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-review-'))
  const store = await openStore(dir)
  const controller = createController(store, { createSession: async () => 'a', prompt: async () => {}, audit: async () => [] })
  try {
    await controller.register('A', '/a')
    const id = await controller.dispatch('A', 'Read', { criteria: 'Short output', maxChars: 3 })
    await controller.finish('a', id, { status: 'completed', text: 'too long' })
    controller.read('A'); await controller.audit('A')
    const review = { verdict: 'accepted', evidence: 'Report length checked', blockers: 'Shorten report', nextSteps: 'Ask before repair' }
    await assert.rejects(controller.review('A', review), /length exceeded/)
    await controller.review('A', { ...review, verdict: 'needs_changes' })
    assert.equal(controller.list().projects[0].job.status, 'completed')
    assert.equal(controller.list().projects[0].acceptance.verdict, 'needs_changes')
    controller.startTurn()
    await assert.rejects(controller.review('A', { ...review, verdict: 'blocked' }), /complete report/)
    controller.read('A')
    store.state.projects[0].job.status = 'failed'
    await assert.rejects(controller.review('A', review), /Acceptance failed/)
    const previous = store.memory.review(id).file
    await controller.dispatch('A', 'Second task', { criteria: 'New task' })
    assert.equal(controller.list().projects[0].acceptance.verdict, 'pending')
    assert.match(await readFile(previous, 'utf8'), /needs_changes/)
    assert.equal(controller.list().projects[0].memory.blockers, 'Shorten report')
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('manual Markdown changes load on restart; malformed notes are not overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-edits-'))
  let store = await openStore(dir)
  try {
    const controller = createController(store, { createSession: async () => 'a' })
    await controller.register('A', '/a')
    await controller.remember('A', { blockers: 'Old', source: 'User' })
    const file = join(store.memory.directory, 'projects', `${store.state.projects[0].id}.md`)
    await store.close()
    await writeFile(file, (await readFile(file, 'utf8')).replace('> Old', '> New'))
    store = await openStore(dir)
    assert.equal(store.memory.get(store.state.projects[0].id).blockers, 'New')
    assert.match(store.memory.error, /uncommitted/)
    assert.match(createController(store, {}).list().memoryError, /uncommitted/)
    await store.close()
    await assert.rejects(store.memory.update(store.state.projects[0], { source: 'late' }), /closing/)
    await writeFile(file, '# broken\n')
    await assert.rejects(openStore(dir), /Missing/)
    assert.equal(await readFile(file, 'utf8'), '# broken\n')
    store = null
  } finally { if (store) await store.close(); await rm(dir, { recursive: true, force: true }) }
})

test('acceptance needs every audit page in the same turn, not just its last page', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-audit-'))
  const store = await openStore(dir)
  const controller = createController(store, { createSession: async () => 'a', prompt: async () => {}, audit: async () => Array.from({ length: 21 }, () => ({ type: 'call', name: 'read' })) })
  try {
    await controller.register('A', '/a')
    const id = await controller.dispatch('A', 'Read', { criteria: 'Inspect all calls' })
    await controller.finish('a', id, { status: 'completed', text: 'Report' })
    controller.read('A')
    const review = { verdict: 'accepted', evidence: 'All calls inspected', blockers: '', nextSteps: 'Wait' }
    await controller.audit('A', 20)
    await assert.rejects(controller.review('A', review), /complete tool audit/)
    assert.equal((await controller.audit('A', 0)).next, 20)
    await assert.rejects(controller.review('A', review), /complete tool audit/)
    assert.equal((await controller.audit('A', 20)).next, null)
    await controller.review('A', review)
    controller.startTurn(); controller.read('A')
    await assert.rejects(controller.review('A', review), /complete tool audit/)
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }) }
})
