import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectPowerShell,installPowerShell} from '../settings/powershell.js'
test('PowerShell detection skips other OS and existing 7, distinguishes missing WinGet',async()=>{
 let calls=0
 const ready=async()=>{calls++;return {exitCode:0,stdout:'7.6.6\n'}}
 assert.equal((await inspectPowerShell(ready,'darwin')).state,'not-needed');assert.equal(calls,0)
 assert.equal((await inspectPowerShell(ready,'win32')).state,'ready')
 assert.equal((await inspectPowerShell(async()=>{throw Error('ENOENT')},'win32')).state,'unavailable')
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

test('uses native resolved path and never hides a broken explicit path',async()=>{
 const calls=[]
 const run=async argv=>{calls.push(argv[0]);return {exitCode:0,stdout:'7.6.6'}}
 const path='C:\\Users\\user\\Portable Shell\\pwsh.exe'
 const ready=await inspectPowerShell(run,'win32',{executable:path,source:'host'})
 assert.equal(ready.executable,path);assert.equal(ready.state,'ready');assert.deepEqual(calls,[path])
 calls.length=0
 const broken=await inspectPowerShell(async argv=>{calls.push(argv[0]);throw Error('ENOENT')},'win32',{executable:path,source:'configured'})
 assert.equal(broken.state,'invalid');assert.deepEqual(calls,[path]);assert.match(broken.message,/shell.pwshPath/)
})

test('optional runtime is platform gated and host configuration preserves explicit choice',async()=>{
 const {bundledPowerShell,useBundledPowerShell}=await import('../settings/powershell.js')
 let resolves=0
 const resolve=()=>{resolves++;return '/fixture/node_modules/@dsh-ops/pwsh-win32-x64/package.json'}
 assert.equal(await bundledPowerShell({platform:'darwin',resolve}),undefined)
 assert.equal(await bundledPowerShell({platform:'win32',arch:'x64',enabled:false,resolve}),undefined)
 assert.equal(resolves,0)
 const executable=await bundledPowerShell({platform:'win32',arch:'x64',resolve})
 assert.match(executable,/bin[/\\]pwsh.exe$/)
 let current={other:'preserved'},writes=0
 const editor={configuration:()=>[{entry:{options:{id:'shell'}}}],edit:async(entry,change)=>{current=change(current,{});writes++}}
 const exec=async()=>({exitCode:0,stdout:'7.6.6'})
 assert.equal((await useBundledPowerShell(editor,exec,executable)).status,'completed')
 assert.equal(current.other,'preserved');assert.equal(current.pwshPath,executable)
 current.pwshPath='C:\\custom\\pwsh.exe'
 await assert.rejects(useBundledPowerShell(editor,exec,executable),/不会覆盖/)
 assert.equal(writes,1)
 await assert.rejects(useBundledPowerShell(editor,async()=>({exitCode:1,stdout:''}),executable),/无法执行/)
 assert.equal(writes,1)
})

test('Windows packaged runtime executes the pinned PowerShell version', {skip:process.platform!=='win32'||process.arch!=='x64'}, async()=>{
 const {createRequire}=await import('node:module')
 const {execFile}=await import('node:child_process')
 const {promisify}=await import('node:util')
 const {bundledPowerShell}=await import('../settings/powershell.js')
 const executable=await bundledPowerShell({resolve:createRequire(new URL('../workbench/package.json',import.meta.url)).resolve})
 assert.ok(executable,'optional Windows runtime must be installed')
 const detected=await inspectPowerShell(async argv=>{const r=await promisify(execFile)(argv[0],argv.slice(1),{timeout:20000});return {exitCode:0,stdout:r.stdout}},'win32',{executable,source:'bundled'})
 assert.equal(detected.state,'ready');assert.equal(detected.version,'7.6.6')
})
