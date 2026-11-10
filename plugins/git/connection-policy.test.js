import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {connectionPolicy} from './connection-policy.js'
import {createGit} from './runtime.js'
import {createIntranetSettings} from '../../bundles/settings/intranet.js'

test('saved UI permissions default deny, grant and revoke writes without restart',async()=>{
 const p=await mkdtemp(join(tmpdir(),'git-permissions-'))
 const oldFetch=globalThis.fetch;let requests=0,commands=[]
 globalThis.fetch=async()=>{requests++;return new Response('{}',{status:200})}
 try{
  const settings=createIntranetSettings(p)
  const form={employeeId:'test',password:'',maasToken:'',git:[{id:'one',label:'GitLab',url:'https://git.example.internal',token:''}]}
  await settings('save',form)
  const policy=connectionPolicy(p)
  const config={platforms:{gitlab:{network:'internal',kind:'gitlab',hosts:['git.example.internal'],apiBase:'https://git.example.internal/api/v4',apiWrites:['issue_create','comment_create','mr_create']}},repositories:{test:{path:p,platform:'gitlab',apiRepo:'org/repo',localWrite:true,remotes:{origin:{platform:'gitlab',url:'https://git.example.internal/org/repo.git',push:true,fetch:true}}}}}
  const run=createGit(config,async(file,args)=>{commands.push(args);return {stdout:args.includes('get-url')?'https://git.example.internal/org/repo.git\n':''}},policy)
  await run({action:'status',repository:'test'})
  await run({action:'issue_create',repository:'test',title:'test',body:'test'})
  assert.equal(requests,1)
  await assert.rejects(run({action:'stage',repository:'test',paths:['file']}),/disabled/)
  await assert.rejects(run({action:'push',repository:'test',branch:'main'}),/disabled/)
  await assert.rejects(run({action:'comment_create',repository:'test',number:1,body:'test'}),/disabled/)
  assert.equal(requests,1)
  await settings('save',{...form,git:[{...form.git[0],permissions:{write:true,push:true}}]})
  await run({action:'stage',repository:'test',paths:['file']})
  await run({action:'push',repository:'test',branch:'main'})
  await run({action:'comment_create',repository:'test',number:1,body:'test'})
  const restricted=createGit({...config,platforms:{gitlab:{...config.platforms.gitlab,apiWrites:[]}}},async()=>{throw Error('unexpected command')},policy)
  await assert.rejects(restricted({action:'issue_create',repository:'test',title:'x',body:'x'}),/disabled/)
  await assert.rejects(restricted({action:'comment_create',repository:'test',number:1,body:'x'}),/disabled/)
  assert.equal(requests,2);assert.ok(commands.some(a=>a.includes('push')))
  await settings('save',form)
  await assert.rejects(run({action:'stage',repository:'test',paths:['file']}),/disabled/)
  assert.deepEqual(await connectionPolicy(p)(['git.example.internal']),{write:false,push:false})
  assert.equal(await policy(['another.example.internal']),null)
  await settings('save',{...form,git:[{...form.git[0],permissions:{write:true,push:true}}]})
  const external=createGit({...config,platforms:{gitlab:{...config.platforms.gitlab,network:'external'}}},async()=>{throw Error('must not execute')},policy)
  await assert.rejects(external({action:'push',repository:'test',branch:'main'}),/disabled/)
 }finally{globalThis.fetch=oldFetch;await rm(p,{recursive:true,force:true})}
})
