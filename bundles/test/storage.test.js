import test from 'node:test'
import assert from 'node:assert/strict'
import {createStorageRegistry,storageIndex} from '../settings/storage.js'

test('bucket secrets are indexed by endpoint plus bucket; removals never silently reuse secrets',async()=>{
 let state={},active=true;const values=new Map()
 const credentials={describe:async ref=>({configured:values.has(ref),writable:true}),resolve:async ref=>values.has(ref)?{value:values.get(ref),source:'file'}:undefined,set:async(ref,value)=>values.set(ref,value),unset:async ref=>values.delete(ref)}
 const registry=createStorageRegistry({credentials,read:()=>state,update:async change=>{state=change(state)},enabled:()=>active})
 const first=await registry.change('add',{label:'Data',endpoint:'endpoint-1',bucket:'my.data/中文'})
 const second=await registry.change('add',{label:'Other region',endpoint:'endpoint-2',bucket:'my.data/中文'})
 await registry.change('set-token',{id:first.id,value:'first-secret'})
 await registry.change('set-token',{id:second.id,value:'second-secret'})
 assert.equal((await registry.resolve('endpoint-1','my.data/中文')).value,'first-secret')
 assert.equal((await registry.resolve('endpoint-2','my.data/中文')).value,'second-secret')
 await registry.change('set-token',{id:first.id,value:'rotated-secret'})
 assert.equal((await registry.resolve('endpoint-2','my.data/中文')).value,'second-secret')
 await assert.rejects(registry.resolve('endpoint-1','unknown-bucket'),/unknown-bucket/)
 await assert.rejects(registry.resolve('endpoint-3','my.data/中文'),/endpoint-3/)
 assert.doesNotMatch(JSON.stringify(state)+JSON.stringify(await registry.status()),/first-secret|second-secret|rotated-secret/)
 await registry.change('remove',{id:first.id})
 assert.equal((await registry.status()).orphans.length,1)
 await assert.rejects(registry.resolve('endpoint-1','my.data/中文'),/No storage token/)
 await registry.change('cleanup',{id:first.id});assert.equal(values.size,1)
 const missing=await registry.change('add',{label:'Missing token label',endpoint:'endpoint-1',bucket:'missing'})
 await assert.rejects(registry.resolve('endpoint-1','missing'),/Missing token label/)
 const fallback=await registry.change('add',{label:'Explicit endpoint fallback',endpoint:'endpoint-1',bucket:'*'})
 await registry.change('set-token',{id:fallback.id,value:'fallback'})
 assert.equal((await registry.resolve('endpoint-1','another')).value,'fallback')
 await assert.rejects(registry.resolve('endpoint-1','missing'),/Missing token label/,'exact row with missing token must not use fallback')
 active=false;assert.deepEqual(await registry.status(),{enabled:false,buckets:[],orphans:[]})
 await assert.rejects(registry.resolve('endpoint-1','another'),/not enabled/)
 assert.ok(missing.id)
})
test('metadata rejects duplicate aliases, secrets in endpoint and arbitrary orphan refs',()=>{
 const row={id:'b1',label:'One',endpoint:'e',bucket:'a'}
 assert.throws(()=>storageIndex({buckets:[row,{...row,id:'b2'}]}),/Duplicate/)
 assert.throws(()=>storageIndex({buckets:[{...row,endpoint:'https://user:password@example.invalid'}]}),/credentials/)
 assert.throws(()=>storageIndex({orphans:['OTHER_SECRET']}),/orphan/)
})
