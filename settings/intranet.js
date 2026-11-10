import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

// The adapter is supplied by the intranet plugin as workbenchIntranet.
// Secrets remain on the host; only the redacted view reaches the UI.
export function createIntranetSettings(profile, adapter) {
  const directory=join(profile,'.workbench-private'), file=join(directory,'connections.json')
  let writing=false
  const read=()=>readFile(file,'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return {employeeId:'',password:'',maasToken:'',git:[]};throw error})
  const view=value=>({employeeId:value.employeeId,passwordSaved:!!value.password,maasTokenSaved:!!value.maasToken,git:value.git.map(({id,label,url,token,permissions})=>({id,label,url,tokenSaved:!!token,permissions:{write:permissions?.write===true,push:permissions?.push===true}})),adapter:adapter?{name:adapter.name,demo:adapter.demo===true}:null})
  return async (action,input) => {
    const saved=await read()
    if(action==='status')return view(saved)
    if(action==='save'){
      if(writing)throw Error('正在保存，请稍后再试。')
      if(!input || typeof input.employeeId!=='string' || typeof input.password!=='string' || typeof input.maasToken!=='string' || !Array.isArray(input.git) || input.git.length>20)throw Error('请检查账号与平台信息。')
      const ids=new Set()
      const git=input.git.map(row=>{
        if(!row || typeof row.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(row.id)||ids.has(row.id)||typeof row.label!=='string'||typeof row.url!=='string'||typeof row.token!=='string')throw Error('Git 平台信息不完整。')
        ids.add(row.id)
        const url=new URL(row.url)
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('平台地址请填写不含凭据、查询参数的 HTTP(S) 地址。')
        if(row.permissions!==undefined && (!row.permissions || typeof row.permissions.write!=='boolean' || typeof row.permissions.push!=='boolean'))throw Error('权限选项格式不正确。')
        return {permissions:{write:row.permissions?.write===true,push:row.permissions?.push===true},id:row.id,label:row.label.trim().slice(0,100),url:url.href,token:row.token||saved.git.find(old=>old.id===row.id)?.token||''}
      })
      const next={employeeId:input.employeeId.trim().slice(0,100),password:input.password||saved.password,maasToken:input.maasToken||saved.maasToken,git}
      writing=true
      try{
        await mkdir(directory,{recursive:true,mode:0o700})
        await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600})
        await rename(file+'.tmp',file)
      }finally{writing=false}
      return view(next)
    }
    if(!adapter)throw Error('尚未接入内网适配器。配置可先保存，连接测试需由内网插件提供。')
    // Only explicit adapter operations can use secrets. No endpoint from the
    // browser is fetched by this template, and adapter errors never echo them.
    if(action==='test'){
      const result=await adapter.test(saved).catch(()=>{throw Error('连接测试失败，请检查配置或联系内网服务管理员。')})
      return {connected:result.connected===true,demo:adapter.demo===true}
    }
    if(action==='models'){
      const models=await adapter.models(saved).catch(()=>{throw Error('模型列表刷新失败，请检查 MaaS 配置。')})
      if(!Array.isArray(models)||models.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'))throw Error('适配器返回的模型列表格式不正确。')
      // The adapter owns upstream routing and DSH provider registration. Never
      // expose upstream URLs, headers or tokens as arbitrary adapter metadata.
      return {models:models.map(({id,name})=>({id,name})),demo:adapter.demo===true}
    }
    throw Error('未知操作。')
  }
}

export const demoIntranetAdapter={
  name:'演示适配器（不连接内网）',demo:true,
  async test(){return {connected:true}},
  async models(){return [{id:'demo-chat',name:'示例对话模型'},{id:'demo-code',name:'示例代码模型'}]},
}
