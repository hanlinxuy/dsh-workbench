// Run with the target host's Node and actual dsh-tools module, not a defineTool mock.
import {registerHooks} from 'node:module'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const target=process.env.DSH_TOOLS_MODULE
if(!target)throw Error('DSH_TOOLS_MODULE must name the target host dsh-tools entry')
const url=pathToFileURL(target).href
const hooks=registerHooks({resolve(id,context,next){return id==='@deepseek-ai/dsh-tools'?{url,shortCircuit:true}:next(id,context)}})
let count=0,total=0
for(const plugin of ['git','browser','desktop']){
 const {apply}=await import(`../../../plugins/${plugin}/index.js`)
 const ctx={configEditor:{documentPath:'/unused-schema-preflight/patch.yml'},credentials:{},tools:{register(tool){assert.ok(tool.parameters?.type==='object');assert.ok(tool.description.length<=1300);total+=tool.description.length;count++}},effect(){},get(){}}
 await apply(ctx,{home:'/unused-schema-preflight',knowledge:{enabled:true,index:'/unused-schema-preflight/index.json'},vision:{enabled:true,baseURL:'http://127.0.0.1/v1',model:'schema-only'}})
}
hooks.deregister();assert.ok(total<=8200)
console.log(JSON.stringify({status:'passed',tools:count,descriptionCharacters:total,node:process.version}))
