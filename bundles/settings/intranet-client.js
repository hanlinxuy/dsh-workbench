import { createElement as h, useEffect, useState } from 'react'

const border='1px solid var(--dsw-alias-border-primary, #444)'
const field={width:'100%',boxSizing:'border-box',padding:'10px 12px',border,borderRadius:9,background:'transparent',color:'inherit',fontSize:14}
const buttonStyle={padding:'8px 13px',border,borderRadius:9,background:'transparent',color:'inherit',cursor:'pointer',fontSize:13}
const card={border,borderRadius:14,padding:20,marginTop:12}
export function IntranetPanel(){
  const [saved,setSaved]=useState(),[draft,setDraft]=useState(),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[models,setModels]=useState([])
  const call=async(action,input)=>{
    const r=await fetch('api/workbench-intranet',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,input})})
    const result=await r.json();if(!result.ok)throw Error(result.error.message);return result.value
  }
  const accept=value=>{setSaved(value);setDraft({...value,password:'',maasToken:'',git:value.git.map(row=>({...row,token:''}))})}
  useEffect(()=>{void call('status').then(accept).catch(e=>setError(e.message))},[])
  const run=async action=>{
    setBusy(true);setError('');setMessage('')
    try{
      const result=await call(action,action==='save'?draft:undefined)
      if(action==='save'){accept(result);setEditing(false);setModels([]);setMessage('已保存到本机。')}
      if(action==='test')setMessage(result.demo?'演示测试完成，未连接真实服务。':result.connected?'连接测试通过。':'连接未通过，请检查已保存的配置。')
      if(action==='models'){setModels(result.models);setMessage(result.demo?'已加载示例模型，未接入真实 MaaS。':`已刷新 ${result.models.length} 个模型。`)}
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const button=(label,fn,disabled=false)=>h('button',{type:'button',style:buttonStyle,disabled:busy||disabled,onClick:fn},label)
  const input=(label,key,type='text',placeholder='')=>h('label',{style:{display:'grid',gap:6,fontSize:13}},label,h('input',{style:field,type,value:draft[key],placeholder,autoComplete:type==='password'?'new-password':'off',onChange:e=>setDraft({...draft,[key]:e.target.value})}))
  return h('section',{'aria-label':'内网连接',style:{maxWidth:680,margin:'28px 0',lineHeight:1.6}},
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}},h('div',null,h('h2',{style:{margin:0,fontSize:20}},'内网连接'),h('p',{style:{margin:'4px 0 0',opacity:.65,fontSize:13}},'一次配置，连接企业模型与代码平台。')),saved&&!editing&&button('编辑连接',()=>setEditing(true))),
    error&&h('p',{role:'alert',style:{color:'#e99687'}},error),message&&h('p',{role:'status',style:{fontSize:13}},message),
    !saved?h('p',null,'正在读取连接设置…'):h('div',null,
      saved.adapter?.demo&&h('p',{role:'note',style:{fontSize:13,color:'#d8b470'}},'演示模式 · 不连接内网，请勿填写真实凭据。'),
      h('div',{style:card},h('div',{style:{display:'flex',justifyContent:'space-between',gap:12}},h('strong',null,'企业账号与模型'),h('span',{style:{fontSize:12,opacity:.65}},saved.adapter?saved.adapter.demo?'演示适配器':'已接入适配器':'等待接入适配器')),
        editing?h('div',{style:{display:'grid',gap:14,marginTop:16}},input('工号','employeeId','text','输入工号'),input('账号密码','password','password',saved.passwordSaved?'已保存，留空保留':'输入账号密码'),input('MaaS Token','maasToken','password',saved.maasTokenSaved?'已保存，留空保留':'输入 MaaS Token'))
        :h('div',null,h('p',{style:{fontSize:14}},saved.employeeId||'尚未填写工号'),h('p',{style:{fontSize:13,opacity:.65}},`密码${saved.passwordSaved?'已保存':'未填写'} · MaaS Token ${saved.maasTokenSaved?'已保存':'未填写'}`)),
        !editing&&h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},button('测试连接',()=>run('test'),!saved.adapter),button('刷新模型',()=>run('models'),!saved.adapter)),
        models.length>0&&h('ul',{style:{paddingLeft:20,fontSize:13}},...models.map(m=>h('li',{key:m.id},m.name,' · ',m.id)))),
      h('div',{style:card},h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},h('strong',null,'Git 平台'),editing&&button('添加平台',()=>setDraft({...draft,git:[...draft.git,{id:crypto.randomUUID(),label:'',url:'',token:'',permissions:{write:false,push:false}}]}))),
        (editing?draft.git:saved.git).length===0&&h('p',{style:{fontSize:13,opacity:.65}},'添加 GitLab 或其他内部代码平台。'),
        ...(editing?draft.git:saved.git).map((row,i)=>h('div',{key:row.id,style:{borderTop:i?border:undefined,paddingTop:14,marginTop:8}},
          editing?h('div',{style:{display:'grid',gap:10}},...['label','url','token'].map(key=>h('label',{key,style:{display:'grid',gap:5,fontSize:13}},{label:'平台名称',url:'平台地址',token:'访问 Token'}[key],h('input',{style:field,type:key==='token'?'password':'text',autoComplete:'off',value:row[key],placeholder:key==='url'?'https://gitlab.example.internal':key==='token'&&row.tokenSaved?'已保存，留空保留':'',onChange:e=>setDraft({...draft,git:draft.git.map(r=>r.id===row.id?{...r,[key]:e.target.value}:r)})}))),h('div',{style:{borderTop:border,paddingTop:12,display:'grid',gap:10}},h('div',{style:{fontSize:13,opacity:.65}},'默认允许读取和创建 Issue'),...['write','push'].map(key=>h('label',{key,style:{display:'flex',gap:10,alignItems:'center',fontSize:14}},h('input',{type:'checkbox',checked:row.permissions?.[key]===true,onChange:e=>setDraft({...draft,git:draft.git.map(r=>r.id===row.id?{...r,permissions:{write:r.permissions?.write===true,push:r.permissions?.push===true,[key]:e.target.checked}}:r)})}),key==='write'?'允许写入（提交、分支、评论和 MR）':'允许 Push')),h('p',{style:{fontSize:12,opacity:.55,margin:0}},'保存后对 Workbench Git 生效。外网限制、Token 权限和合并分支规则仍适用。')),button('移除平台',()=>setDraft({...draft,git:draft.git.filter(r=>r.id!==row.id)})))
          :h('div',null,h('div',null,row.label||'Git 平台'),h('div',{style:{fontSize:12,opacity:.65,overflowWrap:'anywhere'}},row.url,' · Token ',row.tokenSaved?'已保存':'未填写'),h('div',{style:{fontSize:12,opacity:.65,marginTop:6}},'读取 · 创建 Issue',row.permissions?.write?' · 写入已开启':' · 写入关闭',row.permissions?.push?' · Push 已开启':' · Push 关闭'))))),
      editing?h('div',{style:{display:'flex',gap:8,marginTop:16}},button('保存连接',()=>run('save')),button('取消',()=>{accept(saved);setEditing(false)}))
        :h('p',{style:{fontSize:12,opacity:.55,marginTop:14}},'凭据只存于本机。内网适配器负责验证账号、发现模型和绑定 DSH 路由。')))
}
