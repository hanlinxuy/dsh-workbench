// Reference protocols, not a claim about any company's SSO endpoint.
export function createJSONLogin({url,accountRef,passwordRef,ttlMs=600000,request=fetch}){
 const endpoint=new URL(url)
 if(endpoint.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(endpoint.hostname))throw Error('SSO endpoint requires HTTPS')
 if(!accountRef||!passwordRef||!Number.isFinite(ttlMs)||ttlMs<=0)throw Error('Configure SSO credential references and positive TTL')
 return async({credentials,signal})=>{
  signal?.throwIfAborted()
  const account=await credentials.get(accountRef),password=await credentials.get(passwordRef)
  if(!account||!password)throw Error('sso_missing_credentials: update configured credential references')
  const response=await request(endpoint,{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json'},body:JSON.stringify({username:account,password})})
  if(!response.ok){await response.body?.cancel();throw Error(`sso_rejected: HTTP ${response.status}`)}
  const data=await response.json()
  if(typeof data.access_token!=='string'||!data.access_token)throw Error('sso_invalid_response: missing access_token')
  return {token:data.access_token,ttlMs}
 }
}

// Local credential references only. This adapter never publishes credentials.
export function createCredentialPool({entries,credentials}){
 if(!Array.isArray(entries)||entries.some(e=>!e.backend||!e.account||!e.tokenRef||!e.tenantKeyRef||!Array.isArray(e.models)))throw Error('Configure pool backend/account/model list and both credential references')
 return {
  list(){return entries.map(({account,team,models})=>({account,team,models,key_source:'push',state:'configured',left_s:null}))},
  async borrow(backend,model,signal){
   signal?.throwIfAborted()
   const entry=entries.find(e=>e.backend===backend&&e.models.includes(model))
   if(!entry)return undefined
   const token=await credentials.get(entry.tokenRef),tenant=await credentials.get(entry.tenantKeyRef)
   signal?.throwIfAborted()
   if(!token||!tenant)return {key_source:'none',error:'missing-dual-credentials'}
   return {key_source:'push',headers:{'x-auth-token':token,authorization:`Bearer ${tenant}`}}
  },
 }
}
