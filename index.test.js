import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:http'
import {apply} from './index.js'

test('host adapter exposes no tools, syncs only the selected provider, preserves credentials and closes port',async()=>{
 const home=await mkdtemp(join(tmpdir(),'gateway-host-'));const upstream=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'model-a'}]}))});await new Promise(r=>upstream.listen(0,'127.0.0.1',r))
 const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r))
 const path=join(home,'cordis.patch.yml');await writeFile(path,'unchanged backup fixture\n');await mkdir(join(home,'.workbench-private'));await writeFile(join(home,'.workbench-private/connections.json'),JSON.stringify({employeeId:'test',password:'hidden',gatewayHeaders:[]}))
 const entry={options:{id:'pi'}};let config={providers:{keep:{baseURL:'https://existing.invalid',models:[{id:'existing'}]},gateway:{baseURL:`http://127.0.0.1:${port}/a/v1`,displayName:'Local'}}};const keep=JSON.stringify(config.providers.keep);let adapter,dispose
 const ctx={credentials:{resolve:async()=>undefined},configEditor:{documentPath:path,configuration:()=>[{entry,inherited:{},override:structuredClone(config)}],edit:async(e,change)=>{assert.equal(e,entry);config=change(config,{})}},get:()=>undefined,effect:fn=>{dispose=fn()},provide:(key,value)=>{assert.equal(key,'workbenchIntranet');adapter=value}}
 try{await apply(ctx,{port,backends:{a:{baseURL:`http://127.0.0.1:${upstream.address().port}`,requestsPerMinute:100000000}},providerEntryId:'pi',providerRoute:'gateway',providerBackend:'a'});assert.equal((await adapter.test()).connected,true);assert.deepEqual(await adapter.models(),[{id:'model-a',name:'a · model-a'}]);assert.equal(JSON.stringify(config.providers.keep),keep);assert.deepEqual(config.providers.gateway.models,[{id:'model-a'}]);assert.equal(config.providers.gateway.displayName,'Local');assert.equal(await readFile(path,'utf8'),'unchanged backup fixture\n')}
 finally{await dispose?.();await new Promise(r=>upstream.close(r));await rm(home,{recursive:true,force:true})}
})
