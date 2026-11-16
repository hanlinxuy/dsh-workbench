import {readFile,stat,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'

export async function inspectStructure(root=resolve(fileURLToPath(new URL('../../../',import.meta.url)))) {
 const results=[]
 for(const group of ['plugins','bundles'])for(const {name:dir} of (await readdir(join(root,group),{withFileTypes:true})).filter(entry=>entry.isDirectory())){
  const base=join(root,group,dir)
  const raw=await readFile(join(base,'package.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e})
  if(!raw || dir==='chatgpt')continue
  const pkg=JSON.parse(raw)
  for(const file of pkg.files??[])await stat(join(base,file)).catch(()=>{throw Error(`${pkg.name}: missing packaged file ${file}`)})
  const walk=async value=>{
   if(typeof value==='string' && value.startsWith('./') && !value.includes('*'))await stat(join(base,value)).catch(()=>{throw Error(`${pkg.name}: missing export ${value}`)})
   else if(value && typeof value==='object')for(const child of Object.values(value))await walk(child)
  }
  await walk(pkg.exports)
  if(pkg.dsh?.client && !pkg.exports?.['./client'])throw Error(`${pkg.name}: web client requires ./client export`)
  const rows=await readdir(join(base,'rows'),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e})
  for(const row of rows.filter(r=>r.isDirectory()))if(rows.some(r=>r.isFile() && r.name.replace(/\.[^.]+$/,'')===row.name))throw Error(`${pkg.name}: row/directory collision ${row.name}`)
  results.push(pkg.name)
 }
 return results
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({checked:await inspectStructure()}))
