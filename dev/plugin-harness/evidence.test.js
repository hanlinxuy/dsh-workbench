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
test('Desktop 0.2.2 result events associate calls through message.toolCallId',()=>{
 const events=[{seq:21,type:'tool/call',data:{turn:1,step:1,name:'fixture',callId:'a'}},{seq:22,type:'tool/result',data:{turn:1,step:1,message:{role:'tool',toolCallId:'a',source:{kind:'tool',callId:'a'},isError:false,content:[{type:'text',text:'spill:accepted'}]}}},{seq:46,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}]
 assert.equal(assertModelEvidence(events,{tool:'fixture',contains:'spill:'}).matched,true)
 events[1].data.message.isError=true
 assert.throws(()=>assertModelEvidence(events,{tool:'fixture'}),/matching tool/)
})
