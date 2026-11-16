import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readFile, copyFile } from 'node:fs/promises'
import { createGateway } from './runtime.js'

export const name='workbench-provider-gateway'
export const inject=['configEditor','credentials']
export async function apply(ctx,config={}) {
  const profile=dirname(ctx.configEditor.documentPath)
  const read=()=>readFile(join(profile,'.workbench-private/connections.json'),'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return {};throw e})
  const credentials={
    async get(ref){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref))throw Error('Invalid credential reference')
      const saved=await read();const mapped={WORKBENCH_ACCOUNT:saved.employeeId,WORKBENCH_PASSWORD:saved.password,WORKBENCH_MAAS_TOKEN:saved.maasToken}
      return mapped[ref] || (await ctx.credentials.resolve(ref))?.value
    },
    async headers(backend){const saved=await read();return {headers:[...(config.backends[backend]?.headers??[]),...(saved.gatewayHeaders??[]).filter(h=>h.backend===backend)],overrideAuth:saved.gatewayOverrides?.[backend]===true || config.backends[backend]?.overrideAuth===true}},
  }
  // An intranet plugin can supply its exact SSO protocol. No endpoint is guessed.
  const customLogin=ctx.get('workbenchGatewayLogin')
  const login=customLogin ?? (async({auth,credentials,signal})=>{
    if(!auth.loginURL)throw Error('Configure loginURL or workbenchGatewayLogin adapter')
    const url=new URL(auth.loginURL);if(url.protocol!=='https:' && !['127.0.0.1','localhost'].includes(url.hostname))throw Error('Login requires HTTPS')
    const response=await fetch(url,{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json'},body:JSON.stringify({[auth.accountField??'username']:await credentials.get(auth.accountRef),[auth.passwordField??'password']:await credentials.get(auth.passwordRef)})})
    if(!response.ok)throw Error('Login failed')
    const data=await response.json();const token=(auth.tokenPath??'access_token').split('.').reduce((v,k)=>v?.[k],data)
    return {token,ttlMs:auth.tokenTTLMs??600000}
  })
  const gateway=createGateway({config,credentials,login,pool:ctx.get('workbenchGatewayPool')})
  await gateway.start()
  ctx.effect(()=>()=>gateway.close(),'Provider gateway listener')
  const previews=new Map();let syncing=false
  const adapter={
    name:'本地模型网关',
    status:()=>gateway.status(),
    backends:Object.keys(config.backends),
    async test(){const results=await Promise.all(Object.keys(config.backends).map(async id=>{const r=await gateway.request(id,'models');await r.body?.cancel();return r.ok}));return {connected:results.every(Boolean)}},
    async models(){return (await gateway.models()).map(m=>({id:m.id,name:`${m.backend} · ${m.id}`}))},
    async syncModels({previewId,confirm=false}={}){
      if(syncing)throw Error('Model sync already running; preview again after it completes')
      if(!config.providerEntryId || !config.providerRoute)throw Error('Configure providerEntryId and providerRoute before syncing')
      const row=ctx.configEditor.configuration().find(({entry})=>entry.options.id===config.providerEntryId)
      if(!row)throw Error('Create the target provider in DSH model settings before syncing')
      const route=config.providerRoute, existing={...row.inherited.providers,...row.override.providers}[route]
      if(!existing)throw Error('Create the target provider route in DSH model settings before syncing')
      const expected=`http://127.0.0.1:${config.port}/${config.providerBackend?config.providerBackend+'/':''}v1`
      if(existing.baseURL?.replace(/\/$/,'')!==expected)throw Error('Provider baseURL does not match this gateway')
      if(!confirm){
        const found=await gateway.models()
        const list=found.filter(m=>!config.providerBackend || m.backend===config.providerBackend).map(({id})=>({id}))
        if(new Set(list.map(m=>m.id)).size!==list.length)throw Error('Duplicate model names: select providerBackend')
        const id=randomUUID()
        previews.clear();previews.set(id,{list,before:JSON.stringify(existing),expires:Date.now()+300000})
        return {previewId:id,provider:route,before:existing.models??[],after:list,expiresInSeconds:300,changed:JSON.stringify(existing.models??[])!==JSON.stringify(list)}
      }
      const preview=previews.get(previewId)
      if(!preview || preview.expires<Date.now())throw Error('Preview expired; preview model changes again')
      if(JSON.stringify(existing)!==preview.before)throw Error('Provider changed since preview; preview again')
      previews.delete(previewId);syncing=true
      const backup=ctx.configEditor.documentPath+`.bak-${Date.now()}-${randomUUID()}`
      try{
        await copyFile(ctx.configEditor.documentPath,backup)
        await ctx.configEditor.edit(row.entry,(current,inherited)=>{
          const target={...inherited.providers,...current.providers}[route]
          if(JSON.stringify(target)!==preview.before)throw Error('Provider changed since preview; preview again')
          return {...current,providers:{...current.providers,[route]:{...target,models:preview.list}}}
        })
        const updated=ctx.configEditor.configuration().find(({entry})=>entry.options.id===config.providerEntryId)
        if(JSON.stringify(updated?.override.providers?.[route]?.models)!==JSON.stringify(preview.list))throw Error('Provider readback differs after sync; inspect backup')
        return {status:'completed',provider:route,count:preview.list.length,backup}
      }finally{syncing=false}
    },
    async probe({backend,model}){if(!Object.hasOwn(config.backends,backend)||typeof model!=='string')throw Error('Choose backend and model');return gateway.probe(backend,model)},
  }
  ctx.provide('workbenchIntranet',adapter)
}
