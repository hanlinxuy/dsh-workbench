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
  const adapter={
    name:'本地模型网关',
    backends:Object.keys(config.backends),
    async test(){const results=await Promise.all(Object.keys(config.backends).map(async id=>{const r=await gateway.request(id,'models');await r.body?.cancel();return r.ok}));return {connected:results.every(Boolean)}},
    async models(){
      const found=await gateway.models()
      // Use the same host editor as native model settings: only our configured
      // provider route is changed, never rewrite YAML or touch other profiles.
      if(config.providerEntryId && config.providerRoute){
        const row=ctx.configEditor.configuration().find(({entry})=>entry.options.id===config.providerEntryId)
        if(!row)throw Error('Configured provider entry not found')
        const route=config.providerRoute, existing={...row.inherited.providers,...row.override.providers}[route]
        if(!existing)throw Error('Configure the target provider route before syncing')
        const expected=`http://127.0.0.1:${config.port}/${config.providerBackend?config.providerBackend+'/':''}v1`
        if(existing.baseURL?.replace(/\/$/,'')!==expected)throw Error('Provider baseURL does not match this gateway')
        const list=found.filter(m=>!config.providerBackend || m.backend===config.providerBackend).map(({id})=>({id}))
        if(new Set(list.map(m=>m.id)).size!==list.length)throw Error('Duplicate model names: select providerBackend')
        await copyFile(ctx.configEditor.documentPath,ctx.configEditor.documentPath+`.bak-${Date.now()}`)
        await ctx.configEditor.edit(row.entry,(current,inherited)=>({...current,providers:{...current.providers,[route]:{...inherited.providers?.[route],...current.providers?.[route],models:list}}}))
        const updated=ctx.configEditor.configuration().find(({entry})=>entry.options.id===config.providerEntryId)
        if(JSON.stringify(updated?.override.providers?.[route]?.models)!==JSON.stringify(list))throw Error('Provider readback differs after sync; inspect backup')
      }
      return found.map(m=>({id:m.id,name:`${m.backend} · ${m.id}`}))
    },
    async probe({backend,model}){if(!Object.hasOwn(config.backends,backend)||typeof model!=='string')throw Error('Choose backend and model');return gateway.probe(backend,model)},
  }
  ctx.provide('workbenchIntranet',adapter)
}
