import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readResult } from './history.js'

test('returns only the completed turn for the exact request', () => {
  const events = [
    {type:'turn/start',data:{turn:1}}, {type:'user/message',data:{source:{rpcId:'a'}}},
    {type:'assistant/message',data:{message:{content:[{type:'text',text:'A'}]}}},
    {type:'turn/end',data:{reason:{kind:'completed'}}},
    {type:'turn/start',data:{turn:2}}, {type:'user/message',data:{source:{rpcId:'b'}}},
    {type:'assistant/message',data:{message:{content:[{type:'text',text:'B'}]}}},
  ]
  assert.equal(readResult(events, 'a').text, 'A')
  assert.equal(readResult(events, 'b'), undefined)
  assert.equal(readResult(events, 'missing'), undefined)
})

test('an empty completed turn is a failure, not a usable result', () => {
  const events = [{type:'turn/start',data:{turn:1}}, {type:'user/message',data:{source:{rpcId:'x'}}}, {type:'turn/end',data:{reason:{kind:'completed'}}}]
  assert.deepEqual(readResult(events,'x'), {status:'failed',text:'',reason:'empty_result'})
})

test('preserves completion event time for takeover-order reporting', () => {
  const events=[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{source:{rpcId:'x'}}},{type:'assistant/message',data:{message:{content:[{type:'text',text:'done'}]}}},{type:'turn/end',time:1700000000123,data:{reason:{kind:'completed'}}}]
  assert.equal(readResult(events,'x').finishedAt,1700000000123)
})

test('0.2.2 paged history retains a fixed cut and reconstructs a turn across pages', async () => {
  const { readSessionEvents } = await import('./history.js')
  const events = [
    {seq:0,type:'turn/start',data:{turn:1}},
    {seq:1,type:'user/message',data:{source:{rpcId:'task'}}},
    {seq:2,type:'assistant/message',data:{message:{content:[{type:'text',text:'complete report'}]}}},
    {seq:3,type:'turn/end',data:{reason:{kind:'completed'}}},
  ]
  const requests = []
  const signal = AbortSignal.timeout(1000)
  const controller = { async events(request, receivedSignal) {
    requests.push(request)
    assert.equal(receivedSignal, signal)
    if (requests.length === 1) return {cursor:3,hasMore:true,records:events.slice(2).map(event=>({type:'event',event}))}
    assert.equal(request.throughSeq,3)
    assert.equal(request.beforeSeq,2)
    return {cursor:3,hasMore:false,records:events.slice(0,2).map(event=>({type:'event',event}))}
  } }
  const history = await readSessionEvents(controller, 'session-test', signal)
  assert.deepEqual(history, events)
  assert.equal(readResult(history,'task').text,'complete report')
  assert.deepEqual(requests[0].address,{kind:'session',sessionId:'session-test'})
})

test('legacy history still works and broken page cursors fail rather than looping', async () => {
  const { readSessionEvents } = await import('./history.js')
  assert.deepEqual(await readSessionEvents({inspect:async()=>({events:[]})},'old'),[])
  await assert.rejects(readSessionEvents({events:async()=>({cursor:2,records:[],hasMore:true})},'broken'),/did not advance/)
})
