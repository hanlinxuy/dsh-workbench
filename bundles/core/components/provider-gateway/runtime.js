import { createScheduler } from './scheduler.js'
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
  const states = new Map(), schedulers=new Map(), accountRates=new Map()
  for (const [id,b] of backends) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Invalid backend id')
    const url = new URL(b.baseURL)
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error(`Invalid backend URL: ${id}`)
    if (url.protocol === 'http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Remote backends require HTTPS')
    if (!['none','static','sso'].includes(b.auth?.kind ?? 'none')) throw Error(`Invalid authentication: ${id}`)
    if (b.auth?.kind === 'sso' && !login) throw Error('SSO requires an explicit login adapter')
    const rpm=b.requestsPerMinute ?? config.limits?.requestsPerMinute ?? 40
    if (!Number.isFinite(rpm) || rpm <= 0) throw Error('requestsPerMinute must be positive')
    const account=b.accountKey??id
    if(accountRates.has(account)&&accountRates.get(account)!==rpm)throw Error('Backends sharing accountKey must use the same requestsPerMinute')
    accountRates.set(account,rpm)
    if(!schedulers.has(account))schedulers.set(account,createScheduler({requestsPerMinute:rpm,interactiveReserve:config.limits?.interactiveReserve??0.3,queueTimeoutMs:config.limits?.queueTimeoutMs??30000,now,sleep}))
    states.set(id,{token:null,expires:0,logging:null,models:null,modelsAt:0,scheduler:schedulers.get(account)})
  }
  let server, closed=false, lastError
  const instanceId=crypto.randomUUID()
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
            const ttl=result.ttlMs??b.auth.tokenTTLMs??600000
            if(!Number.isFinite(ttl)||ttl<=0)throw Error('SSO adapter must return a positive TTL')
            s.token=result.token;s.expires=now()+ttl
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
  const request = async (id,path,{body,signal,source='interactive'}={}) => {
    const b=config.backends[id],s=states.get(id)
    const combined=AbortSignal.any([lifetime.signal,...(signal?[signal]:[]),AbortSignal.timeout(config.timeoutMs ?? 120000)])
    const send=async headers=>{
      await s.scheduler.acquire(source,combined)
      const response=await fetchImpl(`${b.baseURL.replace(/\/$/,'')}/${path}`,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:combined,redirect:'error'})
      if(response.status===429){const raw=response.headers.get('retry-after');const seconds=Number(raw);const wait=raw?(Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-now()):0;s.scheduler.backoff(Number.isFinite(wait)?wait:0);}
      return response
    }
    let poolWarning
    // A pool is opt-in and supplied by the intranet adapter. No token export API.
    if(pool && path==='chat/completions'){
      const borrowed=await pool.borrow(id,body.model,combined)
      if(borrowed){
        if(!['push','team','none'].includes(borrowed.key_source))throw Error('Pool adapter must declare key_source')
        const warning=borrowed.key_source==='push'?undefined:borrowed.key_source==='team'?'Pool tenant key supplied by node team':'Pool entry missing tenant key; using local credentials'
        poolWarning=warning
        if(warning)logger.warn({event:'pool-key-source',backend:id,key_source:borrowed.key_source??'none'})
        if(borrowed.key_source!=='none'&&!borrowed.error){
          const r=await send(new Headers(borrowed.headers))
          if(r.status!==401){if(!warning)return r;const headers=new Headers(r.headers);headers.set('x-workbench-pool-warning',warning);return new Response(r.body,{status:r.status,headers})}
          await r.body?.cancel();logger.info({event:'pool-fallback',backend:id})
        }
      }
    }
    let headers=await getHeaders(id,combined), old=states.get(id).token
    let response=await send(headers)
    if(response.status===401 && b.auth?.kind==='sso' && !(await credentials.headers?.(id))?.overrideAuth && !b.overrideAuth){
      await response.body?.cancel();logger.info({event:'relogin',backend:id});headers=await getHeaders(id,combined,old);response=await send(headers)
    }
    if(poolWarning){const headers=new Headers(response.headers);headers.set('x-workbench-pool-warning',poolWarning);return new Response(response.body,{status:response.status,headers})}
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
    const key=config.gatewayTokenRef?await credentials.get(config.gatewayTokenRef):undefined
    if(!key || requestObject.headers.get('x-gateway-token')!==key && requestObject.headers.get('authorization')!==`Bearer ${key}`)return Response.json({error:'Local gateway authentication required. Configure gatewayTokenRef in the host credential store and send x-gateway-token or Bearer; refresh credentials after rotation.'},{status:401})
    if(path==='/metrics' && requestObject.method==='GET')return Response.json({accounts:Object.fromEntries([...schedulers].map(([id,queue])=>[id,queue.metrics()]))})
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
    const source=requestObject.headers.get('x-workbench-source')??'interactive'
    if(!['interactive','background'].includes(source))return Response.json({error:'x-workbench-source must be interactive or background'},{status:400})
    const response=await request(id,'chat/completions',{body,signal:clientSignal??requestObject.signal,source})
    const headers=new Headers();for(const key of ['content-type','retry-after','x-workbench-pool-warning'])if(response.headers.has(key))headers.set(key,response.headers.get(key))
    if(response.status===401)headers.set('x-workbench-credential-hint',`${id}: update configured credential references in settings`)
    return new Response(response.body,{status:response.status,headers})
  }
  return {handle,models,request,status(){return {instanceId,pid:process.pid,port:config.port,listening:server?.listening===true && listeners.get(config.port)?.server===server,closed,error:lastError}},async probe(id,model,signal){const r=await request(id,'chat/completions',{body:{model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:8,stream:false},signal});await r.body?.cancel();return {backend:id,model,ok:r.ok,status:r.status,contextWindow:'unknown',modalities:'not inferred from a text probe'}},
    async start(){
      if(closed)throw Error('Gateway is closed')
      if(!config.gatewayTokenRef || !(await credentials.get(config.gatewayTokenRef)))throw Error('Configure gatewayTokenRef in the DSH credential store before starting the gateway')
      if(server)return
      if(listeners.has(config.port)){lastError=`Gateway port ${config.port} already owned by another instance (pid ${listeners.get(config.port).pid}, instance ${listeners.get(config.port).instanceId})`;throw Error(lastError)}
      server=createServer((req,res)=>{
        const abort=new AbortController();res.once('close',()=>{if(!res.writableEnded)abort.abort()});req.once('aborted',()=>abort.abort())
        const serve=async()=>{
          if(req.socket.remoteAddress!=='127.0.0.1'){res.writeHead(403);return res.end()}
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024){res.writeHead(413);return res.end()}chunks.push(chunk)}
          const response=await handle(new Request(`http://127.0.0.1:${config.port}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),abort.signal)
          res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res,{signal:abort.signal});else res.end()
        }
        void serve().catch(error => {
          if (abort.signal.aborted) logger.info({ event: 'cancelled' })
          if (res.destroyed || res.writableEnded) return
          if (res.headersSent) {
            res.destroy()
            return
          }
          const timedOut = error?.name === 'TimeoutError'
          const message = timedOut ? 'Gateway request timed out' : 'Gateway request failed; inspect backend settings'
          res.writeHead(timedOut ? 504 : 502, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: message }))
        })
      })
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve)}).catch(error=>{server=undefined;lastError=`Gateway port ${config.port}: ${error.code??'listen failed'}; this instance is not listening. Inspect the port owner with lsof -nP -iTCP:${config.port} (macOS/Linux) or Get-NetTCPConnection -LocalPort ${config.port} (PowerShell).`;throw Error(lastError)})
      lastError=undefined;listeners.set(config.port,{server,pid:process.pid,instanceId})
    },
    async close(){closed=true;lifetime.abort();for(const queue of schedulers.values())queue.close();for(const s of states.values()){s.token=null;s.expires=0}if(server){const owned=server;if(listeners.get(config.port)?.server===owned)listeners.delete(config.port);await new Promise(resolve=>{owned.close(resolve);owned.closeAllConnections()});server=undefined}},
  }
}
