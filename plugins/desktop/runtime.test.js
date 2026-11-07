import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDesktop } from './runtime.js'
test('pinned native release and explicit command boundary', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-desktop-test-'))
  const run = createDesktop({ home })
  try {
    assert.match(await run({ action: 'version' }), /1\.2\.0/)
    await assert.rejects(run({ action: 'shell' }), /Unsupported/)
    await assert.rejects(run({ action: 'snapshot' }), /Missing/)
    await assert.rejects(run({ action: 'click', ref: '--headed' }), /CLI options/)
  } finally { await rm(home, { recursive: true, force: true }) }
})
