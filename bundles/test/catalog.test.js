import test from 'node:test'
import assert from 'node:assert/strict'
import {createCredentialCatalog} from '../settings/catalog.js'
const services=[{id:'primary',title:'Primary identity',domain:'identity',fields:[{key:'password',ref:'IDENTITY_PASSWORD',secret:true}]},{id:'patent',title:'Patent',domain:'patent',preset:'patent',fields:[{key:'password',ref:'PATENT_PASSWORD',secret:true}]}]
test('one catalog controls status, storage and domain isolation without exposing values',async()=>{
 const values=new Map();const provider={resolve:async ref=>values.has(ref)?{value:values.get(ref),source:'file'}:undefined,describe:async ref=>({configured:values.has(ref),writable:true,source:'file'}),set:async(ref,value)=>values.set(ref,value),unset:async ref=>values.delete(ref)}
 const catalog=createCredentialCatalog(services,provider,['intranet-core'])
 assert.equal((await catalog.status()).length,1)
 await catalog.set('IDENTITY_PASSWORD','identity-secret');await catalog.set('PATENT_PASSWORD','patent-secret')
 assert.doesNotMatch(JSON.stringify(await catalog.status()),/identity-secret|patent-secret/)
 assert.equal((await catalog.resolve('PATENT_PASSWORD')).value,'patent-secret')
 await catalog.set('IDENTITY_PASSWORD','changed')
 assert.equal((await catalog.resolve('PATENT_PASSWORD')).value,'patent-secret')
 await assert.rejects(catalog.set('ARBITRARY_SECRET','bad'),/unauthorized/)
 await catalog.unset('IDENTITY_PASSWORD');await assert.rejects(catalog.resolve('IDENTITY_PASSWORD'),/missing/)
 values.set('IDENTITY_PASSWORD','');await assert.rejects(catalog.resolve('IDENTITY_PASSWORD'),/empty/)
 values.set('IDENTITY_PASSWORD','<replace-me>');await assert.rejects(catalog.resolve('IDENTITY_PASSWORD'),/placeholder/)
 assert.equal((await createCredentialCatalog(services,provider,['intranet-core','patent']).status()).length,2)
 assert.throws(()=>createCredentialCatalog([...services,{...services[1],id:'duplicate-ref'}],provider),/shared credential ref/)
})

test('identity proxy is derived on demand, supports password override and noProxy without credential reads',async()=>{
 const values=new Map([['ACCOUNT','user@example'],['PASSWORD','password#1']]);let reads=0
 const provider={resolve:async ref=>{reads++;return values.has(ref)?{value:values.get(ref),source:'file'}:undefined},describe:async ref=>({configured:values.has(ref),writable:true}),set:async(ref,value)=>values.set(ref,value)}
 const service={id:'identity',title:'Identity',domain:'identity',preset:'intranet-core',fields:[{key:'employeeId',ref:'ACCOUNT',secret:false},{key:'password',ref:'PASSWORD',secret:true},{key:'proxyPassword',ref:'PROXY_PASSWORD',secret:true}],proxy:{url:'http://proxy.invalid:8080',noProxy:['.internal','localhost']}}
 const catalog=createCredentialCatalog([service],provider,['intranet-core'])
 assert.deepEqual(await catalog.deriveProxy('identity','https://service.internal/api'),{direct:true});assert.equal(reads,0)
 assert.deepEqual(await catalog.resolveService('identity'),{employeeId:'user@example',password:'password#1'})
 let derived=await catalog.deriveProxy('identity','https://public.invalid')
 assert.equal(decodeURIComponent(new URL(derived.url).password),'password#1')
 values.set('PROXY_PASSWORD','override-only');derived=await catalog.deriveProxy('identity','https://public.invalid')
 assert.equal(decodeURIComponent(new URL(derived.url).password),'override-only')
 const status=await catalog.status();assert.match(status[0].proxyDescription,/user@example@proxy.invalid:8080/)
 assert.doesNotMatch(JSON.stringify(status),/password#1|override-only/)
 assert.equal(values.size,3,'derived URL is never stored')
 await assert.rejects(createCredentialCatalog([service],provider).deriveProxy('identity','https://public.invalid'),/not enabled/)
 await assert.rejects(catalog.resolveService('identity-missing'),/Unknown/)
})

test('domain defaults select independent capability sets and name each missing field',async()=>{
 const values=new Map(),provider={resolve:async ref=>values.has(ref)?{value:values.get(ref)}:undefined,describe:async ref=>({configured:values.has(ref)})}
 const fields=['GRANT_TYPE','CLIENT_ID','CLIENT_SECRET','USERNAME','PASSWORD'].map(key=>({key,ref:`PATENT_${key}`,secret:true}))
 const rows=[...services.slice(0,1),{id:'patent',title:'Patent',domain:'patent',fields},{id:'storage',title:'Storage',domain:'storage',fields:[]}]
 assert.deepEqual((await createCredentialCatalog(rows,provider,['intranet-core']).status()).map(s=>s.domain),['identity'])
 const patent=createCredentialCatalog(rows,provider,['patent'])
 assert.equal((await patent.status())[0].fields.length,5)
 for(const field of fields){await assert.rejects(patent.resolveService('patent'),new RegExp(field.ref));values.set(field.ref,'configured-value')}
 assert.equal(Object.keys(await patent.resolveService('patent')).length,5)
 await assert.rejects(patent.resolveService('primary'),/not enabled/)
})
