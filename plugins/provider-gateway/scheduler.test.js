import test from 'node:test'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {createScheduler} from './scheduler.js'

test('interactive jumps a background backlog while both sources make progress',async()=>{
 const queue=createScheduler({requestsPerMinute:3000,queueTimeoutMs:2000}),order=[]
 const jobs=Array.from({length:6},(_,i)=>queue.acquire('background').then(()=>order.push(`b${i}`)))
 jobs.push(queue.acquire('interactive').then(()=>order.push('interactive')))
 await Promise.all(jobs)
 assert.ok(order.indexOf('interactive')<=1,order.join(','))
 const m=queue.metrics();assert.equal(m.sources.background.admitted,6);assert.equal(m.sources.interactive.admitted,1)
 assert.ok(m.sources.interactive.averageWaitMs<m.sources.background.averageWaitMs)
 queue.close()
})
test('429 backoff gates the entire queue; queued cancellation consumes no admission',async()=>{
 const queue=createScheduler({requestsPerMinute:6000,queueTimeoutMs:1000})
 await queue.acquire();queue.backoff(100)
 const abort=new AbortController(),cancelled=queue.acquire('background',abort.signal)
 const rejected=assert.rejects(cancelled);abort.abort();await rejected
 let admitted=false;const next=queue.acquire().then(()=>admitted=true)
 await delay(30);assert.equal(admitted,false);assert.equal(queue.metrics().sources.background.admitted,0)
 await next;assert.equal(queue.metrics().sources.background.cancelled,1);queue.close()
})
test('queue deadline is explicit and shutdown rejects pending callers',async()=>{
 const queue=createScheduler({requestsPerMinute:1,queueTimeoutMs:25})
 await queue.acquire();await assert.rejects(queue.acquire('background'),/queue_timeout/)
 assert.equal(queue.metrics().sources.background.timeouts,1)
 const pending=queue.acquire();queue.close();await assert.rejects(pending,/closed/)
})
