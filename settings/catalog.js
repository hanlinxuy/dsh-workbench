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
   return {key:field.key,ref:field.ref,secret:field.secret,label:field.label??field.key}
  })
  return {id:service.id,title:service.title,domain:service.domain,preset:service.preset,fields}
 })
 const allowed=ref=>{if(!refs.has(ref))throw Error('unauthorized: reference is not in the credential catalog')}
 return {
  async status(){return Promise.all(catalog.filter(s=>!s.preset || enabledPresets.includes(s.preset)).map(async service=>({...service,fields:await Promise.all(service.fields.map(async field=>({...field,...await credentials.describe(field.ref)})))})))},
  async resolve(ref){
   allowed(ref)
   const record=await credentials.resolve(ref).catch(()=>{throw Error(`unauthorized: ${ref}`)})
   if(!record)throw Error(`missing: ${ref}`)
   if(!record.value?.trim())throw Error(`empty: ${ref}`)
   if(/^(?:your[-_ ]|replace[-_ ]|<[^>]+>$|\$\{)/i.test(record.value))throw Error(`placeholder: ${ref}`)
   return record
  },
  async set(ref,value){allowed(ref);if(typeof value!=='string'||!value.trim())throw Error(`empty: ${ref}`);await credentials.set(ref,value).catch(()=>{throw Error(`unauthorized: cannot write ${ref}`)});return credentials.describe(ref)},
  async unset(ref){allowed(ref);await credentials.unset(ref);return credentials.describe(ref)},
  async reveal(ref){return (await this.resolve(ref)).value},
 }
}
