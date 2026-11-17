// Test-only bridge: install exclusively in a disposable profile with an ownership marker.
import {createServer} from 'node:http'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises'
import {dirname,join} from 'node:path'
export const inject=['tools','sessionController','workspaceRegistry','agentPresets','configEditor']
export async function apply(ctx,config){
 const home=process.env.DSH_HOME
 if(!home||!config.marker||!config.port)throw Error('Isolated probe requires explicit home, marker and port')
 if(!(await readFile(config.marker,'utf8')).startsWith('isolated DSH Workbench validation'))throw Error('Missing isolated ownership marker')
 const profile=dirname(ctx.configEditor.documentPath)
 if(!profile.startsWith(home+'/'))throw Error('Probe profile is not under isolated DSH_HOME')
 const token=randomBytes(32).toString('hex'),path=join(home,'probe-token')
 await mkdir(home,{recursive:true});await writeFile(path,token,{mode:0o600})
 const allowedDirectories=await Promise.all((config.directories??[]).map(p=>realpath(p)))
 const controller=ctx.sessionController
 const server=createServer((req,res)=>{
  const run=async()=>{
   const supplied=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`)
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401);res.end('{"error":"test profile token required"}');return}
   let size=0;const chunks=[]
   for await(const chunk of req){size+=chunk.length;if(size>1048576)throw Error('Probe request too large');chunks.push(chunk)}
   const body=JSON.parse(Buffer.concat(chunks).toString())
   let value
   if(body.action==='status')value={node:process.version,pid:process.pid,home,profile,tools:ctx.tools.definitions().map(t=>({name:t.name,descriptionLength:t.description.length})),presets:(await ctx.agentPresets.list()).map(p=>p.id)}
   else if(body.action==='models'){await controller.initializeDefaultModel();value=await controller.modelCatalog()}
   else if(body.action==='select-model')value=await controller.selectModel({sessionId:body.sessionId,provider:body.provider,model:body.model})
   else if(body.action==='plugins')value=(await ctx.get('pluginManager').listPlugins()).map(p=>({id:p.entryId,module:p.moduleName,enabled:p.enabled,phase:p.fiberPhase}))
   else if(body.action==='sessions')value=await controller.list({})
   else if(body.action==='events')value=await controller.events({address:{kind:'session',sessionId:body.sessionId},maxMessages:200,...(body.beforeSeq===undefined?{}:{beforeSeq:body.beforeSeq})},AbortSignal.timeout(30000))
   else if(body.action==='create'){
    const directory=await realpath(body.directory)
    if(!allowedDirectories.includes(directory))throw Error('Directory is not allowed by this test profile')
    const workspace=await ctx.workspaceRegistry.resolveByPath(directory)??await ctx.workspaceRegistry.create(directory)
    value=await controller.create({workspaceId:workspace.id,agentPreset:'standard'})
   }else if(body.action==='prompt')value=await controller.prompt({sessionId:body.sessionId,requestId:body.requestId,mode:'queue',content:[{type:'text',text:body.text}]},AbortSignal.timeout(30000))
   else if(body.action==='call'){
    if(!['chief_project','workbench_git','workbench_git_issue','workbench_git_write','workbench_browser','workbench_browser_act','workbench_desktop','workbench_output'].includes(body.name))throw Error('Tool not exposed by this test bridge')
    const resolved=await controller.resolveAgent(body.sessionId)
    if(resolved.error)throw Error(resolved.error.message)
    value=await ctx.tools.execute({calls:[{type:'tool-call',id:`acceptance-${Date.now()}`,name:body.name,arguments:JSON.stringify(body.args)}],agent:resolved.agent,signal:AbortSignal.timeout(65000)})
   }else if(body.action==='chief-command'){
    if(!/^\/(home|where|switch|resume)(?:\s|$)/.test(body.line))throw Error('Only navigation/control commands are exposed')
    // The bridge token authenticates this isolated test operator. Exercise the
    // same native route dispatcher as the client, not the Chief controller directly.
    const response=await ctx.get('connection').createSharedFetchHandler('/api').fetch(new Request('http://isolated.test/api/independent-chief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:'command',payload:{line:body.line,sessionId:body.sessionId}})}),{principal:{kind:'owner'}})
    value=await response.json()
   }else if(body.action==='service-change'){
    if(body.service==='credentials'){
     if(!body.ref?.startsWith('WB_ACCEPTANCE_')||!['set','unset'].includes(body.operation))throw Error('Only acceptance credentials can be changed')
     value=await ctx.get('workbenchCredentials')[body.operation](body.ref,body.value)
    }else if(body.service==='storage')value=await ctx.get('workbenchStorage').change(body.operation,body.input)
    else throw Error('Unknown test service mutation')
   }else if(body.action==='service-probe'){
    value=await ctx.get('workbenchIntranet').probe(body.input)
   }else if(body.action==='service-status'){
    const name={credentials:'workbenchCredentials',storage:'workbenchStorage',gateway:'workbenchIntranet'}[body.service]
    if(!name)throw Error('Unknown status service')
    value=await ctx.get(name)?.status()
   }else throw Error('Unknown probe action')
   res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,value}))
  }
  void run().catch(error=>{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:error.message}))})
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve)})
 ctx.effect(()=>()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}),'isolated Desktop probe')
}
