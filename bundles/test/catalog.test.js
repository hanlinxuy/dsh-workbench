import test from 'node:test'
import assert from 'node:assert/strict'
import {createCredentialCatalog} from '../settings/catalog.js'
const services=[{id:'primary',title:'Primary identity',domain:'identity',fields:[{key:'password',ref:'IDENTITY_PASSWORD',secret:true}]},{id:'patent',title:'Patent',domain:'patent',preset:'patent',fields:[{key:'password',ref:'PATENT_PASSWORD',secret:true}]}]
test('one catalog controls status, storage and domain isolation without exposing values',async()=>{
 const values=new Map();const provider={resolve:async ref=>values.has(ref)?{value:values.get(ref),source:'file'}:undefined,describe:async ref=>({configured:values.has(ref),writable:true,source:'file'}),set:async(ref,value)=>values.set(ref,value),unset:async ref=>values.delete(ref)}
 const catalog=createCredentialCatalog(services,provider)
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
 assert.equal((await createCredentialCatalog(services,provider,['patent']).status()).length,2)
 assert.throws(()=>createCredentialCatalog([...services,{...services[1],id:'duplicate-ref'}],provider),/shared credential ref/)
})
