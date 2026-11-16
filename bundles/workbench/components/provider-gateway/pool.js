// Optional reference adapter. All credentials are short-lived and memory-only.
export function createMemoryPool({now=Date.now,teamKey,maxTTLSeconds=1200}={}) {
 const entries=new Map();let enabled=false
 const live=()=>{for(const [id,row] of entries)if(row.expires<=now())entries.delete(id);return [...entries.values()]}
 const metadata=row=>({account:row.account,team:row.team,key_source:row.key_source,left_s:Math.max(0,Math.floor((row.expires-now())/1000)),models:row.models,state:row.tenantKey?'ready':'missing-tenant-key',uses:row.uses,warning:row.key_source==='push'?undefined:row.key_source==='team'?'Tenant key supplied by node team; usage is charged to that team':'Missing tenant key; this entry cannot call upstream'})
 return {
  setLending(value){if(typeof value!=='boolean')throw Error('Explicit lending choice required');enabled=value;if(!enabled)entries.clear();return {enabled,entries:entries.size}},
  publish({account,team,backend,models,token,tenantKey,ttlSeconds}){
   if(!enabled)throw Error('Lending is disabled; enable explicitly before publishing')
   if(![account,team,backend,token].every(v=>typeof v==='string'&&v)||!Array.isArray(models)||models.some(m=>typeof m!=='string')||!Number.isFinite(ttlSeconds)||ttlSeconds<=0||ttlSeconds>maxTTLSeconds)throw Error('Invalid pool entry or TTL')
   if(tenantKey!==undefined&&(typeof tenantKey!=='string'||!tenantKey))throw Error('Invalid tenant key')
   const key=tenantKey??teamKey,key_source=tenantKey?'push':teamKey?'team':'none'
   const row={account,team,backend,models:[...models],token,tenantKey:key,key_source,expires:now()+ttlSeconds*1000,uses:0}
   entries.set(JSON.stringify([backend,account]),row)
   return {...metadata(row),enabled,entries:live().filter(r=>r.account===account).length}
  },
  list(){return live().map(metadata)},
  borrow(backend,model,signal){
   signal?.throwIfAborted()
   if(!enabled)return undefined
   const row=live().find(r=>r.backend===backend&&r.models.includes(model))
   if(!row)return undefined
   const result=metadata(row)
   if(!row.tenantKey)return {...result,error:'missing-tenant-key'}
   row.uses++
   return {...result,headers:{'x-auth-token':row.token,authorization:`Bearer ${row.tenantKey}`}}
  },
  close(){enabled=false;entries.clear()},
 }
}
