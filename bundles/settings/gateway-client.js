import {createElement as h,useState} from 'react'
export function GatewayFields({saved,draft,setDraft,editing,call}){
 const [result,setResult]=useState(''),[model,setModel]=useState(''),[backend,setBackend]=useState(saved.adapter.backends[0]??''),[busy,setBusy]=useState(false)
 const fields=draft.gatewayHeaders??[]
 const update=(id,key,value)=>setDraft({...draft,gatewayHeaders:fields.map(row=>row.id===id?{...row,[key]:value}:row)})
 const inputStyle={background:'transparent',color:'inherit',border:'1px solid #666',borderRadius:7,padding:8,minWidth:0}
 const button=(text,onClick)=>h('button',{type:'button',onClick,disabled:busy,style:inputStyle},text)
 return h('section',{style:{border:'1px solid #555',borderRadius:14,padding:20,marginTop:12}},
 h('strong',null,'模型网关'),h('p',{style:{opacity:.65,fontSize:13}},'刷新模型列表可同步已配置的 DSH provider。自定义头随“保存连接”生效。'),
 editing?h('div',null,...saved.adapter.backends.map(id=>h('label',{key:id,style:{display:'block',color:draft.gatewayOverrides?.[id]?'#ef9385':'inherit',margin:'10px 0'}},h('input',{type:'checkbox',checked:draft.gatewayOverrides?.[id]===true,onChange:e=>setDraft({...draft,gatewayOverrides:{...draft.gatewayOverrides,[id]:e.target.checked}})}),`${id}：覆盖自动鉴权（开启后不再自动登录）`)),
 ...fields.map(row=>h('div',{key:row.id,style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}},
 h('select',{value:row.backend,style:inputStyle,onChange:e=>update(row.id,'backend',e.target.value)},...saved.adapter.backends.map(id=>h('option',{key:id,value:id},id))),
 h('input',{'aria-label':'请求头名称',placeholder:'x-team',value:row.name,style:inputStyle,onChange:e=>update(row.id,'name',e.target.value)}),
 h('input',{'aria-label':'请求头值',type:row.secret?'password':'text',placeholder:row.valueSaved?'已保存，留空保留':'输入请求头值',value:row.value,style:inputStyle,onChange:e=>update(row.id,'value',e.target.value)}),
 h('label',null,h('input',{type:'checkbox',checked:row.secret,onChange:e=>update(row.id,'secret',e.target.checked)}),'掩码显示'),
 button('移除请求头',()=>setDraft({...draft,gatewayHeaders:fields.filter(r=>r.id!==row.id)})))),
 button('添加请求头',()=>setDraft({...draft,gatewayHeaders:[...fields,{id:crypto.randomUUID(),backend:saved.adapter.backends[0],name:'',value:'',secret:true}]})))
 :h('div',null,...(saved.gatewayHeaders??[]).map(row=>h('p',{key:row.id,style:{fontSize:13}},`${row.backend} · ${row.name} · ${row.secret?(row.valueSaved?'已保存':'待清理'):row.value||'待清理'}`)),...saved.adapter.backends.filter(id=>saved.gatewayOverrides?.[id]).map(id=>h('p',{key:id,style:{color:'#ef9385'}},`${id}：已覆盖自动鉴权，不再自动登录`))),
 !editing&&h('details',null,h('summary',null,'手动测试模型调用'),h('p',{style:{fontSize:12,opacity:.65}},'发送一次简短文本请求，会消耗少量额度；不自动运行，不推断上下文或多模态上限。'),h('select',{value:backend,style:inputStyle,onChange:e=>setBackend(e.target.value)},...saved.adapter.backends.map(id=>h('option',{key:id,value:id},id))),h('input',{'aria-label':'探测模型名称',placeholder:'模型名称',value:model,style:inputStyle,onChange:e=>setModel(e.target.value)}),button('发送测试请求',()=>{setBusy(true);void call('probe',{backend,model}).then(r=>setResult(r.ok?'调用成功':'调用失败：'+r.status),e=>setResult(e.message)).finally(()=>setBusy(false))}),h('p',{role:'status'},result)))
}
