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

 test('child environment excludes unrelated credentials', async()=>{
 const home=await mkdtemp(join(tmpdir(),'env-boundary-'));process.env.WORKBENCH_TEST_SECRET='never-forward';
 const calls=[];const run=createDesktop({home},async(file,args,options)=>{calls.push({args,env:options.env});return {stdout:'{"ok":true}',stderr:''}});
 try{await run({action:'type',ref:'@snapshot:e1',value:'-5'});assert.equal(calls[0].env.WORKBENCH_TEST_SECRET,undefined);assert.ok(calls[0].env.PATH);assert.deepEqual(calls[0].args.slice(-4),['type','@snapshot:e1','--','-5']);}
 finally{delete process.env.WORKBENCH_TEST_SECRET;await rm(home,{recursive:true,force:true})}
 })
