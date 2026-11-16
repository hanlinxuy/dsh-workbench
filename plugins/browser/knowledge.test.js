import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createKnowledge} from './knowledge.js'
test('local-first lookup returns full source text, dates, stale/no-hit/unavailable without guessing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'workbench-knowledge-')),index=join(dir,'index.json')
 const run=createKnowledge({index,fallbackSources:['https://docs.example.invalid']})
 const doc={id:'queue',title:'Queue limits',body:'Interactive requests have a reserved quota.',sourceRef:'https://docs.example.invalid/queue',indexedAt:'2020-01-01T00:00:00Z'}
 try{
  assert.equal((await run({action:'search',query:'quota'})).status,'unavailable')
  await writeFile(index,JSON.stringify({version:1,documents:[doc]}))
  const hit=await run({action:'search',query:'reserved quota'});assert.equal(hit.documents[0].body,doc.body);assert.equal(hit.documents[0].stale,true);assert.equal(hit.documents[0].sourceRef,doc.sourceRef)
  assert.equal((await run({action:'read',id:'queue'})).documents[0].indexedAt,doc.indexedAt)
  assert.equal((await run({action:'search',query:'nonexistent'})).status,'no-hit')
  await writeFile(index,'broken');const broken=await run({action:'read',id:'queue'});assert.equal(broken.status,'unavailable');assert.equal(broken.fallbackSources.length,1)
 }finally{await rm(dir,{recursive:true,force:true})}
})
