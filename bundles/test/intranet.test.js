import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createIntranetSettings,demoIntranetAdapter} from '../settings/intranet.js'
test('connection settings preserve secrets on blank edit, redact reads, restore after restart',async()=>{
 const p=await mkdtemp(join(tmpdir(),'intranet-settings-'))
 try{
  const call=createIntranetSettings(p)
  const form={employeeId:'demo-100',password:'dummy-password',maasToken:'dummy-maas',git:[{id:'git-one',label:'研发',url:'https://git.example.internal',token:'dummy-git'}]}
  const saved=await call('save',form)
  assert.equal(saved.passwordSaved,true);assert.equal(saved.git[0].tokenSaved,true)
  assert.ok(!JSON.stringify(saved).includes('dummy-'))
  await call('save',{...form,password:'',maasToken:'',git:[{...form.git[0],token:''}]})
  const raw=JSON.parse(await readFile(join(p,'.workbench-private/connections.json')))
  assert.equal(raw.password,form.password);assert.equal(raw.git[0].token,form.git[0].token)
  if(process.platform!=='win32')assert.equal((await stat(join(p,'.workbench-private/connections.json'))).mode&0o777,0o600)
  assert.deepEqual(await createIntranetSettings(p)('status'),saved)
  await assert.rejects(call('test'),/尚未接入/)
  await assert.rejects(call('save',{...form,git:[{...form.git[0],url:'https://user:secret@git.example.internal'}]}),/平台地址/)
  assert.equal((await createIntranetSettings(p,demoIntranetAdapter)('test')).demo,true)
  assert.equal((await createIntranetSettings(p,demoIntranetAdapter)('models')).models.length,2)
  const bad=createIntranetSettings(p,{name:'bad',async test(){throw Error(form.password)}})
  await assert.rejects(bad('test'),e=>!e.message.includes(form.password)&&e.message.includes('连接测试失败'))
 }finally{await rm(p,{recursive:true,force:true})}
})

test('gateway headers are redacted and blank edits preserve indexed secrets',async()=>{
 const home=await mkdtemp(join(tmpdir(),'intranet-headers-'));const run=createIntranetSettings(home,{name:'gateway',backends:['a']})
 try{const form={employeeId:'',password:'',maasToken:'',git:[],gatewayHeaders:[{id:'one',backend:'a',name:'x-a',value:'private',secret:true},{id:'two',backend:'a',name:'x_a',value:'public',secret:false}],gatewayOverrides:{a:true}}
 const saved=await run('save',form);assert.equal(saved.gatewayHeaders[0].value,'');assert.equal(saved.gatewayHeaders[0].valueSaved,true);assert.equal(saved.gatewayHeaders[1].value,'public');assert.deepEqual(saved.gatewayOverrides,{a:true})
 const again=await run('save',{...form,gatewayHeaders:saved.gatewayHeaders});assert.equal(again.gatewayHeaders[0].valueSaved,true)
 await assert.rejects(run('save',{...form,gatewayHeaders:[{...form.gatewayHeaders[0],value:'x\r\ny'}]}),/格式/)
 }finally{await rm(home,{recursive:true,force:true})}
})
