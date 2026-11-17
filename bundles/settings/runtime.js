import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createCapabilities} from './capabilities.js'
import {configureTrust} from './tls.js'
import {installOutput} from './output.js'
import {createStorageRegistry} from './storage.js'
import {createCredentialCatalog} from './catalog.js'
import { dirname, join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { inspectPowerShell, bundledPowerShell, reconcilePowerShell } from './powershell.js'
import { createIntranetSettings, demoIntranetAdapter } from './intranet.js'
import { migrate } from '../cli/migrate.mjs'

export const name = 'workbench-settings'
export const inject = ['connection','configEditor','subprocess','sessionController','credentials','tools','spillStore','systemPrompt']
export async function apply(ctx, config = {}) {
  const capabilities=createCapabilities(config.capabilities,(scope,toolSet)=>ctx.tools.definitions(scope,toolSet))
  ctx.provide('workbenchCapabilities',capabilities)
  for(const domain of ['credentials','storage','model-connections'])ctx.effect(()=>capabilities.register({domain,plugin:name}),`Workbench ${domain} ownership`)
  ctx.effect(()=>ctx.systemPrompt.section({name:'workbench-tool-budget',order:990,interpolate:false,text:({scope,toolSet})=>{capabilities.check(scope,toolSet);return ''}}),'Workbench actual tool budget')
  let trust=await configureTrust(config.tls)
  ctx.effect(()=>()=>trust.restore?.(),'Workbench native TLS trust')
  if(trust.configured)console.info(`Workbench TLS trust: ${JSON.stringify(trust.sources)}; certificates=${trust.certificates}`)
  const profile = dirname(ctx.configEditor.documentPath)
  if(ctx.spillStore&&ctx.tools)await installOutput(ctx,profile,config.spill??{})
  {
    const catalog=createCredentialCatalog(config.services??[],ctx.credentials,config.enabledPresets??[])
    ctx.provide('workbenchCredentials',catalog)
    ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-credentials',methods:['POST'],requestBody:'buffered',async fetch(request){
      try{
        const {action,ref,value}=await request.json()
        capabilities.assert('credentials',name)
        if(!['status','set','unset','reveal'].includes(action))throw Error('Unsupported credential action')
        return Response.json({ok:true,value:action==='status'?await catalog.status():await catalog[action](ref,value)},{headers:{'cache-control':'no-store'}})
      }catch(error){return Response.json({ok:false,error:{reason:/^(missing|placeholder|empty|unauthorized):/.exec(error.message)?.[1]??'unavailable',message:error.message}},{headers:{'cache-control':'no-store'}})}
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
      capabilities.assert('storage',name)
      return Response.json({ok:true,value:action==='status'?await storage.status():await storage.change(action,input)})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench storage credentials')

  const intranet=(action,input)=>createIntranetSettings(profile,config.intranetDemo?demoIntranetAdapter:ctx.get('workbenchIntranet'))(action,input)
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-intranet',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      const body=await request.json()
      capabilities.assert('model-connections',name)
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
  const managedFile=join(profile,'.workbench-private','pwsh-managed.json')
  let automatic
  const bundlePath=async()=>await bundledPowerShell({enabled:config.bundledPwsh!==false,resolve:createRequire(join(profile,'package.json')).resolve})??await bundledPowerShell({enabled:config.bundledPwsh!==false})
  const reconcile=async(release=false)=>{
    if(process.platform==='win32'&&!ctx.get('shell'))return automatic={status:'waiting',message:'正在等待宿主 Shell 就绪，随后自动检测 PowerShell。'}
    const managed=await readFile(managedFile,'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return undefined;throw error})
    automatic=await reconcilePowerShell({editor:ctx.configEditor,exec,enabled:config.autoPwsh!==false,executable:await bundlePath(),hostPath:ctx.get('shell')?.pwshPath,managed,release,saveManaged:async value=>{
      if(value===undefined){await unlink(managedFile).catch(error=>{if(error.code!=='ENOENT')throw error});return}
      await mkdir(dirname(managedFile),{recursive:true,mode:0o700})
      await writeFile(managedFile+'.tmp',JSON.stringify(value),{mode:0o600});await rename(managedFile+'.tmp',managedFile)
    }})
    return automatic
  }
  await reconcile()
  ctx.inject?.(['shell'],async()=>{await reconcile()})
  const editSettings=async change=>{
    const row=ctx.configEditor.configuration().find(r=>r.entry.options.id==='workbench-settings')
    if(!row)throw Error('Workbench settings row unavailable')
    await ctx.configEditor.edit(row.entry,change)
  }
  const status = async () => ({capabilities:capabilities.status(),tls:trust,migration:await migrate(profile),pwsh:{...await pwsh(),automatic,autoEnabled:config.autoPwsh!==false,bundled:await bundlePath()},busy,installation,lastMigration})
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-settings',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      const {action,domain,providedBy}=await request.json()
      if(!['status','migrate','install-pwsh','use-bundled-pwsh','enable-auto-pwsh','disable-auto-pwsh','release-pwsh','trust-system','set-provider'].includes(action))throw new Error('Unknown Workbench settings action')
      if(action==='status')return Response.json({ok:true,value:await status()})
      if(busy)throw new Error('Workbench 正在处理另一个操作，请稍候。')
      if((await ctx.sessionController.list({})).items.some(session=>session.running))throw new Error('有任务正在运行。请等任务完成后再操作；配置尚未修改。')
      if(action==='set-provider'){
        const available=capabilities.status().domains.find(d=>d.domain===domain)
        if(!available?.providers.some(p=>p.plugin===providedBy))throw Error('Select a currently declared provider')
        const next={...config.capabilities,owners:{...config.capabilities?.owners,[domain]:{providedBy}}}
        await editSettings(current=>({...current,capabilities:next}))
        return Response.json({ok:true,value:{message:'提供者已保存。请重启当前 profile 后核对入口与工具；现有会话保留。'}})
      }
      if(action==='trust-system'){
        const tls={...config.tls,trust:{...config.tls?.trust,sources:[...new Set([...(config.tls?.trust?.sources??[]),'system'])]},onVerifyError:'fail'}
        await editSettings(current=>({...current,tls}));config.tls=tls
        trust.restore?.();trust=await configureTrust(tls)
        return Response.json({ok:true,value:{message:'已合并系统根证书并保存。现有连接池可能需要重启当前 profile；未关闭证书校验。'}})
      }
      if(['enable-auto-pwsh','disable-auto-pwsh'].includes(action)){
        config.autoPwsh=action==='enable-auto-pwsh'
        await editSettings(current=>({...current,autoPwsh:config.autoPwsh}))
        return Response.json({ok:true,value:await reconcile()})
      }
      if(action==='release-pwsh'){
        await editSettings(current=>({...current,autoPwsh:false}));config.autoPwsh=false
        return Response.json({ok:true,value:await reconcile(true)})
      }
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
      if(action==='use-bundled-pwsh')return Response.json({ok:true,value:await reconcile()})
      if(process.platform!=='win32'||process.arch!=='x64')throw Error('随包安装仅适用于 Windows x64')
      const manager=ctx.get('pluginManager')
      if(!manager?.runPnpm)throw Error('宿主原生插件包管理器尚未就绪')
      busy=true;installation={status:'running',message:'正在通过宿主 pnpm 安装固定 PowerShell 7 运行时…'}
      void manager.runPnpm(['add','--save-optional','--save-exact','@dsh-ops/pwsh-win32-x64@0.2.1'],lifetime.signal).then(async result=>{
        if(result.exitCode!==0)throw Error('下载失败，请检查宿主代理、镜像源和原生安装日志')
        installation=await reconcile()
      }).catch(error=>{installation={status:'failed',message:error.message}}).finally(()=>{busy=false})
      return Response.json({ok:true,value:installation})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench settings route')
}
