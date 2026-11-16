export function assertModelEvidence(events,{tool,contains=''}){
 const calls=events.filter(e=>e.type==='tool/call'&&e.data.name===tool)
 if(!calls.length)throw Error(`L1 evidence missing: no model tool/call for ${tool}`)
 const matched=calls.find(call=>events.some(e=>e.type==='tool/result'&&(e.data.message?.toolCallId??e.data.message?.source?.callId??e.data.callId)===call.data.callId&&!e.data.message?.isError&&JSON.stringify(e.data.message?.content??e.data.content??'').includes(contains)))
 if(!matched)throw Error(`L1 evidence missing: no successful matching tool/result for ${tool} containing the required value`)
 if(!events.some(e=>e.type==='turn/end'&&(e.data.reason?.kind??e.data.reason)==='completed'&&(e.seq??0)>(matched.seq??-1)))throw Error('L1 evidence missing: no completed turn after the tool call')
 return {tool,callId:matched.data.callId,toolCalls:calls.length,matched:true}
}
