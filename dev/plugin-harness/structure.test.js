import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {inspectStructure,inspectToolBudget} from './scripts/structure.mjs'

test('package exports and declared files exist; web frontend export cannot disappear',async()=>{
 assert.ok((await inspectStructure()).includes('dsh-workbench-suite'))
 const root=await mkdtemp(join(tmpdir(),'wb-structure-'))
 try{
  await mkdir(join(root,'plugins','fixture'),{recursive:true});await mkdir(join(root,'bundles'))
  await writeFile(join(root,'plugins/fixture/package.json'),JSON.stringify({name:'fixture',dsh:{client:{platform:'web'}}}))
  await assert.rejects(inspectStructure(root),/client export/)
  await writeFile(join(root,'plugins/fixture/package.json'),JSON.stringify({name:'fixture',exports:{'.':'./missing.js'}}))
  await assert.rejects(inspectStructure(root),/missing export/)
  await writeFile(join(root,'plugins/fixture/package.json'),JSON.stringify({name:'fixture'}))
  await mkdir(join(root,'plugins/fixture/rows/x/locale'),{recursive:true});await writeFile(join(root,'plugins/fixture/rows/x.js'),'')
  await assert.rejects(inspectStructure(root),/row\/directory collision/)
  await rm(join(root,'plugins/fixture/rows'),{recursive:true})
  await writeFile(join(root,'plugins/fixture/icon.svg'),'<svg/>')
  await writeFile(join(root,'plugins/fixture/package.json'),JSON.stringify({name:'fixture',files:['icon.svg']}))
  await assert.rejects(inspectStructure(root),/icon export/)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('static tool descriptions remain within the Workbench budgets',async()=>{
 let total=0
 for(const plugin of ['chief','browser','desktop','git']){
  const text=await readFile(new URL(`../../plugins/${plugin}/index.js`,import.meta.url),'utf8')
  // These registrations deliberately use literal descriptions. Dynamic descriptions
  // must gain a registration-level budget test before changing this convention.
  const descriptions=[...text.matchAll(/description:\s*'((?:\\.|[^'\\])*)'/g)].map(m=>m[1])
  assert.ok(descriptions.length,`${plugin}: no literal tool description found`)
  for(const description of descriptions)total+=inspectToolBudget(plugin,description)
  for(const actions of text.matchAll(/actions:\s*\[([^\]]*)\]/g))inspectToolBudget(plugin,'',[...actions[1].matchAll(/'[^']+'/g)].length)
 }
 assert.ok(total<=8200,`Workbench descriptions ${total} > 8200`)
 assert.throws(()=>inspectToolBudget('oversized','short description',16),/split into 2 or more tools by risk/)
})
test('documented recurring mistakes require an executable convention at recurrence three',async()=>{
 const text=await readFile(new URL('../../docs/engineering/mistakes.md',import.meta.url),'utf8')
 const conventions=await readFile(new URL('../../docs/engineering/conventions.md',import.meta.url),'utf8')
 for(const item of text.split(/^## /m).slice(1)){
  const count=/复发:\s*(\d+)/.exec(item);assert.ok(count,'missing recurrence count')
  if(Number(count[1])>=3){const rule=/→ (C-\d+)/.exec(item);assert.ok(rule,'third recurrence must be promoted');assert.ok(conventions.includes(rule[1]))}
 }
 for(const rule of conventions.split(/^## C-/m).slice(1))assert.match(rule,/判据：/)
})
