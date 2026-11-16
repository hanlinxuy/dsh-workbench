import {randomUUID} from 'node:crypto'

export function createProbes({request,backends,buildPrompt,now=Date.now}){
 const previews=new Map(),jobs=new Map(),cache=new Map()
 const classify=(status)=>status===401?'unauthenticated':status===403?'auth':status===429?'rate_limited':status===404?'model_unknown':status===413?'input_too_large':'upstream_error'
 const reachability=async(backend,model,signal)=>{
  let source='live',listed=[];const started=now()
  const list=await request(backend,'models',{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])})
  if(list.ok){const data=await list.json();listed=Array.isArray(data.data)?data.data.map(m=>m.id):[]}
  else{await list.body?.cancel();source='declared';listed=(backends[backend].fallbackModels??[]).map(m=>typeof m==='string'?m:m.id)}
  const selected=model||listed[0]
  if(!selected)return {state:list.status===404?'unsupported':'empty',ok:false,source,requests:1,measuredAt:new Date(now()).toISOString()}
  const response=await request(backend,'chat/completions',{body:{model:selected,messages:[{role:'user',content:'Reply OK.'}],max_tokens:1,stream:false},signal:AbortSignal.any([signal,AbortSignal.timeout(40000)])})
  const status=response.status
  if(!response.ok){await response.body?.cancel();return {state:classify(status),ok:false,status,source,requests:2,model:selected,measuredAt:new Date(now()).toISOString()}}
  const result=await response.json(),text=result.choices?.[0]?.message?.content
  const verified=typeof text==='string'&&text.length>0
  return {state:verified?'live':'empty',ok:verified,status,source,model:selected,requests:2,durationMs:now()-started,measuredAt:new Date(now()).toISOString(),contextWindow:'unknown',modalities:{verified:verified?['text']:[],unverified:verified?[]:['text']}}
 }
 const snapshot=job=>({jobId:job.id,state:job.state,result:job.result})
 return {
  async run(input={}){
   const {operation='reachability',backend,model}=input
   if(['status','cancel'].includes(operation)){
    const job=jobs.get(input.jobId);if(!job)throw Error('Probe job not found')
    if(operation==='cancel'&&job.state==='running'){job.abort.abort();job.state='cancelled';job.result.partial=true}
    return snapshot(job)
   }
   if(!Object.hasOwn(backends,backend)||typeof model!=='string')throw Error('Choose backend and model')
   const key=JSON.stringify([backends[backend].baseURL,model,operation==='reachability'?'reachability':'capability'])
   if(operation==='reachability'){
    const previous=cache.get(key)
    if(!input.force&&previous&&previous.expires>now())return {...previous.result,cached:true}
    const result=await reachability(backend,model,new AbortController().signal).catch(error=>({state:/Missing credential reference/.test(error.message)?'no-account':/Login failed|Update credentials/.test(error.message)?'login-failed':error.name==='TimeoutError'?'timeout':'unreachable',ok:false,source:'unknown',measuredAt:new Date(now()).toISOString(),hint:'Check configured account references, proxy and trusted CA; no credentials are included in this result.'}))
    cache.set(key,{result,expires:now()+120000});return result
   }
   if(operation==='preview'){
    const declared=input.declaredTokens
    if(!Number.isInteger(declared)||declared<1024||declared>1048576)throw Error('Declared token budget must be 1024..1048576')
    const sizes=[128,declared,Math.floor(declared*.75)],id=randomUUID()
    previews.clear();previews.set(id,{backend,model,declared,sizes,expires:now()+300000})
    return {previewId:id,requests:3,estimatedInputTokens:sizes.reduce((a,b)=>a+b,0),declaredTokens:declared,tokenCountExact:!!buildPrompt,message:'Manual capability test; up to three requests. Estimates are not measured context limits.'}
   }
   if(operation!=='start'||input.confirm!==true)throw Error('Capability testing requires an explicit confirmed preview')
   const preview=previews.get(input.previewId)
   if(!preview||preview.backend!==backend||preview.model!==model||preview.expires<now())throw Error('Probe preview expired or target changed')
   previews.delete(input.previewId)
   const previous=cache.get(key)
   if(!input.force&&previous&&previous.expires>now())return {state:'completed',result:previous.result,cached:true}
   if(input.declaredModalities!==undefined&&(!Array.isArray(input.declaredModalities)||input.declaredModalities.some(m=>!['text','image','audio','video'].includes(m))))throw Error('Invalid declared modalities')
   const job={id:randomUUID(),abort:new AbortController(),state:'running',result:{model,source:'measured',measuredAt:new Date(now()).toISOString(),requests:0,partial:false,steps:[],contextWindow:{declared:preview.declared,measured:{acceptedMax:'unknown',capped:'unknown'}},modalities:{declared:input.declaredModalities??['text'],verified:[],unverified:input.declaredModalities??['text']}}}
   jobs.set(job.id,job)
   void (async()=>{
    for(const size of preview.sizes){
     job.abort.signal.throwIfAborted()
     const marker=randomUUID(),built=buildPrompt?await buildPrompt(size,marker):{messages:[{role:'user',content:`Return this marker exactly: ${marker}\n${' x'.repeat(size)}\nReturn the marker from the beginning.`}]}
     const response=await request(backend,'chat/completions',{body:{model,messages:built.messages,max_tokens:64,stream:false},signal:AbortSignal.any([job.abort.signal,AbortSignal.timeout(120000)]),source:'background'})
     job.result.requests++
     const step={requestedTokens:size,status:response.status,verified:false}
     if(!response.ok){await response.body?.cancel();step.error=classify(response.status);if(response.status===413)job.result.contextWindow.measured.capped=true;job.result.steps.push(step);if([401,403,404,429].includes(response.status)){job.result.remainingRequests=preview.sizes.length-job.result.requests;job.result.partial=true;break}continue}
     const result=await response.json(),text=result.choices?.[0]?.message?.content??'',observed=result.usage?.prompt_tokens
     step.verified=text.includes(built.verificationText??marker)
     step.observedPromptTokens=Number.isSafeInteger(observed)?observed:'unknown'
     if(step.verified){
      job.result.modalities.verified=['text'];job.result.modalities.unverified=job.result.modalities.declared.filter(m=>m!=='text')
      if(Number.isSafeInteger(observed))job.result.contextWindow.measured.acceptedMax=Math.max(typeof job.result.contextWindow.measured.acceptedMax==='number'?job.result.contextWindow.measured.acceptedMax:0,observed)
     }
     if(Number.isSafeInteger(built.expectedPromptTokens)&&Number.isSafeInteger(observed)&&job.result.contextWindow.measured.capped!==true)job.result.contextWindow.measured.capped=observed<built.expectedPromptTokens
     job.result.steps.push(step)
     if(size===preview.declared&&step.verified)break
    }
    if(job.state!=='cancelled'){job.state='completed';cache.set(key,{result:job.result,expires:now()+86400000})}
   })().catch(error=>{job.state=job.abort.signal.aborted?'cancelled':'failed';job.result.partial=true;job.result.error=job.abort.signal.aborted?'cancelled':error.name==='TimeoutError'?'timeout':'unreachable';job.result.remainingRequests=preview.sizes.length-job.result.requests})
   return snapshot(job)
  },
  close(){for(const job of jobs.values())job.abort.abort();previews.clear()},
 }
}
