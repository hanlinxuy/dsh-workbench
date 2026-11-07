import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register, take, resume, dispatch } from './state.js'

test('takeover isolates projects and does not repeat an acknowledged user message', () => {
  const state = { projects: [] }
  register(state, { id: 'a', name: 'A' })
  register(state, { id: 'b', name: 'B' })
  const [a, b] = state.projects
  dispatch(a, { id: 'one' }); dispatch(b, { id: 'two' })
  take(a, 'message-1')
  assert.equal(a.job.status, 'submitting')
  assert.equal(b.owner, 'chief')
  assert.throws(() => dispatch(a, { id: 'three' }), /user control/)
  resume(a)
  assert.equal(take(a, 'message-1'), false)
  assert.equal(a.owner, 'chief')
})
