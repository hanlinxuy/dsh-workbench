import {CredentialCatalogPanel} from './catalog-client.js'
import { IntranetPanel } from './intranet-client.js'
import { createElement as h, useEffect, useState } from 'react'
export function apply(ctx) {
  const call=async (action,input={})=>{
    const response=await fetch('api/workbench-settings',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,...input})})
    const result=await response.json();if(!result.ok)throw new Error(result.error.message);return result.value
  }
  function OwnedPanel({domain,Component}){
    const [state,setState]=useState(),[error,setError]=useState('')
    useEffect(()=>{call('status').then(result=>setState(result.capabilities.domains.find(d=>d.domain===domain))).catch(e=>setError(e.message))},[domain])
    if(error)return h('p',{role:'alert'},error)
    if(!state)return h('p',null,'正在确认能力提供者…')
    if(state.providedBy&&state.providedBy!=='workbench-settings')return h('p',null,`此入口由 ${state.providedBy} 提供，Workbench 已停用重复入口。`)
    return h(Component)
  }
  function Settings({subject}) {
    if(subject.kind!=='bundle'||!['dsh-workbench-core','dsh-workbench-suite'].includes(subject.pkg.name))return null
    return h(Panel)
  }
  function Panel(){
    const [data,setData]=useState(),[error,setError]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false),[confirm,setConfirm]=useState(false)
    const refresh=()=>call('status').then(setData).catch(e=>setError(e.message))
    useEffect(()=>{void refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer)},[])
    const run=async (action,input)=>{
      setWorking(true);setError('');setMessage('')
      try{
        const result=await call(action,input)
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
          data.pwsh.automatic?.status!=='not-needed'&&data.pwsh.automatic&&h('p',{role:'status'},data.pwsh.automatic.message),
          data.pwsh.state!=='not-needed'&&h('div',null,button(data.pwsh.autoEnabled?'关闭自动接入':'开启自动接入',()=>run(data.pwsh.autoEnabled?'disable-auto-pwsh':'enable-auto-pwsh')),button('恢复原 Shell（卸载前）',()=>run('release-pwsh'))),
          data.pwsh.state!=='not-needed'&&button('安装 / 重试 PowerShell 7',()=>run('install-pwsh')),
          data.installation.status!=='idle'&&h('p',{role:'status'},data.installation.message),data.installation.output&&h('pre',{style:{whiteSpace:'pre-wrap'}},data.installation.output)),
        h('div',{style:card},h('h3',null,'TLS 信任'),h('p',null,data.tls.message),data.tls.sources&&h('p',null,`内置 ${data.tls.sources.bundled} · 系统 ${data.tls.sources.system} · 文件 ${data.tls.sources.file}`),button('合并系统根证书',()=>run('trust-system'))),
        h('div',{style:card},h('h3',null,'能力归属与工具预算'),h('p',{role:data.capabilities.exceeded?'alert':undefined},`当前 profile 已注册工具描述 ${data.capabilities.total} / ${data.capabilities.budget} 字符${data.capabilities.exceeded?' · 超出预算，请停用重复工具':''}`),...data.capabilities.domains.map(d=>h('p',{key:d.domain},`${d.domain}：${d.providedBy??'未指定'}${d.conflict?' · 多个提供者，请指定 providedBy':''}${d.missing?' · 指定提供者未加载':''}`,h('select',{'aria-label':`${d.domain} 提供者`,value:d.providedBy??'',disabled,onChange:e=>run('set-provider',{domain:d.domain,providedBy:e.target.value})},h('option',{value:'',disabled:true},'选择提供者'),...d.providers.map(p=>h('option',{key:p.plugin,value:p.plugin},p.plugin))))),h('p',null,`未声明归属的工具：${data.capabilities.undeclared.join('、')||'无'}`)),
        h('div',{style:{marginTop:16}},button('重新检测',refresh))))
  }
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'workbench-environment',order:37,label:()=> 'Workbench 环境'},Panel))
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'workbench-intranet',order:35,label:()=> '内网连接'},()=>h(OwnedPanel,{domain:'model-connections',Component:IntranetPanel})))
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'workbench-credentials',order:36,label:()=> '服务凭据'},()=>h(OwnedPanel,{domain:'credentials',Component:CredentialCatalogPanel})))
  ctx.slots.inject('plugins.detail.section',()=>ctx.slots.register({name:'plugins.detail.section',id:'workbench.environment',order:5},Settings))
}
