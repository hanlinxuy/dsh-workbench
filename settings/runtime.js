import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { inspectPowerShell, installPowerShell } from './powershell.js'
import { migrate } from '../cli/migrate.mjs'

export const name = 'workbench-settings'
export const inject = ['connection','configEditor','subprocess','sessionController']
export function apply(ctx) {
  const profile = dirname(ctx.configEditor.documentPath)
  let lastMigration
  let busy = false, installation = { status: 'idle' }
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort(), 'Workbench settings lifetime')
  const exec = async (argv, timeout = 5000) => {
    const child = ctx.subprocess.spawn({argv,cwd:profile,stdio:{stdin:'ignore',stdout:{maxBytes:65536},stderr:{maxBytes:65536}},graceMs:1000,signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(timeout)])})
    const result = await child.done
    return {...result, stdout:child.collected.stdout.readFrom(0).text, stderr:child.collected.stderr.readFrom(0).text}
  }
  const pwsh = () => inspectPowerShell(exec, process.platform, async () => {
    const require=createRequire(import.meta.url)
    const module=await import(pathToFileURL(join(dirname(require.resolve('dsh-ops/package.json')),'lib/shells/pwsh-upgrade.js')).href)
    return module.hostPwshUpgradePlan()
  })
  const status = async () => ({migration:await migrate(profile),pwsh:await pwsh(),busy,installation,lastMigration})
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/workbench-settings',methods:['POST'],requestBody:'buffered',async fetch(request){
    try {
      const {action}=await request.json()
      if(!['status','migrate','install-pwsh'].includes(action))throw new Error('Unknown Workbench settings action')
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
      const info=await pwsh()
      if(info.state!=='missing')throw new Error(info.message)
      busy=true;installation={status:'running',message:'正在安装 PowerShell 7，请留意系统安装器提示。'}
      void installPowerShell(info.plan,exec,pwsh).then(result=>{installation=result}).catch(error=>{installation={status:'failed',message:`安装未完成：${error.message}。请先核对系统安装状态，不要重复点击。`}}).finally(()=>{busy=false})
      return Response.json({ok:true,value:installation})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench settings route')
}
