import {createHash} from 'node:crypto'
import {mkdir,appendFile} from 'node:fs/promises'
import {join} from 'node:path'

export async function approveEgress({target,payload,exec,controller,approval,internalDomains=[],auditDirectory}){
 if(!exec?.agent||!controller||!approval)throw Error('egress_not_confirmed: a foreground session and native approval are required')
 const text=JSON.stringify(payload)
 if(/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|cookie)\s*[:=]|\b(?:password|passwd|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"']+/i.test(text))throw Error('egress_denied: content resembles credentials; remove it before publishing')
 const domains=[...internalDomains,'.internal','.corp','.intranet']
 for(const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){
  const host=new URL(match[0]).hostname
  if(domains.some(d=>host===d.replace(/^\./,'')||d.startsWith('.')&&host.endsWith(d)))throw Error('egress_denied: internal address in content')
 }
 const page=await controller.events({address:{kind:'session',sessionId:exec.agent.id},maxMessages:200},exec.signal)
 let origin
 for(const {event} of [...page.records].reverse()){
  if(event.type==='user/message'&&['user','rpc','automation'].includes(event.data.source?.kind)){origin=event;break}
  if(event.type==='turn/start')break
 }
 if(origin?.data.source.kind!=='user')throw Error('egress_denied: background or unverified-origin sessions cannot publish externally')
 const destination=new URL(target)
 const fingerprint=createHash('sha256').update(text).digest('hex')
 const summary=text.length>1200?text.slice(0,900)+' … '+text.slice(-250):text
 const classification=payload.kind==='image'?'Image content is unverified. Review the displayed local image path before approving.':'Issue/comment text; no detected credentials/internal URLs. This scan is not a guarantee of public suitability.'
 const decision=await approval.request({agent:exec.agent,toolName:payload.kind==='image'?'workbench_vision':'workbench_git_issue',callId:exec.callId,signal:exec.signal,reason:`Publish externally to ${destination.origin}${destination.pathname}\nClassification: ${classification}\nPayload metadata/text (${text.length} chars, SHA256 ${fingerprint}):\n${summary}\nApproval applies only to this request.`})
 if(decision!=='allowed-once')throw Error(`egress_not_confirmed: ${decision}`)
 await mkdir(auditDirectory,{recursive:true,mode:0o700})
 await appendFile(join(auditDirectory,'egress.ndjson'),JSON.stringify({at:new Date().toISOString(),host:destination.host,path:destination.pathname,fingerprint,sessionId:exec.agent.id,sourceSeq:origin.seq,decision:'allowed-once'})+'\n',{mode:0o600})
 return {fingerprint}
}
