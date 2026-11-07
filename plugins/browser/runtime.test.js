import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBrowser } from './runtime.js'

test('uses the pinned package, validates routing and arguments before execution', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-unit-'))
  const run = createBrowser({ home })
  try {
    assert.match(await run({ action: 'version' }), /agent-browser 0\.41\.2/)
    await assert.rejects(run({ action: 'open', account: '../other', target: 'https://example.com' }), /account/)
    await assert.rejects(run({ action: 'fill', target: '@e1' }), /Missing argument/)
    await assert.rejects(run({ action: 'connect', target: '9222' }), /Unsupported/)
    await assert.rejects(run({ action: 'click', target: '--auto-connect' }), /unsupported option/)
  } finally { await rm(home, { recursive: true, force: true }) }
})
