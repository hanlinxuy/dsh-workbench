// Cooperative capability ownership. Native tool admission uses this same decision.
export function createCapabilities({owners={},budget=16000,mode='warn'}={},definitions){
 if(!owners||typeof owners!=='object'||Array.isArray(owners)||Object.entries(owners).some(([domain,row])=>!domain||!row||typeof row.providedBy!=='string'||!row.providedBy))throw Error('capabilities.owners requires domain: {providedBy: plugin-id}')
 if(!Number.isInteger(budget)||budget<1||!['warn','block'].includes(mode))throw Error('Invalid tool description budget or mode')
 const providers=new Map()
 const service={
  register({domain,plugin,tools=[],label=domain}){
   if(typeof domain!=='string'||!domain||typeof plugin!=='string'||!plugin||!Array.isArray(tools)||tools.some(t=>typeof t!=='string'))throw Error('Invalid capability declaration')
   const key=`${domain}:${plugin}`
   if(providers.has(key))throw Error(`Duplicate capability declaration: ${key}`)
   const record={domain,plugin,tools,label};providers.set(key,record)
   return ()=>{if(providers.get(key)===record)providers.delete(key)}
  },
  allows(domain,plugin){return !owners[domain]||owners[domain].providedBy===plugin},
  assert(domain,plugin){if(!service.allows(domain,plugin))throw Error(`Capability ${domain} is provided by ${owners[domain].providedBy}`)},
  status(scope,toolSet){
   const rows=definitions(scope,toolSet).map(t=>({name:t.name,characters:t.description?.length??0}))
   const total=rows.reduce((n,t)=>n+t.characters,0),declared=[...providers.values()]
   const domains=[...new Set([...Object.keys(owners),...declared.map(p=>p.domain)])].map(domain=>{
    const candidates=declared.filter(p=>p.domain===domain),selected=owners[domain]?.providedBy
    const active=candidates.filter(p=>service.allows(domain,p.plugin))
    return {domain,providedBy:selected??(active.length===1?active[0].plugin:undefined),providers:candidates.map(p=>({...p,enabled:service.allows(domain,p.plugin)})),conflict:active.length>1,missing:!!selected&&!candidates.some(p=>p.plugin===selected)}
   })
   return {budget,mode,total,exceeded:total>budget,tools:rows,domains,undeclared:rows.filter(t=>!declared.some(p=>p.tools.includes(t.name))).map(t=>t.name)}
  },
  check(scope,toolSet){const state=service.status(scope,toolSet);if(mode==='block'&&state.exceeded)throw Error(`Tool description budget exceeded: ${state.total}/${budget}; disable duplicate tools in Workbench settings`);return state},
 }
 return service
}
