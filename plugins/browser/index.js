import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {createKnowledge} from './knowledge.js'
import {verifySite} from './verify.js'
import {createVision} from './vision.js'
import {loadSiteCards} from './site-cards.js'
import { createBrowser } from './runtime.js'

export const name = 'workbench-browser'
export const inject = ['tools', 'systemPrompt','credentials','subprocess']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')

export function apply(ctx, config = {}) {
  const output=(value,exec,name='workbench_browser')=>ctx.get?.('workbenchOutput')?.bound(value,exec,name)??value
  const run = createBrowser({
    home: config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'workbench-browser'),
    executablePath: config.executablePath ?? process.env.DSH_BROWSER_EXECUTABLE,
    accounts:config.accounts,sites:config.sites,credentials:ctx.credentials,
    headed: config.headed ?? process.env.DSH_BROWSER_HEADED === '1',
  })
  const definitions=[
    {name:'workbench_browser',actions:['site_list','site_read','site_verify','open','snapshot','text','url','capture','version'],description:'Read and navigate with agent-browser in persistent named accounts. Actions: site_list, site_read(site), site_verify(site) for configured site contracts; open(target HTTP/S URL), snapshot, text(optional target), url, version; capture(site) saves scoped cookies to host credentials without exposing values. Configured sites select their own account; explicit account is for unconfigured sites. Site verification reports machine assertions separately from manual screenshot review. Use workbench_browser_act for clicks, forms, key presses, back, close and cookie restore. JavaScript eval is unavailable.'},
    {name:'workbench_browser_act',actions:['click','fill','select','press','wait','back','close','restore'],enabled:config.actionsEnabled!==false,description:'Interact with the current browser account: click(target ref), fill(target ref,value), select(target ref,value), press(target key), wait(target selector), back, close, restore(site). Use a fresh snapshot after navigation; configured sites enforce their account and host. Closing preserves login. Clicks/forms may submit changes: follow the user-authorized task and site readback rules. JavaScript eval/evaluate is unavailable; confirm=true cannot enable it.'},
  ]
  for(const definition of definitions){
   if(definition.enabled===false)continue
   ctx.tools.register(defineTool({
    name:definition.name,
    timeoutMs:65000,
    description:definition.description,
    parameters: {
      action: { type: 'string', required: true },
      account: { type: 'string' },
      site: { type: 'string' },
      target: { type: 'string' },
      value: { type: 'string' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async(args, exec) => {
      if(!definition.actions.includes(args.action))throw Error(`Action ${args.action} is not part of ${definition.name}; use the read/navigation or interaction tool`)
      if(['site_list','site_read','site_verify'].includes(args.action)){
        if(!config.siteCardsDirectory)throw Error('No site card source configured')
        const cards=await loadSiteCards(config.siteCardsDirectory,{tools:ctx.tools.definitions(exec.agent,exec.toolSet).map(t=>t.name),presets:config.enabledPresets??[]})
        if(args.action==='site_list')return output(JSON.stringify(cards.map(({site,version,access,actions})=>({site,version,access,actions}))),exec)
        const card=cards.find(c=>c.site===args.site)
        if(!card)throw Error('Site card missing or its capability preset is disabled')
        if(args.action==='site_verify')return output(JSON.stringify(await verifySite(card,{spawn:options=>ctx.subprocess.spawn(options),python:config.pythonPath??'python',offline:config.offline===true,signal:exec.signal})),exec)
        return output(JSON.stringify(card),exec)
      }
      return output(await run(args,exec.signal).catch(async error=>{throw Error(await output(error.message,exec))}),exec)
    },
   }))
  }
  if(config.knowledge?.enabled===true){
    const lookup=createKnowledge(config.knowledge)
    ctx.tools.register(defineTool({name:'workbench_knowledge',description:'Search the optional local index before consulting remote sources. search(query) returns complete matching text, sourceRef, indexedAt and stale flag; read(id) retrieves one full entry. no-hit/unavailable means follow fallbackSources or ask the user; never invent an answer. Stale entries require source verification.',parameters:{action:{type:'string',required:true},query:{type:'string'},id:{type:'string'}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>output(JSON.stringify(await lookup(args)),exec,'workbench_knowledge')}))
  }
  if(config.vision?.enabled===true){
    const describe=createVision(config.vision,{credentials:ctx.credentials,approveExternal:(target,payload,exec)=>{
      const gate=ctx.get('workbenchEgress')
      if(!gate)throw Error('egress_not_confirmed: enable the Workbench egress gate before external vision')
      return gate.approve(target,payload,exec)
    },resolveImage:(handle,exec)=>ctx.get('workbenchImages')?.resolve(handle,exec)})
    ctx.tools.register(defineTool({name:'workbench_vision',description:'Optional visual side channel. Describe a PNG/JPEG path or registered image: handle with a question. Sends image bytes only to the configured vision backend; returns untrusted text and model/size/timing, never an image. Internal backends by default; external requests require fresh foreground approval. Oversized images are explicitly rejected. temporary=true deletes only files under the operator-configured temporary directory after this call.',parameters:{image:{type:'string',required:true},question:{type:'string',required:true},temporary:{type:'boolean'}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>output(JSON.stringify(await describe(args,exec)),exec,'workbench_vision')}))
  }
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-browser', order: 400, interpolate: false, text: instructions }), 'Browser usage')
}
