import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {verifySite} from './verify.js'
import {loadSiteCards} from './site-cards.js'
import { createBrowser } from './runtime.js'

export const name = 'workbench-browser'
export const inject = ['tools', 'systemPrompt','credentials','subprocess']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')

export function apply(ctx, config = {}) {
  let ownership
  ctx.inject?.(['workbenchCapabilities'],scope=>{
    ownership=scope.workbenchCapabilities
    scope.effect(()=>{const dispose=ownership.register({domain:'browser',plugin:name,tools:['workbench_browser', 'workbench_browser_act']});return ()=>{dispose();ownership=undefined}},'browser capability')
  })
  const output=(value,exec,name='workbench_browser')=>ctx.get?.('workbenchOutput')?.bound(value,exec,name)??value
  const run = createBrowser({
    home: config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'workbench-browser'),
    executablePath: config.executablePath ?? process.env.DSH_BROWSER_EXECUTABLE,
    screenshots:config.screenshots,accounts:config.accounts,sites:config.sites,credentials:ctx.credentials,
    headed: config.headed ?? process.env.DSH_BROWSER_HEADED === '1',
  })
  const definitions=[
    {name:'workbench_browser',actions:['site_list','site_read','site_verify','open','snapshot','screenshot','text','url','capture','version'],description:'Read and navigate with agent-browser in persistent named accounts. Actions: site_list, site_read(site), site_verify(site) for configured site contracts; open(target HTTP/S URL), snapshot, screenshot (private PNG path/size/hash; no inline pixels), text(optional target), url, version; capture(site) saves scoped cookies to host credentials without exposing values. Configured sites select their own account; explicit account is for unconfigured sites. Site verification reports machine assertions separately from manual screenshot review. Use workbench_browser_act for clicks, forms, key presses, back, close and cookie restore. JavaScript eval is unavailable.'},
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
      ownership?.assert('browser',name)
      if(!definition.actions.includes(args.action))throw Error(`Action ${args.action} is not part of ${definition.name}; use the read/navigation or interaction tool`)
      if(['site_list','site_read','site_verify'].includes(args.action)){
        if(!config.siteCardsDirectory){
          if(args.action==='site_verify')throw Error('Configure a reviewed site card verification contract before site_verify')
          const routes=Object.entries(config.sites??{}).map(([site,route])=>({site,account:route.account,allowedHosts:route.allowedHosts,source:'configured-route',instruction:'Pass site on each browser call; no reviewed business verification contract configured'}))
          if(args.action==='site_list')return output(JSON.stringify(routes),exec)
          const route=routes.find(r=>r.site===args.site)
          if(!route)throw Error('Unknown site route')
          return output(JSON.stringify(route),exec)
        }
        const cards=await loadSiteCards(config.siteCardsDirectory,{tools:ctx.tools.definitions(exec.agent,exec.toolSet).map(t=>t.name),presets:config.enabledPresets??[]})
        if(args.action==='site_list')return output(JSON.stringify(cards.map(({site,version,access,actions})=>({site,version,access,actions}))),exec)
        const card=cards.find(c=>c.site===args.site)
        if(!card)throw Error('Site card missing or its capability preset is disabled')
        if(args.action==='site_verify')return output(JSON.stringify(await verifySite(card,{spawn:options=>ctx.subprocess.spawn(options),python:config.pythonPath??'python',offline:config.offline===true,signal:exec.signal})),exec)
        return output(JSON.stringify(card),exec)
      }
      return output(await run(args,exec.signal).catch(async error=>{throw Error(await output(error.message,exec))}),exec)
    },
   }),{when:()=>ownership?.allows('browser',name)??true})
  }
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-browser', order: 400, interpolate: false, text: instructions }), 'Browser usage')
}
