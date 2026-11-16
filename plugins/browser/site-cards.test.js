import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {loadSiteCards,deploySiteCards,renderSiteCard} from './site-cards.js'
const card={site:'portal',version:'1',access:'web',login:'site-account',actions:['read'],requires:{tools:['workbench_browser'],presets:['intranet-core']},entry:'https://portal.example.invalid',identity:'Read the signed-in account label before acting.',steps:['Open the entry and inspect the current page.'],success:'Read the requested record identifier and state from its detail page.',pits:'Wait until the loading indicator disappears.',forbidden:'Do not submit changes.'}
test('cards gate real capabilities, detect source duplicates and leaks with line positions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'site-source-')),options={tools:['workbench_browser'],presets:['intranet-core']}
 try{
  await writeFile(join(dir,'a.json'),JSON.stringify(card,null,2))
  assert.deepEqual(await loadSiteCards(dir),[])
  await assert.rejects(loadSiteCards(dir,{presets:options.presets}),/能力未启用/)
  assert.equal((await loadSiteCards(dir,options))[0].site,'portal')
  await writeFile(join(dir,'b.json'),JSON.stringify(card));await assert.rejects(loadSiteCards(dir,options),/a.json.*b.json/);await rm(join(dir,'b.json'))
  for(const leak of ['token=fake-value','@e12','https://site.invalid/?signature=fake','session-01234567-1234-4321']){await writeFile(join(dir,'a.json'),JSON.stringify({...card,pits:leak},null,2));await assert.rejects(loadSiteCards(dir,options),/a.json:\d+/)}
  await writeFile(join(dir,'a.json'),JSON.stringify({...card,actions:['egress']}));await assert.rejects(loadSiteCards(dir,options),/Egress gate unavailable/)
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('deployment is reproducible, preserves edited artifacts as backups and keeps source version',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'site-deploy-')),cards=[{...card,sha256:'source-hash'}]
 try{
  assert.equal((await deploySiteCards(cards,dir))[0].changed,true)
  assert.equal((await deploySiteCards(cards,dir))[0].changed,false)
  const path=join(dir,'site-portal','SKILL.md');await writeFile(path,'manual edit')
  const result=(await deploySiteCards(cards,dir))[0]
  assert.equal(await readFile(result.backup,'utf8'),'manual edit');assert.equal(await readFile(path,'utf8'),renderSiteCard(cards[0]))
 }finally{await rm(dir,{recursive:true,force:true})}
})
