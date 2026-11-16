import test from 'node:test'
import assert from 'node:assert/strict'
import {createMemoryPool} from './pool.js'
const entry={account:'alice',team:'team-a',backend:'a',models:['m'],token:'short-token-private',ttlSeconds:10}
test('lending is opt-in, dual credentials explicit, metadata only, expiry and restart clear all',()=>{
 let time=0;const pool=createMemoryPool({now:()=>time})
 assert.throws(()=>pool.publish(entry),/disabled/);pool.setLending(true)
 assert.equal(pool.publish(entry).key_source,'none');assert.equal(pool.borrow('a','m').error,'missing-tenant-key')
 const published=pool.publish({...entry,tenantKey:'tenant-key-private'});assert.equal(published.key_source,'push')
 assert.deepEqual(pool.borrow('a','m').headers,{'x-auth-token':'short-token-private',authorization:'Bearer tenant-key-private'})
 assert.doesNotMatch(JSON.stringify(pool.list()),/short-token-private|tenant-key-private|headers/)
 time=10001;assert.deepEqual(pool.list(),[]);assert.equal(pool.borrow('a','m'),undefined)
 pool.publish(entry);pool.setLending(false);assert.deepEqual(pool.list(),[])
 pool.setLending(true);pool.publish(entry);pool.close();assert.deepEqual(pool.list(),[])
 assert.deepEqual(createMemoryPool().list(),[])
})
test('team fallback is visible and cannot be mistaken for publisher-provided key',()=>{
 const pool=createMemoryPool({teamKey:'node-team-secret'});pool.setLending(true)
 assert.match(pool.publish(entry).warning,/charged/)
 const result=pool.borrow('a','m');assert.equal(result.key_source,'team');assert.match(result.warning,/charged/)
 assert.doesNotMatch(JSON.stringify(pool.list()),/node-team-secret|short-token-private/)
})
