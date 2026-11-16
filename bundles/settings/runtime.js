import {createStorageRegistry} from './storage.js'
import {createCredentialCatalog} from './catalog.js'
import { dirname, join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { inspectPowerShell, installPowerShell, bundledPowerShell, useBundledPowerShell } from './powershell.js'
import { createIntranetSettings, demoIntranetAdapter } from './intranet.js'
import { migrate } from '../cli/migrate.mjs'

export const name = 'workbench-settings'
export const inject = ['connection','configEditor','subprocess','sessionController','credentials']
export function apply(ctx, config = {}) {
  const profile = dirname(ctx.configEditor.documentPath)
  {
    const catalog=createCredentialCatalog(config.services??[],ctx.credentials,config.enabledPresets??[])
    ctx.provide('workbenchCredentials',catalog)
    ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-credentials',methods:['POST'],requestBody:'buffered',async fetch(request){
      try{
        const {action,ref,value}=await request.json()
        if(!['status','set','unset'].includes(action))throw Error('Unsupported credential action')
        return Response.json({ok:true,value:action==='status'?await catalog.status():await catalog[action](ref,value)})
      }catch(error){return Response.json({ok:false,error:{message:error.message}})}
    }}),'Workbench credential catalog')
  }

  const storage=createStorageRegistry({credentials:ctx.credentials,
    enabled:()=> (config.enabledPresets??[]).includes(config.storagePreset??'data-compute'),
    read:()=>{const row=ctx.configEditor.configuration().find(r=>r.entry.options.id==='workbench-settings');return row?.override.storage??row?.inherited.storage??config.storage??{}},
    update:async change=>{
      const row=ctx.configEditor.configuration().find(r=>r.entry.options.id==='workbench-settings')
      if(!row)throw Error('Workbench settings configuration row is unavailable')
      await ctx.configEditor.edit(row.entry,(current,inherited)=>({...current,storage:change(current.storage??inherited.storage??{})}))
    },
  })
  ctx.provide('workbenchStorage',storage)
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-storage',methods:['POST'],requestBody:'buffered',async fetch(request){
    try{
      const {action,input}=await request.json()
      return Response.json({ok:true,value:action==='status'?await storage.status():await storage.change(action,input)})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench storage credentials')

  const intranet=(action,input)=>createIntranetSettings(profile,config.intranetDemo?demoIntranetAdapter:ctx.get('workbenchIntranet'))(action,input)
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-intranet',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      const body=await request.json()
      if(!['status','save','test','models','probe','sync-models'].includes(body.action))throw Error('未知操作。')
      return Response.json({ok:true,value:await intranet(body.action,body.input)})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench intranet settings')
  let lastMigration
  let busy = false, installation = { status: 'idle' }
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort(), 'Workbench settings lifetime')
  const exec = async (argv, timeout = 5000) => {
    const child = ctx.subprocess.spawn({argv,cwd:profile,stdio:{stdin:'ignore',stdout:{maxBytes:65536},stderr:{maxBytes:65536}},graceMs:1000,signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(timeout)])})
    const result = await child.done
    return {...result, stdout:child.collected.stdout.readFrom(0).text, stderr:child.collected.stderr.readFrom(0).text}
  }
  const pwsh = () => {
    // Inspect the native executor's chosen path, not a second PATH-only resolver.
    const shell=ctx.get('shell')
    const configured=shell?.config?.pwshPath?.get()
    return inspectPowerShell(exec,process.platform,{executable:shell?.pwshPath??'pwsh',source:configured?'configured':shell?.pwshPath?'host':'PATH'})
  }
  const status = async () => ({migration:await migrate(profile),pwsh:{...await pwsh(),bundled:await bundledPowerShell({enabled:config.bundledPwsh!==false})},busy,installation,lastMigration})
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-settings',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      const {action}=await request.json()
      if(!['status','migrate','install-pwsh','use-bundled-pwsh'].includes(action))throw new Error('Unknown Workbench settings action')
      if(action==='status')return Response.json({ok:true,value:await status()})
      if(busy)throw new Error('Workbench 正在处理另一个操作，请稍候。')
      if((await ctx.sessionController.list({})).items.some(session=>session.running))throw new Error('有任务正在运行。请等任务完成后再操作；配置尚未修改。')
      if(action==='migrate'){
        busy=true
        try {
          const hmr=ctx.get('hmr')
          const change=async()=>{
            const result=await migrate(profile,{apply:true,managed:true})
            if(!result.changes)return {...result,application:'unchanged'}
            // The same native serialization as DSH's plugin manager. No live
            // file watcher sees a half-written composition while inside HMR.
            if(!hmr)return {...result,application:'restart-required'}
            return hmr.reconcileProfile().then(reloaded=>({...result,application:reloaded.restartReason||reloaded.pending.length?'restart-required':'applied',warnings:reloaded.warnings}),error=>({...result,application:'restart-required',warnings:[`配置已保存，但实时重载失败：${error.message}`]}))
          }
          const result=await withFileLock(join(profile,'package.json'),()=>hmr?hmr.runExclusive(change):change(),{waitMs:5000})
          lastMigration=result
          return Response.json({ok:true,value:result})
        }finally{busy=false}
      }
      if(action==='use-bundled-pwsh')return Response.json({ok:true,value:await useBundledPowerShell(ctx.configEditor,exec,await bundledPowerShell({enabled:config.bundledPwsh!==false}))})
      const info=await pwsh()
      if(info.state!=='missing')throw new Error(info.message)
      busy=true;installation={status:'running',message:'正在安装 PowerShell 7，请留意系统安装器提示。'}
      void installPowerShell(info.plan,exec,pwsh).then(result=>{installation=result}).catch(error=>{installation={status:'failed',message:`安装未完成：${error.message}。请先核对系统安装状态，不要重复点击。`}}).finally(()=>{busy=false})
      return Response.json({ok:true,value:installation})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench settings route')
}
