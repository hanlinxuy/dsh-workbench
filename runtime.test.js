import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createGateway } from './runtime.js'
const config={port:18793,backends:{a:{baseURL:'https://backend.invalid/v1',auth:{kind:'none'},requestsPerMinute:100000000,fallbackModels:['fallback']}}}
const json=(data,status=200)=>Response.json(data,{status})
const request=(path,body)=>new Request('http://127.0.0.1'+path,body?{method:'POST',body:JSON.stringify(body)}:{})
const chat={model:'m',messages:[{role:'user',content:'hi'}]}
function fixture(extra={}){return createGateway({config,credentials:{get:async()=>undefined},sleep:async()=>{},...extra})}

test('model discovery caches upstream and fallback including null list',async()=>{
 let calls=0,time=0;const g=fixture({now:()=>time,fetchImpl:async()=>{calls++;return json({data:[{id:'m'}]})}})
 assert.equal((await (await g.handle(request('/v1/models'))).json()).data[0].id,'m');await g.models();assert.equal(calls,1);time=300001;await g.models();assert.equal(calls,2);await g.close()
 for(const fetchImpl of [async()=>json({},401),async()=>json({data:null}),async()=>{throw Error('timeout')}]){const g=fixture({fetchImpl});const r=await g.handle(request('/v1/models'));assert.equal(r.status,200);assert.equal((await r.json()).data[0].id,'fallback');await g.close()}
})
test('local auth rejects before upstream and unknown models fail without forwarding chat',async()=>{
 let calls=0;const g=fixture({config:{...config,gatewayTokenRef:'LOCAL'},credentials:{get:async()=> 'secret'},fetchImpl:async()=>{calls++;return json({data:[]})}})
 assert.equal((await g.handle(request('/v1/models'))).status,401);assert.equal(calls,0);await g.close()
 const other=fixture({fetchImpl:async()=>json({data:[]})});assert.equal((await other.handle(request('/v1/chat/completions',chat))).status,400);await other.close()
})
test('explicit backend passes a new model name unchanged',async()=>{
 let payload;const g=fixture({fetchImpl:async(u,o)=>{payload=JSON.parse(o.body);return json({ok:true})}});assert.equal((await g.handle(request('/a/v1/chat/completions',{...chat,model:'new-name'}))).status,200);assert.equal(payload.model,'new-name');await g.close()
})
test('five concurrent expired requests share login and a 401 generation refresh',async()=>{
 let logins=0,calls=0;const g=fixture({config:{...config,backends:{a:{...config.backends.a,auth:{kind:'sso'}}}},login:async()=>({token:`token-${++logins}`}),fetchImpl:async(u,o)=>{calls++;return o.headers.get('authorization')==='Bearer token-1'?json({},401):json({ok:true})}})
 const results=await Promise.all(Array.from({length:5},()=>g.handle(request('/a/v1/chat/completions',chat))))
 assert.ok(results.every(r=>r.ok));assert.equal(logins,2);assert.equal(calls,10);await g.close()
})
test('consecutive 401 retries exactly once and only credential reference hint is exposed',async()=>{
 let calls=0;const g=fixture({config:{...config,backends:{a:{...config.backends.a,auth:{kind:'sso'}}}},login:async()=>({token:'secret'}),fetchImpl:async()=>{calls++;return json({error:'unauthorized'},401)}})
 const r=await g.handle(request('/a/v1/chat/completions',chat));assert.equal(r.status,401);assert.equal(calls,2);assert.match(r.headers.get('x-workbench-credential-hint'),/settings/);await g.close()
})
test('header layers, missing references and explicit auth override',async()=>{
 let headers,logins=0;const auth={kind:'sso'};let overrideAuth=false
 const g=fixture({config:{...config,backends:{a:{...config.backends.a,auth}}},credentials:{get:async()=>undefined,headers:async()=>({overrideAuth,headers:[{name:'authorization',value:'custom'},{name:'x-missing',ref:'MISSING'},{name:'x-api-version',value:'2'}]})},login:async()=>{logins++;return {token:'auto'}},fetchImpl:async(u,o)=>{headers=o.headers;return json({})}})
 await g.handle(request('/a/v1/chat/completions',chat));assert.equal(headers.get('authorization'),'Bearer auto');assert.equal(headers.has('x-missing'),false)
 overrideAuth=true;await g.handle(request('/a/v1/chat/completions',chat));assert.equal(headers.get('authorization'),'custom');assert.equal(logins,1);await g.close()
})
test('static auth resolves template references on every request',async()=>{
 let secret='one',headers;const g=fixture({config:{...config,backends:{a:{...config.backends.a,auth:{kind:'static',headersFromRefs:{authorization:'Bearer {{KEY}}','x-tenant':'TENANT'}}}}},credentials:{get:async ref=>ref==='KEY'?secret:'team'},fetchImpl:async(u,o)=>{headers=o.headers;return json({})}})
 await g.handle(request('/a/v1/chat/completions',chat));assert.equal(headers.get('authorization'),'Bearer one');secret='two';await g.handle(request('/a/v1/chat/completions',chat));assert.equal(headers.get('authorization'),'Bearer two');assert.equal(headers.get('x-tenant'),'team');await g.close()
})
test('pool 401 falls back locally and pool listing never returns secrets',async()=>{
 let calls=0;const g=fixture({pool:{borrow:async()=>({headers:{authorization:'pool-secret'}}),list:async()=>[{account:'a',team:'t',key_source:'none',left_s:2,models:['m'],state:'ready',token:'pool-secret',key:'tenant-secret'}]},fetchImpl:async(u,o)=>{calls++;return json({},o.headers.get('authorization')?'401'*1:200)}})
 assert.equal((await g.handle(request('/a/v1/chat/completions',chat))).status,200);assert.equal(calls,2);const data=await (await g.handle(request('/pool'))).text();assert.doesNotMatch(data,/pool-secret|tenant-secret/);assert.match(data,/warning/);await g.close()
})
test('SSE streams before completion and cancellation reaches upstream',async()=>{
 let upstreamSignal,release;const g=fixture({fetchImpl:async(u,o)=>{upstreamSignal=o.signal;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: first\n\n'));release=()=>c.close()}}),{headers:{'content-type':'text/event-stream'}})}})
 const abort=new AbortController();const r=await g.handle(request('/a/v1/chat/completions',chat),abort.signal);assert.match(new TextDecoder().decode((await r.body.getReader().read()).value),/first/);abort.abort();assert.equal(upstreamSignal.aborted,true);release();await g.close()
})
test('fixed loopback binding, port ownership and release',async()=>{
 assert.throws(()=>fixture({config:{...config,host:'0.0.0.0'}}),/127/)
 const occupied=createServer();await new Promise(r=>occupied.listen(0,'127.0.0.1',r));const port=occupied.address().port
 const g=fixture({config:{...config,port}});await assert.rejects(g.start(),new RegExp(String(port)));await g.close();await new Promise(r=>occupied.close(r))
 const first=fixture({config:{...config,port}}),second=fixture({config:{...config,port}});await first.start();await assert.rejects(second.start(),/owned/);await first.close();await second.start();await second.close()
})
test('Retry-After delays next request without retrying a completion',async()=>{
 let time=0,calls=0,waits=[];const g=fixture({now:()=>time,sleep:async ms=>{waits.push(ms);time+=ms},fetchImpl:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'2'}})}})
 await g.handle(request('/a/v1/chat/completions',chat));assert.equal(calls,1);await g.handle(request('/a/v1/chat/completions',chat));assert.ok(waits.some(ms=>ms>=2000));assert.equal(calls,2);await g.close()
})

test('HTTP client disconnect aborts a live streaming upstream',async()=>{
 const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r))
 let upstreamSignal,done;const aborted=new Promise(resolve=>done=resolve)
 const g=fixture({config:{...config,port},fetchImpl:async(u,o)=>{upstreamSignal=o.signal;upstreamSignal.addEventListener('abort',done,{once:true});return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: streamed\n\n'))},cancel(){}}),{headers:{'content-type':'text/event-stream'}})}})
 await g.start()
 try{const r=await fetch(`http://127.0.0.1:${port}/a/v1/chat/completions`,{method:'POST',body:JSON.stringify(chat)});const reader=r.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/streamed/);await reader.cancel();await Promise.race([aborted,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('cancel not propagated')),2000);t.unref()})]);assert.equal(upstreamSignal.aborted,true)}finally{await g.close()}
})
