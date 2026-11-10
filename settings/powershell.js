// Detection and post-install verification are separate from the OS process
// runner, so tests never launch a real installer.
export async function inspectPowerShell(exec, platform) {
  if(platform !== 'win32')return {state:'not-needed',message:'当前系统无需安装 PowerShell，Workbench 使用宿主原生 Shell。'}
  const result=await exec(['pwsh','-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()']).catch(()=>null)
  if(result?.exitCode===0 && /^7\./.test(result.stdout.trim()))return {state:'ready',version:result.stdout.trim(),message:'PowerShell 7 已可用；DSH 的自定义 Shell 路径保持不变。'}
  const winget=await exec(['winget.exe','--version']).catch(()=>null)
  const plan={supported:winget?.exitCode===0,file:'winget.exe',args:['install','--id','Microsoft.PowerShell','--exact','--source','winget']}
  return {state:plan.supported?'missing':'unavailable',message:plan.supported?'将使用 WinGet 安装 Microsoft.PowerShell。系统可能要求确认；安装后需重启 DSH。':'没有可用的 WinGet，请通过公司软件中心或微软安装程序安装 PowerShell 7。',plan}
}
export async function installPowerShell(plan, exec, inspect) {
  const result=await exec([plan.file,...plan.args,'--disable-interactivity'],600000)
  const detected=await inspect()
  return detected.state==='ready'?{status:'completed',message:'已检测到 PowerShell 7。请重启 DSH 后使用。'}:{status:'needs-attention',message:'安装已结束，但当前宿主尚未检测到 PowerShell 7。可能需要重启或系统确认，请查看安装结果。',exitCode:result.exitCode,output:(result.stderr||result.stdout).slice(-4000)}
}
