import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
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
  const pwsh = async () => {
    if(process.platform !== 'win32')return {state:'not-needed',message:'当前系统无需安装 PowerShell，Workbench 使用宿主原生 Shell。'}
    const result=await exec(['pwsh','-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()']).catch(()=>null)
    if(result?.exitCode===0 && /^7\./.test(result.stdout.trim()))return {state:'ready',version:result.stdout.trim(),message:'PowerShell 7 已可用；DSH 的自定义 Shell 路径保持不变。'}
    const require=createRequire(import.meta.url)
    const module=await import(pathToFileURL(join(dirname(require.resolve('dsh-ops/package.json')),'lib/shells/pwsh-upgrade.js')).href)
    const plan=module.hostPwshUpgradePlan()
    return {state:plan.supported?'missing':'unavailable',message:plan.supported?'将使用 WinGet 安装 Microsoft.PowerShell。系统可能要求确认；安装后需重启 DSH。':'没有可用的 WinGet，请通过公司软件中心或微软安装程序安装 PowerShell 7。',plan}
  }
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
            const reloaded=await hmr.reconcileProfile()
            return {...result,application:reloaded.restartReason||reloaded.pending.length?'restart-required':'applied',warnings:reloaded.warnings}
          }
          const result=await withFileLock(join(profile,'package.json'),()=>hmr?hmr.runExclusive(change):change(),{waitMs:5000})
          lastMigration=result
          return Response.json({ok:true,value:result})
        }finally{busy=false}
      }
      const info=await pwsh()
      if(info.state!=='missing')throw new Error(info.message)
      busy=true;installation={status:'running',message:'正在安装 PowerShell 7，请留意系统安装器提示。'}
      void exec([info.plan.file,...info.plan.args,'--disable-interactivity'],600000).then(async result=>{
        const detected=await pwsh()
        installation=detected.state==='ready'?{status:'completed',message:'已检测到 PowerShell 7。请重启 DSH 后使用。'}:{status:'needs-attention',message:'安装已结束，但当前宿主尚未检测到 PowerShell 7。可能需要重启或系统确认，请查看安装结果。',exitCode:result.exitCode,output:(result.stderr||result.stdout).slice(-4000)}
      }).catch(error=>{installation={status:'failed',message:`安装未完成：${error.message}。请先核对系统安装状态，不要重复点击。`}}).finally(()=>{busy=false})
      return Response.json({ok:true,value:installation})
    }catch(error){return Response.json({ok:false,error:{message:error.message}})}
  }}),'Workbench settings route')
}
