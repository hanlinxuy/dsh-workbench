import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLifecycle, startPolling } from './lifecycle.js'
import { openStore } from './store.js'

const deferred = () => Promise.withResolvers()

test('overlapping effect setup shares one store/controller lifecycle and closes once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-effect-'))
  const started = deferred()
  const errors = []
  let opens = 0
  let closes = 0
  const effect = createLifecycle(async () => {
    const store = await openStore(dir)
    opens++
    started.resolve()
    return async () => { closes++; await store.close() }
  }, error => errors.push(error))
  const disposeA = effect()
  const disposeB = effect()
  try {
    assert.equal(typeof disposeA, 'function')
    await started.promise
    await disposeA()
    await assert.rejects(openStore(dir), /already opening\/open in this process/)
    await disposeB()
    await disposeB()
    assert.equal(opens, 1)
    assert.equal(closes, 1)
    assert.deepEqual(errors, [])
    const reopened = await openStore(dir)
    await reopened.close()
  } finally { await disposeA(); await disposeB(); await rm(dir, { recursive: true, force: true }) }
})

test('pending initialization is drained before effect restart, even when disposal is not awaited', async () => {
  const started = deferred()
  const release = deferred()
  const restarted = deferred()
  const events = []
  const effect = createLifecycle(async stopped => {
    const first = events.length === 0
    events.push('open')
    if (first) { started.resolve(); await release.promise; assert.equal(stopped(), true) }
    else restarted.resolve()
    return async () => { events.push('close') }
  })
  const disposeA = effect()
  await started.promise
  const closing = disposeA()
  const disposeB = effect()
  assert.deepEqual(events, ['open'])
  release.resolve()
  await closing
  await restarted.promise
  await disposeB()
  assert.deepEqual(events, ['open', 'close', 'open', 'close'])
})

test('dispose before initialization starts cancels setup; failed setup can retry after cleanup', async () => {
  let calls = 0
  const errors = []
  const attempted = deferred()
  const effect = createLifecycle(async () => {
    calls++
    if (calls === 1) throw new Error('setup failed')
    attempted.resolve()
  }, error => errors.push(error.message))
  await effect()()
  assert.equal(calls, 0)
  const first = effect()
  await Promise.resolve()
  await first()
  assert.deepEqual(errors, ['setup failed'])
  const second = effect()
  await attempted.promise
  await second()
  assert.equal(calls, 2)
})

test('polling cleanup drains in-flight recovery before releasing the store', async () => {
  const started = deferred()
  const release = deferred()
  let count = 0
  const stop = startPolling(async () => { count++; started.resolve(); await release.promise }, assert.fail, 1)
  await started.promise
  let closed = false
  const closing = stop().then(() => { closed = true })
  await Promise.resolve()
  assert.equal(closed, false)
  release.resolve()
  await closing
  assert.equal(count, 1)
})
