// Service definitions are operator-owned. Tools never supply credential refs.
export function createCredentialCatalog(services, credentials, enabledPresets = []) {
 if(!Array.isArray(services))throw Error('Credential services must be an array')
 const refs=new Map(),ids=new Set()
 const catalog=services.map(service=>{
  if(!service || !/^[a-z][a-z0-9-]*$/.test(service.id) || ids.has(service.id) || typeof service.title!=='string' || !['identity','code','model','storage','patent'].includes(service.domain) || !Array.isArray(service.fields))throw Error('Invalid or duplicate credential service')
  ids.add(service.id)
  const keys=new Set()
  const fields=service.fields.map(field=>{
   if(!field || typeof field.key!=='string' || keys.has(field.key) || !/^[A-Z_][A-Z0-9_]*$/.test(field.ref) || refs.has(field.ref) || typeof field.secret!=='boolean')throw Error(`Invalid or shared credential ref in ${service.id}`)
   keys.add(field.key);refs.set(field.ref,{service:service.id,domain:service.domain})
   return {key:field.key,ref:field.ref,secret:field.secret,label:field.label??field.key,optional:field.optional===true}
  })
  let proxy
  if(service.proxy){
   if(service.domain!=='identity')throw Error('Only an identity service may derive proxy authentication')
   const url=new URL(service.proxy.url)
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Proxy URL must contain only its protocol, host and port')
   const accountKey=service.proxy.accountKey??'employeeId',passwordKey=service.proxy.passwordKey??'password',passwordOverrideKey=service.proxy.passwordOverrideKey??'proxyPassword'
   if(!keys.has(accountKey)||!keys.has(passwordKey))throw Error(`Proxy identity fields missing in ${service.id}`)
   const noProxy=service.proxy.noProxy??[]
   if(!Array.isArray(noProxy)||noProxy.some(host=>typeof host!=='string'||!host||/[\s/:@]/.test(host)))throw Error('noProxy must be a list of hostnames or dot-prefixed domains')
   proxy={url:url.href,accountKey,passwordKey,passwordOverrideKey,noProxy}
  }
  const preset=service.preset??({identity:'intranet-core',code:'intranet-core',model:'intranet-core',storage:'data-compute',patent:'patent'}[service.domain])
  return {id:service.id,title:service.title,domain:service.domain,preset,fields,...(proxy?{proxy}:{})}
 })
 const allowed=ref=>{if(!refs.has(ref))throw Error('unauthorized: reference is not in the credential catalog')}
 return {
  async status(){return Promise.all(catalog.filter(s=>!s.preset || enabledPresets.includes(s.preset)).map(async service=>{
   const fields=await Promise.all(service.fields.map(async field=>({...field,...await credentials.describe(field.ref)})))
   if(!service.proxy)return {...service,fields}
   const {proxy,...metadata}=service,account=service.fields.find(f=>f.key===proxy.accountKey)
   const value=account.secret?undefined:(await credentials.resolve(account.ref).catch(()=>undefined))?.value
   const url=new URL(proxy.url)
   return {...metadata,fields,proxyDescription:`代理将使用 ${value??account.ref}@${url.host}`,noProxy:proxy.noProxy}
  }))},
  async resolve(ref){
   allowed(ref)
   const record=await credentials.resolve(ref).catch(()=>{throw Error(`unauthorized: ${ref}`)})
   if(!record)throw Error(`missing: ${ref}`)
   if(!record.value?.trim())throw Error(`empty: ${ref}`)
   if(/^(?:your[-_ ]|replace[-_ ]|<[^>]+>$|\$\{)/i.test(record.value))throw Error(`placeholder: ${ref}`)
   return record
  },
  async resolveService(id){
   const service=catalog.find(s=>s.id===id)
   if(!service)throw Error('Unknown credential service')
   if(service.preset&&!enabledPresets.includes(service.preset))throw Error(`Capability not enabled: ${service.preset}`)
   const entries=await Promise.all(service.fields.map(async field=>{
    const optional=field.optional||field.key===service.proxy?.passwordOverrideKey
    if(optional&&!(await credentials.describe(field.ref)).configured)return undefined
    return [field.key,(await this.resolve(field.ref)).value]
   }))
   return Object.fromEntries(entries.filter(Boolean))
  },
  async deriveProxy(id,target){
   const service=catalog.find(s=>s.id===id)
   if(!service?.proxy)throw Error('Identity proxy is not configured')
   if(service.preset&&!enabledPresets.includes(service.preset))throw Error(`Capability not enabled: ${service.preset}`)
   const host=new URL(target).hostname.toLowerCase(),proxy=service.proxy
   if(proxy.noProxy.some(rule=>rule==='*'||host===rule.replace(/^\./,'').toLowerCase()||rule.startsWith('.')&&host.endsWith(rule.toLowerCase())))return {direct:true}
   const field=key=>service.fields.find(f=>f.key===key)
   const account=await this.resolve(field(proxy.accountKey).ref),override=field(proxy.passwordOverrideKey)
   const overridden=override && (await credentials.describe(override.ref)).configured
   const password=await this.resolve(field(overridden?proxy.passwordOverrideKey:proxy.passwordKey).ref)
   const url=new URL(proxy.url);url.username=account.value;url.password=password.value
   // Only trusted adapters receive this transient URL; no UI/HTTP action exposes it.
   return {direct:false,url:url.href}
  },
  async set(ref,value){allowed(ref);if(typeof value!=='string'||!value.trim())throw Error(`empty: ${ref}`);await credentials.set(ref,value).catch(()=>{throw Error(`unauthorized: cannot write ${ref}`)});return credentials.describe(ref)},
  async unset(ref){allowed(ref);await credentials.unset(ref);return credentials.describe(ref)},
  async reveal(ref){return (await this.resolve(ref)).value},
 }
}
