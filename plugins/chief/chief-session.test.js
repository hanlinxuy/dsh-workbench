import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreChiefPreset } from './chief-session.js'

test('repairs a reused Chief in place and does not repeat the migration on restart', async () => {
  let preset = 'standard'
  const events = [{ type: 'user/message', data: { text: 'existing history' } }]
  const agent = { id: 'chief-existing', ctx: {}, session: { append(type, data) { events.push({ type, data }) } } }
  const ctx = {
    sessionController: { async resolveAgent(id) { assert.equal(id, agent.id); return { agent } } },
    agentPresets: {
      composedPreset() { return preset },
      async recompose(scope, id) { assert.equal(scope, agent.ctx); preset = id },
    },
  }
  await restoreChiefPreset(ctx, agent.id)
  await restoreChiefPreset(ctx, agent.id)
  assert.equal(preset, 'independent-chief')
  assert.deepEqual(events, [
    { type: 'user/message', data: { text: 'existing history' } },
    { type: 'agent-preset/selected', data: { agentPreset: 'independent-chief' } },
  ])
})

test('does not record a successful preset repair when the host fails', async () => {
  let appended = false
  const ctx = {
    sessionController: { async resolveAgent() { return { agent: { ctx: {}, session: { append() { appended = true } } } } } },
    agentPresets: { composedPreset() { return 'standard' }, async recompose() { throw new Error('preset unavailable') } },
  }
  await assert.rejects(restoreChiefPreset(ctx, 'chief'), /preset unavailable/)
  assert.equal(appended, false)
})
