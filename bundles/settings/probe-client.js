import {createElement as h,useState,useEffect} from 'react'
export function CapabilityProbe({call,backend,model}){
 const [tokens,setTokens]=useState(128000),[preview,setPreview]=useState(),[job,setJob]=useState(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  if(!job?.jobId||job.state!=='running')return
  let stopped=false
  const timer=setInterval(()=>{void call('probe',{operation:'status',jobId:job.jobId}).then(result=>{if(!stopped)setJob(result)},e=>{if(!stopped)setError(e.message)})},1000)
  return ()=>{stopped=true;clearInterval(timer)}
 },[job?.jobId,job?.state])
 const run=async input=>{setBusy(true);setError('');try{const result=await call('probe',{backend,model,...input});if(input.operation==='preview')setPreview(result);else{setJob(result);setPreview(undefined)}}catch(e){setError(e.message)}finally{setBusy(false)}}
 return h('details',null,h('summary',null,'能力探测（可选，消耗更多额度）'),h('p',null,'最多三次请求，含长输入；未验证的模态和上限保持 unknown，不修改模型配置。'),
 h('label',null,'声明的上下文 token 数 ',h('input',{type:'number',min:1024,max:1048576,value:tokens,disabled:busy||job?.state==='running',onChange:e=>{setTokens(Number(e.target.value));setPreview(undefined)}})),
 h('button',{disabled:busy||!backend||!model||job?.state==='running',onClick:()=>run({operation:'preview',declaredTokens:tokens})},'预览成本'),
 preview&&h('div',null,h('p',null,`最多 ${preview.requests} 次请求，预计 ${preview.estimatedInputTokens.toLocaleString()} 输入 token。估计不等于实测。`),h('button',{disabled:busy,onClick:()=>run({operation:'start',confirm:true,previewId:preview.previewId})},'确认发送'),h('button',{onClick:()=>setPreview(undefined)},'取消预览')),
 job?.state==='running'&&h('button',{disabled:busy,onClick:()=>run({operation:'cancel',jobId:job.jobId})},'停止探测'),
 job&&h('div',{role:'status'},h('p',null,`${job.state}${job.cached?' · 缓存结果':''} · ${job.result?.requests??0} 次请求${job.result?.partial?' · 保留部分结果':''}`),h('pre',{style:{whiteSpace:'pre-wrap',fontSize:12}},JSON.stringify(job.result,null,2))),error&&h('p',{role:'alert'},error))
}
