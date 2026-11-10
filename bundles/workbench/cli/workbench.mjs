#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectPowerShell, installPowerShell } from '../settings/powershell.js'
import { migrate } from './migrate.mjs'
const {positionals,values}=parseArgs({allowPositionals:true,options:{'profile-dir':{type:'string'},apply:{type:'boolean'},stopped:{type:'boolean'},yes:{type:'boolean'}}})
if(positionals[0]==='migrate'){
  if(!values['profile-dir'])throw new Error('Supply --profile-dir for the intended DSH profile; preview is the default')
  console.log(JSON.stringify(await migrate(resolve(values['profile-dir']),values),null,2))
}else if(positionals[0]==='pwsh'){
  const exec=async(argv,timeout=5000)=>{
    const result=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',timeout,windowsHide:true})
    if(result.error)throw result.error
    return {exitCode:result.status,stdout:result.stdout??'',stderr:result.stderr??''}
  }
  const inspect=()=>inspectPowerShell(exec,process.platform)
  const info=await inspect()
  console.log(info.message)
  if(info.state==='missing'){
    if(values.yes){const result=await installPowerShell(info.plan,exec,inspect);console.log(result.message);if(result.status!=='completed')process.exitCode=1}
    else console.log('Run with --yes to install: '+[info.plan.file,...info.plan.args].join(' '))
  }

}else throw new Error('Usage: dsh-workbench migrate --profile-dir PATH [--apply --stopped] | pwsh [--yes]')
