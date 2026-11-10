import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument, isSeq } from 'yaml'

const packages = {
  'dsh-x-memory': ['x-memory'], 'dsh-context': ['dsh-context'], 'dsh-ops': ['dsh-ops'],
  'dsh-plugin-chatgpt': ['chatgpt'],
}
const yamlOptions = { customTags: [{tag:'tag:yaml.org,2002:js',resolve:value=>value}] }
// Used offline or inside the host configuration lock and HMR exclusive operation. The YAML AST retains !!js
// nodes without evaluating them; credentials and state directories are untouched.
export async function migrate(profile, { apply = false, stopped = false, managed = false } = {}) {
  const manifestPath=join(profile,'package.json'), patchPath=join(profile,'cordis.patch.yml')
  const manifestText=await readFile(manifestPath,'utf8'), patchText=await readFile(patchPath,'utf8')
  const manifest=JSON.parse(manifestText), bundles=manifest.dsh?.profile?.bundles ?? []
  const suites=bundles.filter(n=>['dsh-workbench-core','dsh-workbench-suite'].includes(n))
  if(suites.length!==1) throw new Error('Enable exactly one Workbench suite before migration')
  const suite=suites[0], doc=parseDocument(patchText,yamlOptions)
  if(doc.errors.length || !isSeq(doc.contents)) throw new Error('Invalid profile patch; no files changed')
  const receiptPath=join(profile,'workbench-migration.json')
  const previous=await readFile(receiptPath,'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return {handled:[]};throw error})
  const selected=Object.keys(packages).filter(n=>manifest.dependencies?.[n] && (bundles.includes(n)||!previous.handled.includes(n)) && !(n==='dsh-plugin-chatgpt' && suite==='dsh-workbench-core'))
  const overrides=[]
  for(const name of selected){
    const dir=join(profile,'node_modules',name), pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'))
    const source=parseDocument(await readFile(join(dir,pkg.dsh.bundle.patch),'utf8'),yamlOptions)
    if(source.errors.length || !isSeq(source.contents))throw new Error(`${name}: invalid upstream patch`)
    const entries=[]
    for(const layer of source.contents.items){
      const insert=layer.get('insert');if(layer.items.length!==1 || !isSeq(insert))throw new Error(`${name}: migration requires a reviewed insert-only patch`)
      entries.push(...insert.items)
    }
    if(entries.length!==packages[name].length || entries.some(e=>!packages[name].includes(e.get('id')) || e.get('name')!==name))throw new Error(`${name}: component layout changed; no files changed`)
    for(const entry of entries){
      const copy=entry.clone();copy.delete('name')
      copy.set('disabled', !bundles.includes(name) || entry.get('disabled')===true)
      overrides.push(copy)
    }
  }
  const plan={profile,suite,components:selected,changes:overrides.length,backup:null}
  if(!apply || !selected.length)return plan
  if(!stopped && !managed)throw new Error('Stop DSH for this profile, then pass --stopped; no files changed')
  // Defaults from the previously installed package go before the user layer.
  // Existing user edits and disable flags retain final precedence.
  doc.contents.items.unshift(...overrides)
  manifest.dsh.profile.bundles=bundles.filter(n=>!selected.includes(n))
  const backup=join(profile,'.workbench-backups',new Date().toISOString().replace(/[:.]/g,'-'))
  await mkdir(backup,{recursive:true,mode:0o700})
  await writeFile(join(backup,'package.json'),manifestText,{mode:0o600})
  await writeFile(join(backup,'cordis.patch.yml'),patchText,{mode:0o600})
  await writeFile(join(backup,'workbench-migration.json'),JSON.stringify(previous,null,2),{mode:0o600})
  for(const [path,text] of [[patchPath,doc.toString()],[manifestPath,JSON.stringify(manifest,null,2)+'\n'],[receiptPath,JSON.stringify({handled:[...new Set([...previous.handled,...selected])],backup},null,2)+'\n']]){
    await writeFile(path+'.workbench-tmp',text,{mode:0o600});await rename(path+'.workbench-tmp',path)
  }
  return {...plan,backup}
}
