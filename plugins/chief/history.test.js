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
