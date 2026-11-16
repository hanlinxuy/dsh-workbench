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
