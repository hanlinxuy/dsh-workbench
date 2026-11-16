import test from 'node:test'
import assert from 'node:assert/strict'
import {assertModelEvidence} from './scripts/evidence.mjs'
test('L1 requires matching actual tool events and a completed turn, never an assistant claim',()=>{
 const events=[{seq:1,type:'tool/call',data:{name:'fixture',callId:'a'}},{seq:2,type:'tool/result',data:{callId:'a',message:{content:[{type:'text',text:'business-value'}]}}},{seq:3,type:'turn/end',data:{reason:{kind:'completed'}}}]
 assert.equal(assertModelEvidence(events,{tool:'fixture',contains:'business-value'}).matched,true)
 assert.throws(()=>assertModelEvidence([{type:'assistant/message',data:{text:'I called fixture successfully'}}],{tool:'fixture'}),/evidence missing/)
 assert.throws(()=>assertModelEvidence(events.slice(0,2),{tool:'fixture'}),/completed turn/)
 assert.throws(()=>assertModelEvidence(events,{tool:'fixture',contains:'invented'}),/matching tool/)
})
