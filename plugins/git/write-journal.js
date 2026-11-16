import {createHash} from 'node:crypto'
import {mkdir,writeFile,appendFile,unlink} from 'node:fs/promises'
import {join} from 'node:path'

// A pending marker survives crashes and transport failures. Only verified writes
// remove it; retrying the same action cannot silently replay an uncertain write.
export function createWriteJournal(directory) {
 return async function execute(args,cwd,run){
  await mkdir(directory,{recursive:true,mode:0o700})
  const {confirm,authorization,...operation}=args
  const fingerprint=createHash('sha256').update(JSON.stringify({cwd,operation},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)).digest('hex')
  const marker=join(directory,`${fingerprint}.pending.json`),started=Date.now()
  const metadata={action:args.action,repository:args.repository??'current',fingerprint}
  await writeFile(marker,JSON.stringify({...metadata,at:new Date().toISOString(),status:'outcome_unknown'}),{flag:'wx',mode:0o600}).catch(error=>{
   if(error.code==='EEXIST')throw Error(`outcome_unknown: this operation is already pending or previously failed. Read the target state before retrying; an operator must reconcile journal ${fingerprint}. No request was sent.`)
   throw error
  })
  const record=status=>appendFile(join(directory,'git.ndjson'),JSON.stringify({...metadata,at:new Date().toISOString(),status,durationMs:Date.now()-started})+'\n',{mode:0o600})
  await record('started')
  try{
   const result=await run()
   await record('completed');await unlink(marker)
   return result
  }catch(error){await record('outcome_unknown');throw Error(`outcome_unknown: ${error.message}; inspect the target before replaying journal ${fingerprint}`)}
 }
}
