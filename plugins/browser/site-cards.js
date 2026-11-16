import {readFile,readdir,mkdir,writeFile,copyFile,lstat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'

export async function loadSiteCards(directory,{tools=[],presets=[],egressEnabled=false}={}) {
 const cards=[],seen=new Map()
 for(const name of (await readdir(directory)).filter(n=>n.endsWith('.json')).sort()){
  const path=join(directory,name)
  if(!(await lstat(path)).isFile())throw Error(`Site source must be a regular file: ${path}`)
  const text=(await readFile(path,'utf8')).replaceAll('\r\n','\n')
  const bad=text.split('\n').findIndex(line=>/(?:token\s*=|cookie\s*:|authorization\s*:|@(?:[\w-]+:)?e\d+\b|snapshot_id|[?&](?:signature|sig|access_token|x-amz-signature)=|session-[0-9a-f-]{16,}|[A-Za-z0-9+/]{80,}={0,2})/i.test(line))
  if(bad>=0)throw Error(`Secret or runtime-state pattern in ${path}:${bad+1}`)
  let card
  try{card=JSON.parse(text)}catch{throw Error(`Invalid site JSON: ${path}`)}
  if(!card||!/^[a-z][a-z0-9-]*$/.test(card.site)||typeof card.version!=='string'||!['web','api','hybrid'].includes(card.access)||!['sso-cookie','site-account','oauth','none'].includes(card.login)||!Array.isArray(card.actions)||!card.actions.length||card.actions.some(a=>!['read','write-local','egress'].includes(a)))throw Error(`Invalid site identity/access/actions: ${path}`)
  for(const key of ['entry','identity','success','pits','forbidden'])if(typeof card[key]!=='string'||!card[key].trim())throw Error(`Missing ${key}: ${path}`)
  if(card.access!=='api'&&(!Array.isArray(card.steps)||!card.steps.length||card.steps.some(s=>typeof s!=='string'||!s)))throw Error(`Missing site workflow: ${path}`)
  if(!card.requires||!Array.isArray(card.requires.tools)||!Array.isArray(card.requires.presets)||[...card.requires.tools,...card.requires.presets].some(v=>typeof v!=='string'))throw Error(`Invalid requires: ${path}`)
  if(seen.has(card.site))throw Error(`Duplicate site ${card.site}: ${seen.get(card.site)} and ${path}`)
  seen.set(card.site,path)
  // Preset-disabled cards are not exposed, even if their tools are absent.
  if(card.requires.presets.some(p=>!presets.includes(p)))continue
  const missing=card.requires.tools.filter(t=>!tools.includes(t))
  if(missing.length)throw Error(`能力未启用: ${missing.join(', ')}; enable the required plugin for ${card.site} (${path})`)
  if(card.actions.includes('egress')&&!egressEnabled)throw Error(`Egress gate unavailable: refusing site ${card.site}`)
  cards.push({...card,source:path,sha256:createHash('sha256').update(text).digest('hex')})
 }
 return cards
}

export function renderSiteCard(card){
 const lines=['---',`name: ${JSON.stringify(`site-${card.site}`)}`,`description: ${JSON.stringify(`${card.site}: ${card.access} workflow (${card.version})`)}`,'---','',`# ${card.site}`,`Version: ${card.version}`,`Source SHA256: ${card.sha256}`,'',`Entry: ${card.entry}`,`Identity: ${card.identity}`,`Actions: ${card.actions.join(', ')}`,`Requires tools: ${card.requires.tools.join(', ')}`,`Requires presets: ${card.requires.presets.join(', ')}`,'',...(card.steps??[]).map((s,i)=>`${i+1}. ${s}`),'',`Success and readback: ${card.success}`,`Pitfalls: ${card.pits}`,`Forbidden: ${card.forbidden}`,'']
 return lines.join('\n')
}

export async function deploySiteCards(cards,directory){
 const results=[]
 for(const card of cards){
  const target=join(resolve(directory),`site-${card.site}`)
  await mkdir(target,{recursive:true})
  if((await lstat(target)).isSymbolicLink())throw Error('Site deployment does not follow symlinks')
  const file=join(target,'SKILL.md'),text=renderSiteCard(card)
  const before=await readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return undefined;throw error})
  let backup
  if(before!==undefined&&before!==text){backup=file+'.backup-'+createHash('sha256').update(before).digest('hex').slice(0,12);await copyFile(file,backup)}
  if(before!==text)await writeFile(file,text)
  results.push({site:card.site,changed:before!==text,backup,sourceSha256:card.sha256})
 }
 return results
}
