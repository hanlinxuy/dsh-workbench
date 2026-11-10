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
