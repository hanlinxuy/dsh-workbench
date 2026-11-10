import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import { migrate } from '../cli/migrate.mjs'

test('migration preserves configured values, disabled components and JS tags; repeat is a no-op',async()=>{
 const p=await mkdtemp(join(tmpdir(),'wb-migrate-'))
 try{
  const manifest={dependencies:{'dsh-x-memory':'0.1.1','dsh-context':'0.83.1'},dsh:{profile:{bundles:['dsh-x-memory','dsh-workbench-core']}}}
  await writeFile(join(p,'package.json'),JSON.stringify(manifest))
  const original='- id: x-memory\n  name: dsh-x-memory\n  config:\n    marker: !!js env.MEMORY_PATH\n    max: 123\n- id: dsh-context\n  disabled: true\n'
  await writeFile(join(p,'cordis.patch.yml'),original)
  for(const [n,id] of [['dsh-x-memory','x-memory'],['dsh-context','dsh-context']]){
   const d=join(p,'node_modules',n);await mkdir(d,{recursive:true});await writeFile(join(d,'package.json'),JSON.stringify({dsh:{bundle:{patch:'patch.yml'}}}));await writeFile(join(d,'patch.yml'),`- insert:\n    - id: ${id}\n      name: ${n}\n      config:\n        customDefault: saved\n`)
  }
  assert.equal((await migrate(p)).changes,2)
  assert.equal(await readFile(join(p,'cordis.patch.yml'),'utf8'),original)
  await assert.rejects(migrate(p,{apply:true}),/Stop DSH/)
  const result=await migrate(p,{apply:true,stopped:true})
  const after=await readFile(join(p,'cordis.patch.yml'),'utf8')
  assert.match(after,/!!js env.MEMORY_PATH/)
  const rows=parseDocument(after,{customTags:[{tag:'tag:yaml.org,2002:js',resolve:v=>v}]}).toJS()
  assert.equal(rows[0].config.customDefault,'saved');assert.equal(rows[0].disabled,false);assert.equal(rows[1].disabled,true);assert.equal(rows[2].config.max,123)
  assert.equal(await readFile(join(result.backup,'cordis.patch.yml'),'utf8'),original)
  assert.deepEqual(JSON.parse(await readFile(join(p,'package.json'))).dsh.profile.bundles,['dsh-workbench-core'])
  assert.equal((await migrate(p,{apply:true,stopped:true})).changes,0)
  assert.equal(await readFile(join(p,'cordis.patch.yml'),'utf8'),after)
 }finally{await rm(p,{recursive:true,force:true})}
})
