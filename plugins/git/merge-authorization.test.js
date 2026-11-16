import test from 'node:test'
import assert from 'node:assert/strict'
import {authorizeMerge} from './merge-authorization.js'
const actual={iid:7,sha:'a'.repeat(40),target_branch:'main'}
test('confirmation must quote an actual human message in this session, not model-generated approval',async()=>{
 const authorization={mode:'user-confirmed',sourceSeq:4,quote:'Merge MR 7 now'}
 let kind='user';const controller={events:async request=>{assert.equal(request.address.sessionId,'session-a');return {records:[{event:{seq:4,type:'user/message',data:{source:{kind},content:[{type:'text',text:'Merge MR 7 now'}]}}}]}}}
 const options={actual,sessionId:'session-a',controller,authorization}
 const evidence=await authorizeMerge(options);assert.equal(evidence.sourceSeq,4);assert.equal(evidence.quote,undefined)
 kind='tool';await assert.rejects(authorizeMerge(options),/not found/)
 await assert.rejects(authorizeMerge({...options,authorization:{mode:'user-confirmed'}}),/quote/)
 await assert.rejects(authorizeMerge({...options,authorization:{mode:'auto-reviewed'}}),/operator-selected/)
})
test('automatic merge requires trusted reviewer evidence bound to exact head and target',async()=>{
 const options={mode:'auto-reviewed',actual,authorization:{mode:'auto-reviewed',reviewId:'review-1'}}
 await assert.rejects(authorizeMerge(options),/adapter/)
 for(const mismatch of [{approved:false},{sha:'b'.repeat(40)},{targetBranch:'other'},{checksPassed:false}])await assert.rejects(authorizeMerge({...options,reviewer:{verify:async()=>({approved:true,sha:actual.sha,targetBranch:'main',checksPassed:true,reviewer:'reviewer-session',...mismatch})}}),/does not approve/)
 assert.equal((await authorizeMerge({...options,reviewer:{verify:async()=>({approved:true,sha:actual.sha,targetBranch:'main',checksPassed:true,reviewer:'reviewer-session'})}})).reviewer,'reviewer-session')
})
