import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
// Detection and post-install verification are separate from the OS process
// runner, so tests never launch a real installer.
export async function inspectPowerShell(exec, platform, { executable = 'pwsh', source = 'PATH' } = {}) {
  if(platform !== 'win32')return {state:'not-needed',message:'当前系统无需安装 PowerShell，Workbench 使用宿主原生 Shell。'}
  const result=await exec([executable,'-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()']).catch(()=>null)
  const version=result?.exitCode===0?result.stdout.trim():undefined
  const details={executable,source,version}
  if(version && /^7\./.test(version))return {...details,state:'ready',message:`PowerShell ${version} · ${executable}（${source}）。路径由 DSH Shell 设置管理。`}
  if(source==='configured' && !version)return {...details,state:'invalid',message:`DSH 配置的 shell.pwshPath 无法执行：${executable}。请在宿主配置中修正此路径；不会静默换用其他 Shell。`}
  const winget=await exec(['winget.exe','--version']).catch(()=>null)
  const plan={supported:winget?.exitCode===0,file:'winget.exe',args:['install','--id','Microsoft.PowerShell','--exact','--source','winget']}
  return {...details,state:plan.supported?'missing':'unavailable',message:plan.supported?`当前 Shell：${executable}（${version??'不可用'}）。可使用 WinGet 安装 PowerShell 7。`:`当前 Shell：${executable}（${version??'不可用'}）；未找到 WinGet。可从公司软件中心或 Microsoft PowerShell 官方发布页取得 Windows ZIP，解压到用户目录，再将 DSH shell.pwshPath 设为其中 pwsh.exe 的绝对路径，无需管理员。`,manualURL:'https://github.com/PowerShell/PowerShell/releases',plan}
}
export async function installPowerShell(plan, exec, inspect) {
  const result=await exec([plan.file,...plan.args,'--disable-interactivity'],600000)
  const detected=await inspect()
  return detected.state==='ready'?{status:'completed',message:'已检测到 PowerShell 7。请重启 DSH 后使用。'}:{status:'needs-attention',message:'安装已结束，但当前宿主尚未检测到 PowerShell 7。可能需要重启或系统确认，请查看安装结果。',exitCode:result.exitCode,output:(result.stderr||result.stdout).slice(-4000)}
}

// Optional dependency resolution uses the installed bundle, never a global npm path.
export function bundledPowerShell({platform=process.platform,arch=process.arch,enabled=true,resolve=createRequire(import.meta.url).resolve}={}) {
  if(!enabled || platform!=='win32' || arch!=='x64')return undefined
  return Promise.resolve().then(()=>join(dirname(resolve('@dsh-ops/pwsh-win32-x64/package.json')),'bin','pwsh.exe')).catch(error=>{
    if(error.code==='MODULE_NOT_FOUND')return undefined
    throw error
  })
}
export async function useBundledPowerShell(editor,exec,executable) {
  if(!executable)throw Error('随包 PowerShell 不可用；请检查可选依赖是否已安装。')
  const detected=await inspectPowerShell(exec,'win32',{executable,source:'configured'})
  if(detected.state!=='ready')throw Error(detected.message)
  const row=editor.configuration().find(({entry})=>entry.options.id==='shell' || /(?:^|\/)dsh-pwsh-(?:local|sandbox)$/.test(entry.options.name??''))
  if(!row)throw Error('未找到可编辑的宿主 PowerShell 配置行，请在 DSH Shell 配置中设置 pwshPath。')
  await editor.edit(row.entry,(current,inherited)=>{
    if((current.pwshPath??inherited.pwshPath) && (current.pwshPath??inherited.pwshPath)!==executable)throw Error('已设置自定义 pwshPath，Workbench 不会覆盖它。')
    return {...current,pwshPath:executable}
  })
  return {status:'completed',message:`已将宿主 pwshPath 设置为 ${executable}。卸载套装前请清除此路径，恢复宿主自动选择。`}
}

// Only Workbench-owned paths may be replaced during upgrade/rollback.
export async function reconcilePowerShell({editor,exec,platform=process.platform,arch=process.arch,enabled=true,executable,managed,saveManaged,hostPath='pwsh',release=false}) {
 if(platform!=='win32')return {status:'not-needed',message:'当前系统使用宿主原生 Shell，无需 PowerShell。'}
 const row=editor.configuration().find(({entry})=>entry.options.id==='shell'||/(?:^|\/)dsh-pwsh-(?:local|sandbox)$/.test(entry.options.name??''))
 if(!row)return {status:'unavailable',message:'宿主 Shell 尚未就绪，请重新检测。'}
 const configured=row.override?.pwshPath??row.inherited?.pwshPath
 const owned=!!managed&&configured===managed.path
 if(release){
  if(owned)await editor.edit(row.entry,current=>{const next={...current};if(managed.previous===undefined)delete next.pwshPath;else next.pwshPath=managed.previous;return next})
  await saveManaged(undefined)
  return {status:'released',message:owned?'已恢复接入前的 Shell 配置。':'当前路径由用户管理，已保留。'}
 }
 if(!enabled)return {status:'disabled',message:'自动接入已关闭，保留当前 Shell 设置。'}
 if(configured&&!owned)return {status:'user-managed',...await inspectPowerShell(exec,platform,{executable:configured,source:'configured'})}
 if(!owned){const current=await inspectPowerShell(exec,platform,{executable:hostPath,source:'host'});if(current.state==='ready')return {...current,status:'host-ready'}}
 if(arch!=='x64')return {status:'unsupported',message:'随包 PowerShell 目前仅支持 Windows x64，保留宿主 Shell。'}
 if(!executable)return {status:'missing',message:'随包 PowerShell 未安装或可选依赖被排除。请点击安装/重试，使用宿主 pnpm 和代理下载固定版本。'}
 const probe=await exec([executable,'-NoLogo','-NoProfile','-NonInteractive','-Command',"$PSVersionTable.PSVersion.ToString() + '|' + $PSVersionTable.PSEdition"]).catch(()=>null)
 const match=probe?.exitCode===0?/^(7\.\d+\.\d+(?:[-+][\w.-]+)?)\|Core$/.exec(probe.stdout.trim()):null
 if(!match)return {status:'invalid',message:'随包运行时未通过 PowerShell 7 Core 验证，请安装/重试；未修改 Shell。'}
 if(owned&&configured===executable)return {status:'ready',executable,version:match[1],source:'workbench',message:`PowerShell ${match[1]} 已自动接入。`}
 await saveManaged({path:executable,previous:managed?managed.previous:row.override?.pwshPath})
 await editor.edit(row.entry,current=>({...current,pwshPath:executable}))
 return {status:'ready',executable,version:match[1],source:'workbench',message:`PowerShell ${match[1]} 已接入当前 profile。宿主后续 Shell 调用使用此路径。`}
}
