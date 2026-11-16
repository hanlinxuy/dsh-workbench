import {createElement as h,useEffect,useState} from 'react'
export function StoragePanel(){
 const [data,setData]=useState(),[draft,setDraft]=useState({label:'',endpoint:'',bucket:''}),[tokens,setTokens]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const call=async(action,input)=>{const response=await fetch('api/workbench-storage',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,input})});const result=await response.json();if(!result.ok)throw Error(result.error.message);return result.value}
 const refresh=()=>call('status').then(setData).catch(e=>setError(e.message))
 useEffect(()=>{void refresh()},[])
 const run=async(action,input)=>{setBusy(true);setError('');try{await call(action,input);setTokens({});if(action==='add')setDraft({label:'',endpoint:'',bucket:''});await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const style={padding:8,borderRadius:7,border:'1px solid #666',background:'transparent',color:'inherit'}
 const button=(text,action,input)=>h('button',{type:'button',disabled:busy,onClick:()=>run(action,input),style},text)
 if(!data?.enabled)return error?h('p',{role:'alert'},error):null
 return h('section',{'aria-label':'对象存储凭据',style:{marginTop:24}},h('h3',null,'对象存储'),h('p',null,'每个端点和桶独立保存 Token。桶名 * 表示该端点的显式默认。'),error&&h('p',{role:'alert'},error),
 ...data.buckets.map(row=>h('fieldset',{key:row.id,style:{...style,marginBottom:12}},h('legend',null,row.label),h('p',null,`${row.endpoint} · ${row.bucket}`),h('p',{role:'status'},row.configured?'Token 已保存':'Token 未填写'),h('label',null,'Token',h('input',{type:'password',autoComplete:'off',value:tokens[row.id]??'',placeholder:row.configured?'已保存，留空保留':'输入 Token',disabled:busy||!row.writable,onChange:e=>setTokens({...tokens,[row.id]:e.target.value}),style})),h('button',{type:'button',disabled:busy||!row.writable||!tokens[row.id],onClick:()=>run('set-token',{id:row.id,value:tokens[row.id]}),style},'保存 Token'),button('移除桶（保留 Token 待清理）','remove',{id:row.id}))),
 h('details',null,h('summary',null,'添加桶'),...['label','endpoint','bucket'].map((key,i)=>h('label',{key,style:{display:'block',margin:'8px 0'}},['名称','端点','桶名'][i],h('input',{value:draft[key],onChange:e=>setDraft({...draft,[key]:e.target.value}),style}))),h('button',{type:'button',style,disabled:busy||Object.values(draft).some(v=>!v.trim()),onClick:()=>run('add',draft)},'添加桶')),
 data.orphans.length>0&&h('div',null,h('h4',null,'待清理凭据'),...data.orphans.map(row=>h('p',{key:row.id},row.ref,' ',button('清除保留 Token','cleanup',{id:row.id})))))
}
