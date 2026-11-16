import {createHash} from 'node:crypto'

export async function authorizeMerge({mode='user-confirmed',authorization,actual,sessionId,controller,reviewer,signal}) {
 if(!authorization||authorization.mode!==mode)throw Error(`not_confirmed: operator-selected merge authorization is ${mode}`)
 if(mode==='auto-reviewed'){
  if(!reviewer?.verify||typeof authorization.reviewId!=='string')throw Error('not_confirmed: a trusted subagent review adapter and reviewId are required')
  const evidence=await reviewer.verify({reviewId:authorization.reviewId,sessionId,sha:actual.sha,targetBranch:actual.target_branch,iid:actual.iid,signal})
  if(!evidence?.approved||evidence.sha!==actual.sha||evidence.targetBranch!==actual.target_branch||evidence.checksPassed!==true||typeof evidence.reviewer!=='string'||!evidence.reviewer)throw Error('not_confirmed: review evidence does not approve this head and target')
  return {mode,reviewer:evidence.reviewer,reviewId:authorization.reviewId,sha:actual.sha}
 }
 if(mode!=='user-confirmed')throw Error('Unsupported merge authorization mode')
 if(!sessionId||!controller||!Number.isSafeInteger(authorization.sourceSeq)||typeof authorization.quote!=='string'||!authorization.quote.trim())throw Error('not_confirmed: quote and sourceSeq from a human message in this session are required')
 let records
 if(controller.events){const page=await controller.events({address:{kind:'session',sessionId},throughSeq:authorization.sourceSeq,maxMessages:1},signal);records=page.records.map(r=>r.event)}
 else records=(await controller.inspect(sessionId,signal)).events
 const message=records.find(e=>e.seq===authorization.sourceSeq&&e.type==='user/message'&&e.data.source?.kind==='user')
 const text=message?.data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')
 if(!text?.includes(authorization.quote))throw Error('not_confirmed: quoted approval was not found in the human session history')
 return {mode,sessionId,sourceSeq:authorization.sourceSeq,quoteHash:createHash('sha256').update(authorization.quote).digest('hex'),sha:actual.sha}
}
