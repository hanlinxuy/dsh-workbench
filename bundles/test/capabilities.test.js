import test from 'node:test'
import assert from 'node:assert/strict'
import {createCapabilities} from '../settings/capabilities.js'
test('explicit provider blocks other participants and reports missing declarations',()=>{
 const registry=createCapabilities({owners:{browser:{providedBy:'native-browser'}}},()=>[])
 const release=registry.register({domain:'browser',plugin:'workbench-browser',tools:['browser']})
 assert.equal(registry.allows('browser','workbench-browser'),false)
 assert.throws(()=>registry.assert('browser','workbench-browser'),/native-browser/)
 assert.equal(registry.status().domains[0].missing,true)
 registry.register({domain:'browser',plugin:'native-browser',tools:['native']})
 assert.equal(registry.status().domains[0].missing,false)
 release();assert.equal(registry.status().domains[0].providers.length,1)
})
test('actual scope definitions include third party tools and budget gate sees changes',()=>{
 let tools=[{name:'foreign',description:'12345'}]
 const registry=createCapabilities({budget:6,mode:'block'},scope=>scope==='chief'?[]:tools)
 registry.register({domain:'browser',plugin:'one'});registry.register({domain:'browser',plugin:'two'})
 assert.equal(registry.status().domains[0].conflict,true)
 assert.deepEqual(registry.status().undeclared,['foreign'])
 tools.push({name:'more',description:'123'})
 assert.throws(()=>registry.check(),/8\/6/)
 assert.equal(registry.check('chief').total,0)
})
