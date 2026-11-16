import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const hooks=registerHooks({resolve(id,ctx,next){if(id==='@deepseek-ai/dsh-tools')return {url:'data:text/javascript,export const defineTool=x=>x',shortCircuit:true};return next(id,ctx)}})
const {apply}=await import('./index.js');hooks.deregister()
test('preview sends zero requests; confirm cannot replace an actual native approval',async t=>{
 let tool,requests=0,asks=0,outcome='rejected'
 t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response('{"iid":9}')})
 await apply({configEditor:{documentPath:join(tmpdir(),'wb-nonexistent-approval-profile/patch.yml')},workingDirectory:{ensure:async()=>undefined},tools:{register:value=>{if(value.name==='workbench_git_write')tool=value}},effect:()=>{},get:name=>name==='approval'?({request:async()=>{asks++;return outcome}}):undefined},{platforms:{lab:{kind:'gitlab',network:'internal',hosts:['gitlab.example.invalid'],apiBase:'https://gitlab.example.invalid/api/v4',apiWrites:['mr_create']}},repositories:{fixture:{path:tmpdir(),platform:'lab',apiRepo:'team/repo'}}})
 const args={action:'mr_create',repository:'fixture',title:'Test',body:'Test fixture',source_branch:'feature',target_branch:'main'}
 const execution={agent:{},signal:new AbortController().signal}
 assert.equal(JSON.parse(await tool.execute(args,execution)).dryRun,true);assert.equal(requests,0);assert.equal(asks,0)
 await assert.rejects(tool.execute({...args,confirm:true},execution),/not_confirmed/);assert.equal(requests,0);assert.equal(asks,1)
 outcome='allowed-once';await tool.execute({...args,confirm:true},execution);assert.equal(requests,1);assert.equal(asks,2)
 await tool.execute({...args,confirm:true},execution);assert.equal(asks,3,'every write asks again')
 await assert.rejects(tool.execute({...args,confirm:true},{signal:execution.signal}),/interactive host approval/)
 assert.equal(requests,2)
})
