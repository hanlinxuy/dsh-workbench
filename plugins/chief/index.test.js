import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate, setTimeout } from 'node:timers/promises'
import { openStore } from './store.js'

// Exercise the actual plugin adapter without requiring a running DSH host.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return next(specifier, context)
  },
})
const { apply } = await import('./index.js')
hooks.deregister()

function host({ failRegister = false, failRelease = false, createGate, onPrompt } = {}) {
  const effects = new Map()
  const events = new Map()
  const stats = { restrict: 0, released: 0, registrations: 0, created: 0 }
  let route, tool
  const agent = { id: 'chief', ctx: { tools: {
    restrict() { stats.restrict++; return () => { stats.released++ } },
    register(value) {
      stats.registrations++
      if (failRegister) throw new Error('registration failed')
      tool = value
      return () => { if (failRelease) throw new Error('tool release failed') }
    },
  } }, session: {} }
  const ctx = {
    effect(setup, name) { const dispose = setup(); effects.set(name, { setup, dispose }) },
    on(name, callback) { events.set(name, callback) },
    agents: { list: () => [agent] },
    tools: { guard() {} },
    systemPrompt: { section: () => () => {} },
    connection: { fetch: { register(value) { route = value; return () => {} } } },
    workspaceRegistry: { resolveByPath: async () => ({ id: 'workspace' }) },
    sessionController: {
      async create() { stats.created++; if (createGate) await createGate.promise; return { sessionId: 'project' } },
      resolveAgent: async id => ({ agent: { ...agent, id } }),
      inspect: async () => ({ events: [] }),
      prompt: async value => { await onPrompt?.(value, stats) },
    },
    sessionTitle: { rename: async () => {} },
    agentPresets: { composedPreset: () => 'independent-chief' },
  }
  return { ctx, effects, stats, events, agent, get tool() { return tool },
    async request(endpoint, payload) { return (await route.fetch(new Request('http://localhost/api/independent-chief', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }))).json() },
  }
}

async function eventually(work) {
  for (let i = 0; i < 200; i++) {
    const value = await work()
    if (value) return value
    await setTimeout(5)
  }
  throw new Error('Expected asynchronous state was not reached')
}

async function fixture(options, projects = []) {
  const dir = await mkdtemp(join(tmpdir(), 'chief-adapter-'))
  await writeFile(join(dir, 'state.json'), JSON.stringify({ version: 1, chiefSessionId: 'chief', projects, route: null }))
  const mock = host(options)
  apply(mock.ctx, { home: dir })
  return { dir, mock, effect: mock.effects.get('independent chief store') }
}

test('actual effect reentry creates only one initialization and duplicate cleanup is harmless', async () => {
  const { dir, mock, effect } = await fixture()
  const second = effect.setup()
  try {
    await eventually(async () => (await mock.request('state')).ok)
    assert.equal(mock.stats.registrations, 1)
    for (const action of ['remember', 'review', 'dispatch', 'select']) {
      await assert.rejects(mock.tool.execute({ action, name: 'P' }, { agent: { id: 'project-worker' } }), /Only the configured Chief/)
    }
    await effect.dispose()
    assert.equal((await mock.request('state')).ok, true)
    await second()
    await second()
    assert.equal(mock.stats.released, 1)
    const next = await openStore(dir)
    await next.close()
  } finally { await effect.dispose(); await second(); await rm(dir, { recursive: true, force: true }) }
})

test('registration failure releases lease but remains fail-closed until effect disposal', async () => {
  const { dir, mock, effect } = await fixture({ failRegister: true })
  try {
    const result = await eventually(async () => { const value = await mock.request('state'); return value.error?.message.includes('registration failed') && value })
    assert.equal(result.ok, false)
    assert.equal(mock.stats.restrict, 1)
    assert.equal(mock.stats.released, 0)
    const recreated = { ...mock.agent }
    assert.throws(() => mock.events.get('agent/created')({ agent: recreated }), /registration failed/)
    assert.equal(mock.stats.restrict, 2)
    assert.equal(mock.stats.released, 0)
    const next = await openStore(dir)
    await next.close()
    await effect.dispose()
    assert.equal(mock.stats.released, 2)
  } finally { await effect.dispose(); await rm(dir, { recursive: true, force: true }) }
})

test('recovery notification starts only after deny-all Chief restrictions are installed', async () => {
  let notifications = 0
  const project = { id: 'p', name: 'P', sessionId: 'project', owner: 'chief', seen: [], job: { requestId: 'request', status: 'completed', text: 'done', notification: 'pending' } }
  const { dir, mock, effect } = await fixture({ onPrompt: async (_value, stats) => { notifications++; assert.equal(stats.restrict, 1); assert.equal(stats.registrations, 1); assert.equal(stats.released, 0) } }, [project])
  try {
    await eventually(async () => (await mock.request('state')).ok)
    assert.equal(notifications, 1)
  } finally { await effect.dispose(); await rm(dir, { recursive: true, force: true }) }
})

test('tool disposer failure cannot leak the SQLite writer lease', async () => {
  const { dir, mock, effect } = await fixture({ failRelease: true })
  try {
    await eventually(async () => (await mock.request('state')).ok)
    await assert.rejects(effect.dispose(), /Chief tool cleanup failed/)
    assert.equal(mock.stats.released, 1)
    const next = await openStore(dir)
    await next.close()
  } finally { await effect.dispose().catch(() => {}); await rm(dir, { recursive: true, force: true }) }
})

test('teardown drains an admitted register before releasing its lease and tool restrictions', async () => {
  const gate = Promise.withResolvers()
  const { dir, mock, effect } = await fixture({ createGate: gate })
  let operation
  try {
    await eventually(async () => (await mock.request('state')).ok)
    operation = mock.tool.execute({ action: 'register', name: 'P', directory: dir }, { agent: mock.agent })
    await eventually(() => mock.stats.created === 1)
    const closing = effect.dispose()
    await setImmediate()
    assert.equal(mock.stats.released, 0)
    await assert.rejects(openStore(dir), /locked/)
    await assert.rejects(mock.tool.execute({ action: 'list' }, { agent: mock.agent }), /not ready|stopping/)
    gate.resolve()
    await operation
    await closing
    const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'))
    assert.equal(state.projects[0].sessionId, 'project')
    assert.equal(mock.stats.released, 1)
  } finally { gate.resolve(); await operation?.catch(() => {}); await effect.dispose(); await rm(dir, { recursive: true, force: true }) }
})
