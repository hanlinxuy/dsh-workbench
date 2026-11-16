import {readFile} from 'node:fs/promises'

// The index is a disposable local artifact built separately from queries.
export function createKnowledge({index,maxAgeDays=30,topK=5,fallbackSources=[]}) {
 if(typeof index!=='string'||!index||!Number.isFinite(maxAgeDays)||maxAgeDays<=0||!Number.isInteger(topK)||topK<1||topK>20||!Array.isArray(fallbackSources))throw Error('Invalid knowledge configuration')
 return async({action,query,id})=>{
  if(!['search','read'].includes(action))throw Error('Knowledge action must be search or read')
  if(action==='search'&&(typeof query!=='string'||!query.trim()))throw Error('Search query required')
  if(action==='read'&&(typeof id!=='string'||!id))throw Error('Knowledge id required')
  const fallback={fallbackSources,message:'索引不可用；请回到这些来源查证，不要凭印象回答。'}
  let documents
  try{
   const parsed=JSON.parse(await readFile(index,'utf8'))
   if(parsed.version!==1||!Array.isArray(parsed.documents))throw Error('Invalid index')
   const ids=new Set()
   for(const d of parsed.documents){
    if(!d||typeof d.id!=='string'||!d.id||ids.has(d.id)||typeof d.body!=='string'||typeof d.title!=='string'||typeof d.sourceRef!=='string'||!d.sourceRef||!Number.isFinite(Date.parse(d.indexedAt)))throw Error('Invalid index entry')
    ids.add(d.id)
   }
   documents=parsed.documents
  }catch{return {status:'unavailable',...fallback}}
  const terms=action==='search'?query.toLocaleLowerCase().trim().split(/\s+/):[]
  const hits=action==='read'?documents.filter(d=>d.id===id):documents.map(d=>({d,score:terms.reduce((n,t)=>n+(`${d.title}\n${d.body}`.toLocaleLowerCase().includes(t)?1:0),0)})).filter(r=>r.score===terms.length).sort((a,b)=>b.score-a.score||a.d.id.localeCompare(b.d.id)).slice(0,topK).map(r=>r.d)
  if(!hits.length)return {status:'no-hit',message:'未命中；请回源查证或询问用户，不要编造。',fallbackSources}
  return {status:'hit',documents:hits.map(d=>({...d,stale:Date.now()-Date.parse(d.indexedAt)>maxAgeDays*86400000})),message:'正文来自本地索引；stale=true 表示可能落后，请回源核对。',fallbackSources}
 }
}
