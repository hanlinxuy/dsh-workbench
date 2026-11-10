import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
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

test('eval remains unavailable even with claimed approval; rejection has no browser side effects', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-deny-'))
  const run = createBrowser({ home })
  const secret = 'private-expression-marker'
  try {
    for (const action of ['eval', 'evaluate']) {
      for (const confirm of [undefined, false, true, 'true', 1]) {
        await assert.rejects(run({ action, confirm, target: secret, value: secret,
          expression: secret, approved: true, hostApproved: true }), error => {
          assert.match(error.message, /eval is unavailable/)
          assert.match(error.message, /confirm=true does not authorize/)
          assert.ok(!error.message.includes(secret))
          return true
        })
      }
    }
    for (const action of ['Eval', 'EVAL', 'eval ', ' eval', 'evaluate\n', 'execute', 'javascript', 'get', '__proto__', 'constructor']) {
      await assert.rejects(run({ action, target: secret, confirm: true }), /Unsupported browser action/)
    }
    assert.deepEqual(await readdir(home), [], 'rejected requests must not create an account or launch AB')
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('open rejects script and non-HTTP navigation before launching AB', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-url-deny-'))
  const run = createBrowser({ home })
  try {
    for (const target of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>', 'file:///tmp/test.html',
      'about:blank', 'ftp://example.com/',
    ]) {
      await assert.rejects(run({ action: 'open', target, confirm: true }), /only HTTP\(S\) URLs/)
    }
    assert.deepEqual(await readdir(home), [])
  } finally { await rm(home, { recursive: true, force: true }) }
})

 test('child environment excludes unrelated credentials', async()=>{
 const home=await mkdtemp(join(tmpdir(),'env-boundary-'));process.env.WORKBENCH_TEST_SECRET='never-forward';
 const calls=[];const run=createBrowser({home},async(file,args,options)=>{calls.push({args,env:options.env});return {stdout:'{"ok":true}',stderr:''}});
 try{await run({action:'version'});assert.equal(calls[0].env.WORKBENCH_TEST_SECRET,undefined);assert.ok(calls[0].env.PATH);}
 finally{delete process.env.WORKBENCH_TEST_SECRET;await rm(home,{recursive:true,force:true})}
 })
