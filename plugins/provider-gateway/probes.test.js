import test from 'node:test'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {createProbes} from './probes.js'
const backends={a:{baseURL:'https://example.invalid',fallbackModels:['m']}}
test('reachability distinguishes declared discovery from actual inference and caches bounded calls',async()=>{
 let calls=0
 const probes=createProbes({backends,request:async(_id,path)=>{calls++;return path==='models'?new Response('{}',{status:404}):Response.json({choices:[{message:{content:'OK'}}]})}})
 const result=await probes.run({backend:'a',model:'m'});assert.equal(result.state,'live');assert.equal(result.source,'declared');assert.equal(calls,2)
 assert.equal((await probes.run({backend:'a',model:'m'})).cached,true);assert.equal(calls,2)
 probes.close()
})
test('capability requires preview, preserves unknown modalities and identifies measured truncation only with exact counts',async()=>{
 let calls=0
 const probes=createProbes({backends,buildPrompt:async(size,marker)=>({messages:[{role:'user',content:marker}],expectedPromptTokens:size,verificationText:marker}),request:async(_id,_path,{body})=>{calls++;return Response.json({choices:[{message:{content:body.messages[0].content}}],usage:{prompt_tokens:calls===1?128:100000}})}})
 await assert.rejects(probes.run({operation:'start',backend:'a',model:'m',confirm:true}),/preview/)
 assert.equal(calls,0)
 const preview=await probes.run({operation:'preview',backend:'a',model:'m',declaredTokens:128000});assert.equal(calls,0)
 const job=await probes.run({operation:'start',backend:'a',model:'m',confirm:true,previewId:preview.previewId,declaredModalities:['text','image']})
 let state
 for(let i=0;i<20;i++){state=await probes.run({operation:'status',jobId:job.jobId});if(state.state!=='running')break;await delay(1)}
 assert.equal(state.result.contextWindow.measured.acceptedMax,100000);assert.equal(state.result.contextWindow.measured.capped,true);assert.deepEqual(state.result.modalities.unverified,['image']);assert.equal(calls,2)
 probes.close()
})
test('capability cancellation retains completed steps and stops further requests',async()=>{
 let calls=0
 const probes=createProbes({backends,request:async(_id,_path,{body,signal})=>{calls++;if(calls===2)await delay(10000,undefined,{signal});return Response.json({choices:[{message:{content:body.messages[0].content.slice(28,64)}}]})}})
 const preview=await probes.run({operation:'preview',backend:'a',model:'m',declaredTokens:2048}),job=await probes.run({operation:'start',backend:'a',model:'m',confirm:true,previewId:preview.previewId})
 for(let i=0;i<20&&calls<2;i++)await delay(1)
 const cancelled=await probes.run({operation:'cancel',jobId:job.jobId});assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.result.partial,true);assert.equal(cancelled.result.steps.length,1)
 await delay(1);assert.equal(calls,2);probes.close()
})

test('empty inference verifies no modality; a smaller success cannot erase an observed input rejection',async()=>{
 const empty=createProbes({backends,request:async(_id,path)=>path==='models'?Response.json({data:[{id:'m'}]}):Response.json({choices:[{message:{content:''}}]})})
 assert.deepEqual((await empty.run({backend:'a',model:'m'})).modalities.verified,[]);empty.close()
 let calls=0
 const probes=createProbes({backends,buildPrompt:async(size,marker)=>({messages:[{role:'user',content:marker}],expectedPromptTokens:size,verificationText:marker}),request:async(_id,_path,{body})=>{calls++;return calls===2?new Response('too large',{status:413}):Response.json({choices:[{message:{content:body.messages[0].content}}],usage:{prompt_tokens:calls===1?128:1536}})}})
 const preview=await probes.run({operation:'preview',backend:'a',model:'m',declaredTokens:2048}),job=await probes.run({operation:'start',backend:'a',model:'m',confirm:true,previewId:preview.previewId})
 let state
 for(let i=0;i<20;i++){state=await probes.run({operation:'status',jobId:job.jobId});if(state.state!=='running')break;await delay(1)}
 assert.equal(state.result.contextWindow.measured.capped,true);assert.equal(state.result.contextWindow.measured.acceptedMax,1536);assert.equal(state.result.requests,3);probes.close()
})
