import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectPowerShell,installPowerShell} from '../settings/powershell.js'
test('PowerShell detection skips other OS and existing 7, distinguishes missing WinGet',async()=>{
 let calls=0
 const ready=async()=>{calls++;return {exitCode:0,stdout:'7.6.6\n'}}
 assert.equal((await inspectPowerShell(ready,'darwin',()=>{})).state,'not-needed');assert.equal(calls,0)
 assert.equal((await inspectPowerShell(ready,'win32',()=>{throw Error('must not plan')})).state,'ready')
 assert.equal((await inspectPowerShell(async()=>{throw Error('ENOENT')},'win32',()=>({supported:false}))).state,'unavailable')
 const missing=await inspectPowerShell(async argv=>({exitCode:0,stdout:argv[0]==='pwsh'?'5.1':'v1.12'}),'win32');assert.equal(missing.state,'missing');assert.deepEqual(missing.plan,{supported:true,file:'winget.exe',args:['install','--id','Microsoft.PowerShell','--exact','--source','winget']})
})
test('installer exit alone is not proof of availability; errors never retry',async()=>{
 let calls=0
 const plan={file:'winget.exe',args:['install','--id','Microsoft.PowerShell']}
 const run=async(argv,timeout)=>{calls++;assert.deepEqual(argv,[...Object.values(plan).flat(),'--disable-interactivity']);assert.equal(timeout,600000);return {exitCode:0,stdout:'ok',stderr:''}}
 assert.equal((await installPowerShell(plan,run,async()=>({state:'missing'}))).status,'needs-attention')
 assert.equal((await installPowerShell(plan,run,async()=>({state:'ready'}))).status,'completed')
 await assert.rejects(installPowerShell(plan,async()=>{calls++;throw Error('cancelled')},async()=>{}),/cancelled/)
 assert.equal(calls,3)
})
