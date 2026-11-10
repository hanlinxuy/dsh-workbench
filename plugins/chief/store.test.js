import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from './store.js'

test('persists ordered state and excludes a second writer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-store-'))
  try {
    const store = await openStore(dir)
    await assert.rejects(openStore(dir), /locked/)
    store.state.route = 'first'
    const first = store.save()
    store.state.route = 'second'
    await Promise.all([first, store.save()])
    await store.close()
    const reopened = await openStore(dir)
    assert.equal(reopened.state.route, 'second')
    await reopened.close()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('concurrent opens diagnose in-process reentry and close is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-reentry-'))
  const results = await Promise.allSettled([openStore(dir), openStore(join(dir, '.'))])
  const store = results.find(result => result.status === 'fulfilled')?.value
  try {
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    const error = results.find(result => result.status === 'rejected').reason
    assert.match(error.message, /already opening\/open in this process/)
    assert.ok(error.message.includes(`pid ${process.pid}`))
    assert.ok(error.message.includes('chief-reentry-'))
    await Promise.all([store.close(), store.close()])
    const next = await openStore(dir)
    await next.close()
  } finally { await store?.close(); await rm(dir, { recursive: true, force: true }) }
})

test('failed state save still closes memory and releases the writer lease', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-save-fail-'))
  const store = await openStore(dir)
  try {
    // A directory at the atomic-write target forces rename to fail on every OS.
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'state.json'))
    await assert.rejects(store.save())
    await assert.rejects(store.close())
    await assert.rejects(store.memory.update({ id: 'a', name: 'A' }, {}), /closing/)
    await rm(join(dir, 'state.json'), { recursive: true })
    const next = await openStore(dir)
    await next.close()
  } finally { await store.close().catch(() => {}); await rm(dir, { recursive: true, force: true }) }
})

test('refuses invalid persisted state rather than replacing it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-store-'))
  try {
    await writeFile(join(dir, 'state.json'), '{broken')
    await assert.rejects(openStore(dir), SyntaxError)
    await assert.rejects(openStore(dir), SyntaxError)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('writer lease is released after abrupt process exit', async () => {
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const dir = await mkdtemp(join(tmpdir(), 'chief-crash-'))
  const moduleUrl = new URL('./store.js', import.meta.url).href
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {openStore} from ${JSON.stringify(moduleUrl)}; await openStore(${JSON.stringify(dir)}); process.stdout.write('ready\\n'); setInterval(()=>{},1000)`], {stdio:['ignore','pipe','inherit']})
  try {
    await once(child.stdout, 'data')
    await assert.rejects(openStore(dir), error => {
      assert.match(error.message, /writer lease unavailable/)
      assert.match(error.message, /another process or store instance/)
      assert.match(error.cause.message, /locked/)
      assert.ok(error.message.includes(`pid ${process.pid}`))
      return true
    })
    child.kill('SIGKILL')
    await once(child, 'exit')
    const reopened = await openStore(dir)
    await reopened.close()
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await rm(dir, {recursive:true,force:true})
  }
})

test('a late callback cannot write after the writer lease is released', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chief-close-'))
  try {
    const store=await openStore(dir)
    store.state.route='saved'
    await store.save()
    await store.close()
    const next=await openStore(dir)
    store.state.route='late'
    await assert.rejects(store.save(),/closing/)
    assert.equal(next.state.route,'saved')
    await next.close()
  } finally { await rm(dir,{recursive:true,force:true}) }
})
