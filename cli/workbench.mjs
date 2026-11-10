#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { migrate } from './migrate.mjs'
const {positionals,values}=parseArgs({allowPositionals:true,options:{'profile-dir':{type:'string'},apply:{type:'boolean'},stopped:{type:'boolean'},yes:{type:'boolean'}}})
if(positionals[0]==='migrate'){
  if(!values['profile-dir'])throw new Error('Supply --profile-dir for the intended DSH profile; preview is the default')
  console.log(JSON.stringify(await migrate(resolve(values['profile-dir']),values),null,2))
}else if(positionals[0]==='pwsh'){
  if(process.platform!=='win32'){
    console.log('PowerShell installation is unnecessary for Workbench on this OS. DSH uses the native shell. No changes made.')
  }else{
    const version=spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()'],{encoding:'utf8',timeout:5000,windowsHide:true})
    if(version.status===0 && /^7\./.test(version.stdout.trim()))console.log(`PowerShell ${version.stdout.trim()} is available; no installation needed. Explicit DSH pwshPath settings remain authoritative.`)
    else{
      const require=createRequire(import.meta.url)
      const entry=new URL('./bin/dsh-ops.mjs',pathToFileURL(require.resolve('dsh-ops/package.json')))
      const result=spawnSync(process.execPath,[fileURLToPath(entry),'upgrade-host-pwsh',...(values.yes?['--yes']:[])],{stdio:'inherit'})
      if(result.error)throw result.error
      process.exitCode=result.status??1
    }
  }
}else throw new Error('Usage: dsh-workbench migrate --profile-dir PATH [--apply --stopped] | pwsh [--yes]')
