import {setTimeout as delay} from 'node:timers/promises'

// One scheduler per account quota. Separate backend routes can share an accountKey.
export function createScheduler({requestsPerMinute=40,interactiveReserve=0.3,queueTimeoutMs=30000,now=Date.now,sleep=(ms,signal)=>delay(ms,undefined,{signal})}={}) {
 if(!(requestsPerMinute>0)||!(interactiveReserve>=0&&interactiveReserve<1)||!(queueTimeoutMs>0))throw Error('Invalid gateway queue limits')
 const queues={interactive:[],background:[]},stats={interactive:{admitted:0,cancelled:0,timeouts:0,totalWaitMs:0},background:{admitted:0,cancelled:0,timeouts:0,totalWaitMs:0}}
 const interval=60000/requestsPerMinute,backgroundInterval=interval/(1-interactiveReserve)
 let next=0,nextBackground=0,backoffUntil=0,worker,waiting,closed=false,interactiveTurns=0
 const wake=()=>waiting?.abort()
 const pump=()=>{
  if(worker)return
  worker=(async()=>{
   while(!closed&&(queues.interactive.length||queues.background.length)){
    const time=now()
    for(const kind of ['interactive','background'])for(const item of [...queues[kind]])if(item.deadline<=time){queues[kind].splice(queues[kind].indexOf(item),1);item.cleanup();stats[kind].timeouts++;item.reject(Error('queue_timeout'))}
    if(!queues.interactive.length&&!queues.background.length)break
    const backgroundReady=queues.background.length&&time>=nextBackground
    const kind=queues.interactive.length&&(!backgroundReady||interactiveTurns<2)?'interactive':'background'
    const due=Math.max(next,backoffUntil,kind==='background'?nextBackground:0)
    if(time<due){
     waiting=new AbortController()
     const deadline=Math.min(...Object.values(queues).flat().map(item=>item.deadline))
     await sleep(Math.max(0,Math.min(due,deadline)-time),waiting.signal).catch(error=>{if(!waiting.signal.aborted)throw error})
     waiting=undefined;continue
    }
    const item=queues[kind].shift();item.cleanup()
    if(item.signal?.aborted){stats[kind].cancelled++;item.reject(item.signal.reason);continue}
    next=now()+interval
    if(kind==='background'){nextBackground=now()+backgroundInterval;interactiveTurns=0}else interactiveTurns++
    stats[kind].admitted++;stats[kind].totalWaitMs+=now()-item.queuedAt
    item.resolve({waitMs:now()-item.queuedAt})
   }
  })().catch(error=>{for(const queue of Object.values(queues))for(const item of queue.splice(0)){item.cleanup();item.reject(error)}}).finally(()=>{worker=undefined;if(!closed&&(queues.interactive.length||queues.background.length))pump()})
 }
 return {
  acquire(source='interactive',signal){
   if(!Object.hasOwn(queues,source))return Promise.reject(Error('Unknown gateway request source'))
   if(closed)return Promise.reject(Error('Gateway queue closed'))
   if(signal?.aborted)return Promise.reject(signal.reason)
   return new Promise((resolve,reject)=>{
    const item={resolve,reject,signal,queuedAt:now(),deadline:now()+queueTimeoutMs,cleanup:()=>signal?.removeEventListener('abort',cancel)}
    const cancel=()=>{const index=queues[source].indexOf(item);if(index<0)return;queues[source].splice(index,1);item.cleanup();stats[source].cancelled++;reject(signal.reason);wake()}
    queues[source].push(item);signal?.addEventListener('abort',cancel,{once:true});wake();pump()
   })
  },
  backoff(ms){if(Number.isFinite(ms)){backoffUntil=Math.max(backoffUntil,now()+Math.max(0,ms));wake()}},
  metrics(){return {backoffMs:Math.max(0,backoffUntil-now()),sources:Object.fromEntries(Object.entries(queues).map(([kind,items])=>[kind,{...stats[kind],queued:items.length,oldestWaitMs:items.length?now()-items[0].queuedAt:0,averageWaitMs:stats[kind].admitted?stats[kind].totalWaitMs/stats[kind].admitted:0}]))}},
  close(){closed=true;wake();for(const queue of Object.values(queues))for(const item of queue.splice(0)){item.cleanup();item.reject(Error('Gateway queue closed'))}},
 }
}
