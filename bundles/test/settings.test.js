import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const hooks=registerHooks({resolve(specifier,ctx,next){if(specifier==='@deepseek-ai/dsh-atomic-write')return {url:'data:text/javascript,export const withFileLock=async(p,fn)=>fn()',shortCircuit:true};return next(specifier,ctx)}})
const {apply}=await import('../settings/runtime.js');hooks.deregister()
for(const live of [true,false,'failed'])test(`settings migration uses host profile, preserves config and reports ${live?'live reload':'restart required'}`,async()=>{
 const profile=await mkdtemp(join(tmpdir(),'wb-settings-'))
 try{
  await mkdir(join(profile,'node_modules/dsh-x-memory'),{recursive:true})
  await writeFile(join(profile,'node_modules/dsh-x-memory/package.json'),JSON.stringify({dsh:{bundle:{patch:'patch.yml'}}}))
  await writeFile(join(profile,'node_modules/dsh-x-memory/patch.yml'),'- insert:\n    - id: x-memory\n      name: dsh-x-memory\n')
  await writeFile(join(profile,'package.json'),JSON.stringify({dependencies:{'dsh-x-memory':'0.1.1'},dsh:{profile:{bundles:['dsh-x-memory','dsh-workbench-core']}}}))
  await writeFile(join(profile,'cordis.patch.yml'),'- id: x-memory\n  config:\n    autoInject: false\n')
  let route,running=true,exclusive=0,reloaded=0
  apply({configEditor:{documentPath:join(profile,'cordis.patch.yml')},effect(fn){fn()},connection:{fetch:{register(r){route=r}}},sessionController:{list:async()=>({items:[{running}]})},get:()=>live?{runExclusive:async fn=>{exclusive++;return fn()},reconcileProfile:async()=>{reloaded++;if(live==='failed')throw Error('reload unavailable');return {warnings:[],pending:[]}}}:undefined})
  const request=async action=>(await route.fetch(new Request('http://localhost/api/workbench-settings',{method:'POST',body:JSON.stringify({action})}))).json()
  assert.match((await request('migrate')).error.message,/任务正在运行/)
  running=false
  const result=await request('migrate');assert.equal(result.ok,true);assert.equal(result.value.application,live===true?'applied':'restart-required');assert.equal(exclusive,live?1:0);assert.equal(reloaded,live?1:0)
  assert.match(await readFile(join(profile,'cordis.patch.yml'),'utf8'),/autoInject: false/)
  assert.equal((await request('migrate')).value.application,'unchanged')
  assert.equal((await request('arbitrary-command')).ok,false)
 }finally{await rm(profile,{recursive:true,force:true})}
})
