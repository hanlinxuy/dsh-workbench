import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const hooks=registerHooks({resolve(specifier,ctx,next){if(specifier==='@deepseek-ai/dsh-tools')return {url:'data:text/javascript,export const defineTool=x=>x',shortCircuit:true};if(specifier==='@deepseek-ai/dsh-atomic-write')return {url:'data:text/javascript,export const withFileLock=async(p,fn)=>fn()',shortCircuit:true};return next(specifier,ctx)}})
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
  await apply({tools:{definitions:()=>[]},systemPrompt:{section(){}},provide(){},configEditor:{documentPath:join(profile,'cordis.patch.yml')},effect(fn){fn()},connection:{fetch:{register(r){route=r}}},sessionController:{list:async()=>({items:[{running}]})},get:()=>live?{runExclusive:async fn=>{exclusive++;return fn()},reconcileProfile:async()=>{reloaded++;if(live==='failed')throw Error('reload unavailable');return {warnings:[],pending:[]}}}:undefined})
  const request=async action=>(await route.fetch(new Request('http://localhost/api/workbench-settings',{method:'POST',body:JSON.stringify({action})}))).json()
  assert.match((await request('migrate')).error.message,/任务正在运行/)
  running=false
  const result=await request('migrate');assert.equal(result.ok,true);assert.equal(result.value.application,live===true?'applied':'restart-required');assert.equal(exclusive,live?1:0);assert.equal(reloaded,live?1:0)
  assert.match(await readFile(join(profile,'cordis.patch.yml'),'utf8'),/autoInject: false/)
  assert.equal((await request('migrate')).value.application,'unchanged')
  assert.equal((await request('arbitrary-command')).ok,false)
 }finally{await rm(profile,{recursive:true,force:true})}
})

test('Windows retry uses native pnpm, failure remains visible and a missing package never becomes ready',async()=>{
 const platform=Object.getOwnPropertyDescriptor(process,'platform'),arch=Object.getOwnPropertyDescriptor(process,'arch')
 const profile=await mkdtemp(join(tmpdir(),'wb-pwsh-retry-'))
 let route,calls=0,result={exitCode:1},writes=0
 try{
  await writeFile(join(profile,'package.json'),JSON.stringify({dependencies:{},dsh:{profile:{bundles:['dsh-workbench-core']}}}))
  await writeFile(join(profile,'cordis.patch.yml'),'[]\n')
  Object.defineProperty(process,'platform',{value:'win32'});Object.defineProperty(process,'arch',{value:'x64'})
  const manager={runPnpm:async args=>{calls++;assert.deepEqual(args,['add','--save-optional','--save-exact','@dsh-ops/pwsh-win32-x64@0.2.1']);return result}}
  const shell={config:{pwshPath:{get:()=>undefined}},pwshPath:'missing-pwsh'}
  await apply({provide(){},inject(){},tools:{definitions:()=>[]},systemPrompt:{section(){}},credentials:{},
   configEditor:{documentPath:join(profile,'cordis.patch.yml'),configuration:()=>[{entry:{options:{id:'shell'}},override:{},inherited:{}}],edit:async()=>{writes++}},
   effect(fn){fn()},connection:{fetch:{register(r){route=r}}},sessionController:{list:async()=>({items:[]})},
   subprocess:{spawn:()=>({done:Promise.resolve({exitCode:1}),collected:{stdout:{readFrom:()=>({text:''})},stderr:{readFrom:()=>({text:''})}}})},
   get:name=>({pluginManager:manager,shell}[name]),
  })
  const request=async action=>(await route.fetch(new Request('http://localhost/api/workbench-settings',{method:'POST',body:JSON.stringify({action})}))).json()
  assert.equal((await request('install-pwsh')).value.status,'running')
  await new Promise(resolve=>setTimeout(resolve,10))
  const failed=await request('status');assert.equal(failed.value.installation.status,'failed');assert.match(failed.value.installation.message,/下载失败/)
  result={exitCode:0};await request('install-pwsh');await new Promise(resolve=>setTimeout(resolve,10))
  assert.ok(['missing','invalid'].includes((await request('status')).value.installation.status))
  assert.equal(calls,2);assert.equal(writes,0)
 }finally{Object.defineProperty(process,'platform',platform);Object.defineProperty(process,'arch',arch);await rm(profile,{recursive:true,force:true})}
})
