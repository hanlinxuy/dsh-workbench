import { IntranetPanel } from './intranet-client.js'
import { createElement as h, useEffect, useState } from 'react'
export function apply(ctx) {
  const call=async action=>{
    const response=await fetch('api/workbench-settings',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action})})
    const result=await response.json();if(!result.ok)throw new Error(result.error.message);return result.value
  }
  function Settings({subject}) {
    if(subject.kind!=='bundle'||!['dsh-workbench-core','dsh-workbench-suite'].includes(subject.pkg.name))return null
    return h('div',null,h(IntranetPanel),h(Panel))
  }
  function Panel(){
    const [data,setData]=useState(),[error,setError]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false),[confirm,setConfirm]=useState(false)
    const refresh=()=>call('status').then(setData).catch(e=>setError(e.message))
    useEffect(()=>{void refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer)},[])
    const run=async action=>{
      setWorking(true);setError('');setMessage('')
      try{
        const result=await call(action)
        if(action==='migrate'){setConfirm(false);setMessage(result.application==='applied'?'迁移已生效，原配置和数据已保留。':result.application==='unchanged'?'没有需要迁移的组件。':'迁移已保存。请重启 DSH，让新配置生效。')}
        else setMessage(result.message)
        await refresh()
      }catch(e){setError(e.message)}finally{setWorking(false)}
    }
    const disabled=working||data?.busy
    const button=(text,onClick)=>h('button',{type:'button',disabled,onClick,style:{padding:'8px 14px',borderRadius:8,border:'1px solid var(--dsw-alias-border-primary, #555)',background:'transparent',color:'inherit',cursor:'pointer'}},text)
    const card={padding:'16px 0',borderBottom:'1px solid var(--dsw-alias-border-primary, #444)'}
    return h('section',{'aria-label':'Workbench 环境设置',style:{maxWidth:720,margin:'20px 0',lineHeight:1.6}},
      h('h2',null,'环境与迁移'),
      error&&h('p',{role:'alert'},error),message&&h('p',{role:'status'},message),
      !data?h('p',null,'正在检测当前 DSH 环境…'):h('div',null,
        h('div',{style:card},h('h3',null,'组件登记'),
          data.lastMigration?.application==='restart-required'&&h('p',{role:'status'},'配置已保存，请重启 DSH 后生效。'),
          data.lastMigration?.warnings?.length>0&&h('p',{role:'status'},data.lastMigration.warnings.join('；')),
          data.migration.changes?h('div',null,h('p',null,`发现 ${data.migration.changes} 个可迁移的独立组件。迁移会备份配置、保留原设置和数据，并去掉重复登记。`),h('p',null,data.migration.components.join(' · ')),
            confirm?h('div',null,h('p',null,'只处理当前 DSH。请在任务结束后执行；若宿主要求重启，页面会明确提示。'),button('确认迁移',()=>run('migrate'))):button('查看并迁移',()=>setConfirm(true)))
          :h('p',null,'组件登记正常，无需迁移。')),
        h('div',{style:card},h('h3',null,'PowerShell 7'),h('p',null,data.pwsh.message),
          data.pwsh.state==='missing'&&button('安装 PowerShell 7',()=>run('install-pwsh')),
          data.installation.status!=='idle'&&h('p',{role:'status'},data.installation.message),data.installation.output&&h('pre',{style:{whiteSpace:'pre-wrap'}},data.installation.output)),
        h('div',{style:{marginTop:16}},button('重新检测',refresh))))
  }
  ctx.slots.inject('plugins.detail.section',()=>ctx.slots.register({name:'plugins.detail.section',id:'workbench.environment',order:5},Settings))
}
