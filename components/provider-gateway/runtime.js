import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'

const listeners = new Map()
// Transport/auth are injected; this module never reads process.env or files.
export function createGateway({ config, credentials, fetchImpl = fetch, now = Date.now, logger = {info(){},warn(){}}, login, pool, sleep = (ms,signal) => delay(ms,undefined,{signal}) }) {
  if (config.host !== undefined && config.host !== '127.0.0.1') throw Error('Gateway must listen on 127.0.0.1')
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw Error('Fixed gateway port required (1024..65535)')
  const backends = Object.entries(config.backends ?? {})
  if (!backends.length) throw Error('Configure at least one backend')
  const states = new Map()
  for (const [id,b] of backends) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Invalid backend id')
    const url = new URL(b.baseURL)
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error(`Invalid backend URL: ${id}`)
    if (url.protocol === 'http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Remote backends require HTTPS')
    if (!['none','static','sso'].includes(b.auth?.kind ?? 'none')) throw Error(`Invalid authentication: ${id}`)
    if (b.auth?.kind === 'sso' && !login) throw Error('SSO requires an explicit login adapter')
    const rpm=b.requestsPerMinute ?? config.limits?.requestsPerMinute ?? 40
    if (!Number.isFinite(rpm) || rpm <= 0) throw Error('requestsPerMinute must be positive')
    states.set(id,{token:null,expires:0,logging:null,models:null,modelsAt:0,next:0,rateQueue:Promise.resolve(),rpm})
  }
  let server, closed=false
  const lifetime = new AbortController()
  const getHeaders = async (id, signal, staleToken) => {
    const b=config.backends[id], s=states.get(id)
    const headers=new Headers({'content-type':'application/json','accept':'application/json'})
    const extra=await credentials.headers?.(id) ?? {headers:b.headers ?? [],overrideAuth:b.overrideAuth===true}
    for (const row of extra.headers) {
      const value=row.ref ? await credentials.get(row.ref) : row.value
      if(value!==undefined && value!=='') headers.set(row.name,value)
    }
    if (extra.overrideAuth) return headers
    if (b.auth?.kind === 'sso') {
      // A concurrent 401 for the old generation must reuse the refreshed token.
      if(staleToken && s.token===staleToken)s.expires=0
      if(!s.token || now()>=s.expires){
        if(!s.logging) {
          s.logging=Promise.resolve().then(()=>login({backend:id,auth:b.auth,credentials,signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(30000)])})).then(result=>{
            if(!result || typeof result.token!=='string' || !result.token)throw Error(`Update credentials for ${id}`)
            s.token=result.token;s.expires=now()+(result.ttlMs ?? b.auth.tokenTTLMs ?? 600000)
            return result.token
          }).finally(()=>{s.logging=null})
        }
        await s.logging
      }
      signal?.throwIfAborted()
      headers.set(b.auth.header ?? 'authorization',`${b.auth.prefix ?? 'Bearer '}${s.token}`)
    }
    if(b.auth?.kind === 'static')for(const [name,template] of Object.entries(b.auth.headersFromRefs ?? {})){
      let value
      const refs=[...template.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)]
      if(refs.length){value=template;for(const match of refs){const v=await credentials.get(match[1]);if(!v)throw Error(`Missing credential reference: ${match[1]}`);value=value.replace(match[0],v)}}
      else {value=await credentials.get(template);if(!value)throw Error(`Missing credential reference: ${template}`)}
      headers.set(name,value)
    }
    return headers
  }
  const request = async (id,path,{body,signal}={}) => {
    const b=config.backends[id],s=states.get(id)
    const combined=AbortSignal.any([lifetime.signal,...(signal?[signal]:[]),AbortSignal.timeout(config.timeoutMs ?? 120000)])
    const send=async headers=>{
      const turn=s.rateQueue.then(async()=>{const ms=Math.max(0,s.next-now());if(ms)await sleep(ms,combined);combined.throwIfAborted();s.next=now()+60000/s.rpm})
      s.rateQueue=turn.catch(()=>{});await turn
      const response=await fetchImpl(`${b.baseURL.replace(/\/$/,'')}/${path}`,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:combined,redirect:'error'})
      if(response.status===429){const raw=response.headers.get('retry-after');const seconds=Number(raw);const wait=raw?(Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-now()):0;if(Number.isFinite(wait))s.next=Math.max(s.next,now()+Math.max(0,wait));}
      return response
    }
    // A pool is opt-in and supplied by the intranet adapter. No token export API.
    if(pool && path==='chat/completions'){
      const borrowed=await pool.borrow(id,body.model,combined)
      if(borrowed){const r=await send(new Headers(borrowed.headers));if(r.status!==401)return r;await r.body?.cancel();logger.info({event:'pool-fallback',backend:id})}
    }
    let headers=await getHeaders(id,combined), old=states.get(id).token
    let response=await send(headers)
    if(response.status===401 && b.auth?.kind==='sso' && !(await credentials.headers?.(id))?.overrideAuth && !b.overrideAuth){
      await response.body?.cancel();logger.info({event:'relogin',backend:id});headers=await getHeaders(id,combined,old);response=await send(headers)
    }
    return response
  }
  const discover = async id => {
    const s=states.get(id),b=config.backends[id]
    if(s.models && now()-s.modelsAt<(config.discovery?.ttlMs ?? 300000))return s.models
    const fallback=()=> (b.fallbackModels ?? config.discovery?.fallbackModels ?? []).map(m=>typeof m==='string'?{id:m,object:'model'}:m)
    const models=await request(id,'models').then(async r=>{
      if(!r.ok)throw Error('discovery failed')
      const data=(await r.json()).data
      if(!Array.isArray(data)||data.some(m=>!m||typeof m.id!=='string'))throw Error('invalid model list')
      return data.map(({id,context_window})=>({id,object:'model',...(Number.isFinite(context_window)?{context_window}: {})}))
    }).catch(()=>{logger.warn({event:'discovery-fallback',backend:id});return fallback()})
    s.models=models;s.modelsAt=now();return models
  }
  const models=async()=> (await Promise.all(backends.map(async([id])=>(await discover(id)).map(m=>({...m,backend:id}))))).flat()
  const handle=async(requestObject,clientSignal)=>{
    const url=new URL(requestObject.url),path=url.pathname
    if(config.gatewayTokenRef){const key=await credentials.get(config.gatewayTokenRef);if(!key || requestObject.headers.get('x-gateway-token')!==key && requestObject.headers.get('authorization')!==`Bearer ${key}`)return Response.json({error:'Local gateway token required'},{status:401})}
    if(path==='/pool' && requestObject.method==='GET')return Response.json({data:(await pool?.list()??[]).map(({account,team,key_source,left_s,models,state})=>({account,team,key_source,left_s,models,state,warning:key_source==='push'?undefined:'Tenant key not provided by publisher'}))})
    const match=/^\/(?:(?<backend>[a-zA-Z0-9_-]+)\/)?v1\/(?<action>models|chat\/completions)$/.exec(path)
    if(!match)return Response.json({error:'Unknown gateway route'},{status:404})
    const {backend,action}=match.groups
    if(backend&&!states.has(backend))return Response.json({error:'Unknown backend'},{status:404})
    if(action==='models' && requestObject.method==='GET')return Response.json({object:'list',data:backend?await discover(backend):await models()})
    if(action!=='chat/completions'||requestObject.method!=='POST')return Response.json({error:'Method not allowed'},{status:405})
    const body=await requestObject.json()
    if(typeof body.model!=='string'||!Array.isArray(body.messages))return Response.json({error:'model and messages required'},{status:400})
    let id=backend
    if(!id){const candidates=(await models()).filter(m=>m.id===body.model);const ids=[...new Set(candidates.map(m=>m.backend))];if(ids.length!==1)return Response.json({error:'Choose a backend route for unknown or ambiguous model',models:(await models()).map(m=>m.id)},{status:400});id=ids[0]}
    const response=await request(id,'chat/completions',{body,signal:clientSignal??requestObject.signal})
    const headers=new Headers();for(const key of ['content-type','retry-after'])if(response.headers.has(key))headers.set(key,response.headers.get(key))
    if(response.status===401)headers.set('x-workbench-credential-hint',`${id}: update configured credential references in settings`)
    return new Response(response.body,{status:response.status,headers})
  }
  return {handle,models,request,async probe(id,model,signal){const r=await request(id,'chat/completions',{body:{model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:8,stream:false},signal});await r.body?.cancel();return {backend:id,model,ok:r.ok,status:r.status,contextWindow:'unknown',modalities:'not inferred from a text probe'}},
    async start(){
      if(closed)throw Error('Gateway is closed')
      if(server)return
      if(listeners.has(config.port))throw Error(`Gateway port ${config.port} already owned by another instance`)
      server=createServer((req,res)=>{
        const abort=new AbortController();res.once('close',()=>{if(!res.writableEnded)abort.abort()});req.once('aborted',()=>abort.abort())
        const serve=async()=>{
          if(req.socket.remoteAddress!=='127.0.0.1'){res.writeHead(403);return res.end()}
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024){res.writeHead(413);return res.end()}chunks.push(chunk)}
          const response=await handle(new Request(`http://127.0.0.1:${config.port}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),abort.signal)
          res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res,{signal:abort.signal});else res.end()
        }
        void serve().catch(()=>{if(abort.signal.aborted)logger.info({event:'cancelled'});if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:'Gateway request failed; inspect backend settings'}))})
      })
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve)}).catch(error=>{server=undefined;throw Error(`Gateway port ${config.port}: ${error.code??'listen failed'}`)})
      listeners.set(config.port,server)
    },
    async close(){closed=true;lifetime.abort();for(const s of states.values()){s.token=null;s.expires=0}if(server){const owned=server;if(listeners.get(config.port)===owned)listeners.delete(config.port);await new Promise(resolve=>{owned.close(resolve);owned.closeAllConnections()});server=undefined}},
  }
}
