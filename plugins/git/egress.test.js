import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {approveEgress} from './egress.js'
test('external publishing requires a current human origin and new native approval for each request',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'egress-audit-'));let kind='user',decision='allowed-once',asks=0
 const options={target:'https://public.example/issues',payload:{title:'Bug',body:'Public reproduction'},exec:{agent:{id:'test'},signal:new AbortController().signal},controller:{events:async()=>({records:[{event:{type:'turn/start'}},{event:{type:'user/message',seq:3,data:{source:{kind}}}}]})},approval:{request:async()=>{asks++;return decision}},auditDirectory:dir}
 try{
  await approveEgress(options);await approveEgress(options);assert.equal(asks,2)
  decision='rejected';await assert.rejects(approveEgress(options),/not_confirmed/)
  kind='rpc';await assert.rejects(approveEgress(options),/background/);assert.equal(asks,3)
  kind='user'
  for(const body of ['password=do-not-send','Authorization: Bearer example','https://private.internal/path'])await assert.rejects(approveEgress({...options,payload:{body}}),/egress_denied/)
  assert.equal(asks,3)
  const log=await readFile(join(dir,'egress.ndjson'),'utf8');assert.doesNotMatch(log,/Public reproduction|do-not-send|Bearer/);assert.equal(log.trim().split('\n').length,2)
 }finally{await rm(dir,{recursive:true,force:true})}
})
