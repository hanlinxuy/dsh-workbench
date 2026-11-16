import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises'
import {join,isAbsolute} from 'node:path'
import {createHash} from 'node:crypto'

export function redactOutput(text){
 // Tool results often wrap multiline text in JSON. Decode those strings before
 // redacting so an escaped newline cannot hide a credential field; re-encode
 // afterwards to preserve a valid, fully readable JSON result.
 if(/^[{[]/.test(text.trimStart())){
  try{return JSON.stringify(JSON.parse(text,(key,value)=>{
   if(/^(?:[\w-]*token|password|passwd|api[_-]?key|secret|authorization|cookie|set-cookie)$/i.test(key))return '***'
   return typeof value==='string'?redactOutput(value):value
  }))}catch{/* Non-JSON command output still uses the text redactor below. */}
 }
 return text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,'***')
  .replace(/\b(authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi,'$1: ***')
  .replace(/(["']?\b(?:[\w-]*token|password|passwd|api[_-]?key|secret)["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,(_all,prefix,value)=>prefix+(value[0]==='"'?'"***"':value[0]==="'"?"'***'":'***'))
  .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1***@')
}

// Storage belongs to the native host. This index owns only Workbench-created
// locators; it never scans or cleans another plugin's spill directory.
export async function createSpill({directory,store,maxInlineBytes=32768,headLines=40,tailLines=40,retentionDays=30,totalBudgetMiB=256,now=Date.now,log=console.info}){
 for(const [name,value] of Object.entries({maxInlineBytes,headLines,tailLines,retentionDays,totalBudgetMiB}))if(!Number.isInteger(value)||value<1)throw Error(`Invalid spill ${name}`)
 if(maxInlineBytes<2048)throw Error('spill maxInlineBytes must be at least 2048')
 const path=join(directory,'index.json'),budget=totalBudgetMiB*1048576
 await mkdir(directory,{recursive:true,mode:0o700})
 const index=JSON.parse(await readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error}))
 let queue=Promise.resolve()
 const serial=fn=>{const run=queue.then(fn);queue=run.catch(()=>{});return run}
 const save=async()=>{await writeFile(path+'.tmp',JSON.stringify(index),{mode:0o600});await rename(path+'.tmp',path)}
 const clean=async(reserve=0)=>{
  let bytes=Object.values(index).reduce((n,x)=>n+x.bytes,0),removed=0,freed=0
  for(const [handle,row] of Object.entries(index).sort((a,b)=>a[1].createdAt-b[1].createdAt)){
   if(now()-row.createdAt<=retentionDays*86400000&&bytes+reserve<=budget)continue
   await unlink(row.locator).catch(error=>{if(error.code!=='ENOENT')throw error})
   delete index[handle];bytes-=row.bytes;freed+=row.bytes;removed++
  }
  if(removed){await save();log(`Workbench spill cleanup: ${removed} files, ${freed} bytes freed`)}
 }
 await clean()
 return {
  bound(text,{sessionId,toolName,callId}){return serial(async()=>{
   const content=redactOutput(text),bytes=Buffer.byteLength(content)
   if(bytes<=maxInlineBytes)return content
   if(bytes>budget)throw Error('spill_budget_exceeded: full output exceeds configured storage budget; narrow the query')
   await clean()
   const handle='spill:'+createHash('sha256').update(sessionId+'\0'+content).digest('hex')
   let row=index[handle]
   if(row&&!await stat(row.locator).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error})){delete index[handle];row=undefined}
   if(!row){
    await clean(bytes)
    const ref=await store.saveText({owner:{sessionId},source:{kind:'tool',toolName,callId,label:'redacted-result'},suggestedName:`${new Date(now()).toISOString().slice(0,10)}-${toolName}.txt`,content})
    if(!isAbsolute(ref.locator))throw Error('Workbench spill paging requires the native local spill backend')
    row={locator:ref.locator,bytes,lines:content.split('\n').length,sessionId,toolName,createdAt:now()};index[handle]=row;await save()
   }
   const lines=content.split('\n'),head=lines.slice(0,headLines).join('\n'),tail=lines.slice(-tailLines).join('\n')
   // Cap even a single enormous line. Full redacted text remains retrievable.
   const chars=Math.floor((maxInlineBytes-1200)/8)
   const start=head.slice(0,chars).replace(/[\uD800-\uDBFF]$/,''),end=tail.slice(-chars).replace(/^[\uDC00-\uDFFF]/,'')
   const omitted=lines.length>headLines+tailLines?`行 ${headLines+1}–${lines.length-tailLines} 省略`:'超长行的中间内容省略'
   return `${start}\n… ${omitted}（超长行仅展示片段） …\n${end}\nFull redacted output: ${handle}; ${bytes} bytes, ${row.lines} lines. Use workbench_output(handle, offset=0, limit=200); nextOffset=null means complete.`
  })},
  read(handle,sessionId,offset=0,limit=200){return serial(async()=>{
   if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>2000)throw Error('Invalid spill offset/limit')
   await clean()
   const row=index[handle]
   if(!row||row.sessionId!==sessionId)throw Error('spill_not_found: expired or belongs to another session')
   const text=await readFile(row.locator,'utf8').catch(error=>{if(error.code==='ENOENT')throw Error('spill_expired: native retention removed this output');throw error})
   // Character offsets handle very long single-line JSON without losing data.
   let end=Math.min(text.length,offset+Math.min(limit*80,Math.floor((maxInlineBytes-1024)/8)))
   if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--
   return {text:text.slice(offset,end),offset,nextOffset:end<text.length?end:null,totalLines:row.lines,totalCharacters:text.length,bytes:row.bytes,source:row.toolName,createdAt:row.createdAt}
  })},
 }
}
