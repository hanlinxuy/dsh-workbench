import {defineTool} from '@deepseek-ai/dsh-tools'
import {join} from 'node:path'
import {createSpill} from './spill.js'

export async function installOutput(ctx,profile,config){
 const spill=await createSpill({...config,directory:join(profile,'.workbench-private','spill'),store:ctx.spillStore})
 ctx.provide('workbenchOutput',{bound:(text,exec,toolName)=>spill.bound(text,{sessionId:exec.agent?.session?.id??exec.agent?.id??'unowned',toolName,callId:exec.callId})})
 ctx.tools.register(defineTool({name:'workbench_output',description:'Read full redacted Workbench output by spill: handle. offset is a character offset, limit is a page size hint (1..2000); keep following nextOffset until null. Handles are session-scoped and expire under the configured retention/budget. Read never reruns the original operation.',parameters:{handle:{type:'string',required:true},offset:{type:'number'},limit:{type:'number'}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>JSON.stringify(await spill.read(args.handle,exec.agent?.session?.id??exec.agent?.id??'unowned',args.offset,args.limit))}))
}
