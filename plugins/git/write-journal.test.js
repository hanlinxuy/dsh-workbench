import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createWriteJournal} from './write-journal.js'
test('uncertain writes remain blocked after restart and audit contains no payload or credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'workbench-journal-'));let calls=0
 const args={action:'issue_create',repository:'test',body:'private-fixture-body',confirm:true}
 try{
  await assert.rejects(createWriteJournal(dir)(args,'/project',async()=>{calls++;throw Error('timeout with private-fixture-secret')}),/timeout/)
  await assert.rejects(createWriteJournal(dir)(args,'/project',async()=>calls++),/outcome_unknown/)
  assert.equal(calls,1)
  for(const file of await readdir(dir))assert.doesNotMatch(await readFile(join(dir,file),'utf8'),/private-fixture-body|private-fixture-secret/)
  await createWriteJournal(dir)(args,'/other-project',async()=>calls++)
  assert.equal(calls,2,'different workspaces do not share a fingerprint')
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('concurrent duplicate write is blocked; a completed write permits a later explicit request',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'workbench-journal-'));let release,started
 const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r),args={action:'commit',message:'fixture'}
 try{
  const first=createWriteJournal(dir)(args,'/project',async()=>{started();await gate;return 'done'})
  await ready
  await assert.rejects(createWriteJournal(dir)(args,'/project',async()=>assert.fail('duplicate executed')),/outcome_unknown/)
  release();assert.equal(await first,'done')
  assert.equal(await createWriteJournal(dir)(args,'/project',async()=>'new explicit call'),'new explicit call')
 }finally{await rm(dir,{recursive:true,force:true})}
})
