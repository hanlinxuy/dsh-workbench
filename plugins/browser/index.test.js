import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
const hooks=registerHooks({resolve(id,ctx,next){if(id==='@deepseek-ai/dsh-tools')return {url:'data:text/javascript,export const defineTool=x=>x',shortCircuit:true};return next(id,ctx)}})
const {apply}=await import('./index.js');hooks.deregister()
test('optional knowledge registers no capability until explicitly enabled',()=>{
 for(const enabled of [undefined,false,true]){
  const tools=[];apply({tools:{register:t=>tools.push(t)},effect(){}},{knowledge:{enabled,index:'/nonexistent/private-index.json'}})
  assert.equal(tools.some(t=>t.name==='workbench_knowledge'),enabled===true)
  assert.ok(tools.every(t=>t.description.length<=1300))
 }
})
test('read/navigation tool rejects interaction and disabling actions removes that capability',async()=>{
 const tools=[];apply({tools:{register:t=>tools.push(t)},effect(){}},{actionsEnabled:false})
 assert.equal(tools.some(t=>t.name==='workbench_browser_act'),false)
 await assert.rejects(tools.find(t=>t.name==='workbench_browser').execute({action:'click',target:'@e1'},{}),/not part/)
 const enabled=[];apply({tools:{register:t=>enabled.push(t)},effect(){}},{})
 assert.ok(enabled.some(t=>t.name==='workbench_browser_act'))
})
