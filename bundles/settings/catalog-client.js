import {StoragePanel} from './storage-client.js'
import {createElement as h,useState,useEffect} from 'react'
function CredentialReveal({credentialRef,call,disabled}){
 const [value,setValue]=useState(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  if(value===undefined)return
  const clear=()=>setValue(undefined),timer=setTimeout(clear,20000)
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear)
  return ()=>{clearTimeout(timer);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear)}
 },[value])
 return h('span',null,h('button',{disabled:disabled||busy,onClick:async()=>{if(value!==undefined){setValue(undefined);return}setBusy(true);setError('');try{const revealed=await call('reveal',{ref:credentialRef});if(document.visibilityState==='visible'&&document.hasFocus())setValue(revealed)}catch(e){setError(e.message)}finally{setBusy(false)}}},value===undefined?'查看 20 秒':'隐藏'),value!==undefined&&h('output',{style:{display:'block',overflowWrap:'anywhere'}},value),error&&h('small',{role:'alert'},error))
}
export function CredentialCatalogPanel(){
 const [services,setServices]=useState([]),[draft,setDraft]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const call=async(action,input)=>{const r=await fetch('api/workbench-credentials',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action,...input})});const data=await r.json();if(!data.ok){const hints={missing:'尚未填写，请保存凭据。',placeholder:'当前是占位符，请填写真实值。',empty:'内容为空，请重新填写。',unauthorized:'当前引用或调用权限不允许，请检查配置。'};throw Error((hints[data.error.reason]??'')+' '+data.error.message)}return data.value}
 const refresh=()=>call('status').then(setServices).catch(e=>setError(e.message))
 useEffect(()=>{void refresh()},[])
 const change=async(action,ref)=>{setBusy(true);setError('');try{await call(action,{ref,value:draft[ref]});setDraft({...draft,[ref]:''});await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const groups={identity:'身份',code:'代码平台',model:'模型网关',storage:'存储服务',patent:'专利检索'}
 return h('section',{style:{maxWidth:720}},h('h2',null,'服务凭据'),h('p',null,'凭据保存在 DSH 本机凭据库中。默认只显示保存状态；查看单项后 20 秒或切走即隐藏。'),error&&h('p',{role:'alert'},error),
 ...Object.entries(groups).flatMap(([domain,label])=>{
  const rows=services.filter(s=>s.domain===domain)
  if(!rows.length)return []
  return [h('h3',{key:domain},label),...rows.map(service=>h('fieldset',{key:service.id,style:{border:'1px solid #555',borderRadius:12,marginBottom:16,padding:16}},h('legend',null,service.title),service.proxyDescription&&h('p',null,service.proxyDescription),
   ...service.fields.map(field=>h('div',{key:field.ref,style:{margin:'12px 0'}},h('label',null,field.label,h('input',{type:field.secret?'password':'text',autoComplete:field.secret?'new-password':'off',value:draft[field.ref]??'',placeholder:field.configured?'已保存，留空保留':'未填写',disabled:busy||!field.writable,onChange:e=>setDraft({...draft,[field.ref]:e.target.value}),style:{display:'block',width:'100%',padding:8,margin:'6px 0',background:'transparent',color:'inherit',border:'1px solid #666',borderRadius:6}})),h('small',null,`${field.configured?'已保存':'未填写'} · ${field.source??'无来源'}${field.writable?'':' · 只读'}`),h('button',{disabled:busy||!field.writable||!draft[field.ref],onClick:()=>change('set',field.ref)},'保存'),h('button',{disabled:busy||!field.writable||!field.configured,onClick:()=>change('unset',field.ref)},'清除'),h(CredentialReveal,{credentialRef:field.ref,call,disabled:busy||!field.configured})))))]
 }),!services.length&&h('p',null,'尚未配置服务目录；由内网适配器声明所需字段和启用的能力。'),h(StoragePanel))
}
