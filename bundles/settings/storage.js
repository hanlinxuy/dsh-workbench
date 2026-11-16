import {randomUUID} from 'node:crypto'

// Metadata is operator-owned; values remain exclusively in the host credential store.
export function storageIndex(value = {}) {
 if(!value || !Array.isArray(value.buckets??[]) || !Array.isArray(value.orphans??[]))throw Error('Invalid storage index')
 const ids=new Set(),targets=new Set()
 const buckets=(value.buckets??[]).map(row=>{
  if(!row || !/^[a-z][a-z0-9]{0,63}$/.test(row.id) || ids.has(row.id) || typeof row.label!=='string' || typeof row.endpoint!=='string' || !row.endpoint.trim() || typeof row.bucket!=='string' || !row.bucket || /[\r\n\0]/.test(row.endpoint+row.bucket))throw Error('Invalid storage bucket metadata')
  if(row.endpoint.includes('://')){const u=new URL(row.endpoint);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Storage endpoint must not contain credentials or query parameters')}
  const key=JSON.stringify([row.endpoint,row.bucket]);if(targets.has(key))throw Error(`Duplicate storage target: ${row.endpoint} / ${row.bucket}`)
  ids.add(row.id);targets.add(key)
  return {id:row.id,label:row.label,endpoint:row.endpoint,bucket:row.bucket}
 })
 const orphans=(value.orphans??[]).map(id=>{if(!/^[a-z][a-z0-9]{0,63}$/.test(id)||ids.has(id))throw Error('Invalid orphan storage id');return id})
 return {buckets,orphans:[...new Set(orphans)]}
}
const refFor=id=>`WORKBENCH_STORAGE_${id.toUpperCase()}`
export function createStorageRegistry({credentials,read,update,enabled}) {
 let pending=Promise.resolve()
 const requireEnabled=()=>{if(!enabled())throw Error('Storage capability is not enabled; enable its data/compute preset')}
 return {
  async status(){
   if(!enabled())return {enabled:false,buckets:[],orphans:[]}
   const index=storageIndex(read())
   return {enabled:true,buckets:await Promise.all(index.buckets.map(async row=>({...row,...await credentials.describe(refFor(row.id))}))),orphans:await Promise.all(index.orphans.map(async id=>({id,ref:refFor(id),...await credentials.describe(refFor(id))})))}
  },
  async resolve(endpoint,bucket){
   requireEnabled();const index=storageIndex(read())
   const row=index.buckets.find(r=>r.endpoint===endpoint&&r.bucket===bucket)??index.buckets.find(r=>r.endpoint===endpoint&&r.bucket==='*')
   if(!row)throw Error(`No storage token configured for ${endpoint} / ${bucket}`)
   const result=await credentials.resolve(refFor(row.id))
   if(!result?.value)throw Error(`Missing storage token: ${row.label} (${endpoint} / ${bucket})`)
   return result
  },
  async change(action,input){
   requireEnabled()
   if(!input || typeof input!=='object')throw Error('Storage input required')
   const task=pending.then(async()=>{
    if(action==='add'){
     const row={id:'b'+randomUUID().replaceAll('-',''),label:input.label,endpoint:input.endpoint,bucket:input.bucket}
     storageIndex({buckets:[row]})
     // Admit metadata first. A rejected secret write leaves a visible missing-token row.
     await update(current=>storageIndex({...current,buckets:[...storageIndex(current).buckets,row]}))
     return {id:row.id}
    }
    const index=storageIndex(read()),row=index.buckets.find(r=>r.id===input.id)
    if(action==='set-token'){
     if(!row)throw Error('Unknown storage bucket')
     if(typeof input.value!=='string'||!input.value.trim())throw Error(`Empty storage token: ${row.label}`)
     await credentials.set(refFor(row.id),input.value).catch(()=>{throw Error('Storage credential write failed')})
     return {saved:true}
    }
    if(action==='remove'){
     if(!row)throw Error('Unknown storage bucket')
     await update(current=>{const next=storageIndex(current);return {...next,buckets:next.buckets.filter(r=>r.id!==row.id),orphans:[...new Set([...next.orphans,row.id])]}})
     return {removed:true,cleanupRequired:true}
    }
    if(action==='cleanup'){
     if(!index.orphans.includes(input.id))throw Error('Unknown orphan storage credential')
     await credentials.unset(refFor(input.id)).catch(()=>{throw Error('Storage credential cleanup failed')})
     await update(current=>{const next=storageIndex(current);return {...next,orphans:next.orphans.filter(id=>id!==input.id)}})
     return {cleaned:true}
    }
    throw Error('Unknown storage action')
   })
   pending=task.catch(()=>{});return task
  },
 }
}
