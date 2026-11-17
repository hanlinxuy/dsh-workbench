import {approveEgress} from './egress.js'
import {authorizeMerge} from './merge-authorization.js'
import {appendFile,mkdir} from 'node:fs/promises'
import {createWriteJournal} from './write-journal.js'
import { dirname, join } from 'node:path'
import { connectionPolicy } from './connection-policy.js'
import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createGit } from './runtime.js'
export const name = 'workbench-git'
export const inject = ['tools', 'systemPrompt', 'workingDirectory', 'subprocess', 'configEditor']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')
export async function apply(ctx, config = {}) {
  let ownership
  ctx.inject?.(['workbenchCapabilities'],scope=>{
    ownership=scope.workbenchCapabilities
    scope.effect(()=>{const dispose=ownership.register({domain:'git',plugin:name,tools:['workbench_git', 'workbench_git_issue', 'workbench_git_write']});return ()=>{dispose();ownership=undefined}},'git capability')
  })
  // Use the host's managed subprocess provider, including cancellation and
  // scrubbed environment. Never forward all of process.env back into it.
  const execHost = async (file, args, options = {}) => {
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeout ?? 60000), ...(options.signal ? [options.signal] : [])])
    const child = ctx.subprocess.spawn({ argv: [file, ...args], cwd: options.cwd ?? process.cwd(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: options.maxBuffer ?? 2097152 }, stderr: { maxBytes: 65536 } },
      graceMs: 1000, signal, env: options.env })
    const outcome = await child.done
    const stdout = child.collected.stdout.readFrom(0)
    const stderr = child.collected.stderr.readFrom(0)
    if (outcome.exitCode !== 0 || signal.aborted || stdout.lossy || stderr.lossy) {
      const detail=stderr.text.trim().slice(-2000).replace(/(https?:\/\/)[^\s/@]+@/gi,'$1***@').replace(/((?:token|password|authorization)\s*[:=]\s*)[^\s]+/gi,'$1***')
      const error = new Error(signal.aborted?'Git subprocess cancelled or timed out':stdout.lossy||stderr.lossy?'Git subprocess output exceeded collection limit; full output was not captured':`Git subprocess failed (exit ${outcome.exitCode}): ${detail||'no diagnostic output'}`)
      error.code = outcome.exitCode
      throw error
    }
    return { stdout: stdout.text }
  }

  const file = config.configFile ?? process.env.DSH_GIT_CONFIG
  const gitConfig=file ? JSON.parse(await readFile(file, 'utf8')) : config
  const policy=connectionPolicy(dirname(ctx.configEditor.documentPath))
  const journal=createWriteJournal(join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit'))
  ctx.provide?.('workbenchEgress',{approve:(target,payload,exec)=>approveEgress({target,payload,exec,controller:ctx.get('sessionController'),approval:ctx.get('approval'),internalDomains:gitConfig.egress?.internalDomains??[],auditDirectory:join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit')})})
  const run=createGit(gitConfig,execHost,policy,async(authorization,actual,signal,exec)=>{
    const evidence=await authorizeMerge({mode:gitConfig.mergeAuthorization??'user-confirmed',authorization,actual,sessionId:exec.agent?.id,controller:ctx.get('sessionController'),reviewer:ctx.get('workbenchGitReview'),signal})
    const directory=join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit')
    await mkdir(directory,{recursive:true,mode:0o700})
    await appendFile(join(directory,'merge.ndjson'),JSON.stringify({at:new Date().toISOString(),...evidence})+'\n',{mode:0o600})
  },(target,payload,exec)=>approveEgress({target,payload,exec,controller:ctx.get('sessionController'),approval:ctx.get('approval'),internalDomains:gitConfig.egress?.internalDomains??[],auditDirectory:join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit')}))
  const parameters = { authorization:{type:'object',additionalProperties:false,properties:{mode:{type:'string'},quote:{type:'string'},sourceSeq:{type:'number'},reviewId:{type:'string'}}}, confirm:{type:'boolean'}, action: { type: 'string', required: true }, repository: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' }, message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, number: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, page: { type: 'number' }, source_branch: { type: 'string' }, target_branch: { type: 'string' } }
  const definitions=[
    {name:'workbench_git',description:'Read Git repositories and code-platform metadata. Omit repository or use current to discover the active workspace and remote. Actions: catalog, status, diff, log(optional branch), branches, remote_head(remote,branch), repo_get, issues_list, issue_get(number), comments_list(number), mr_list, mr_get(number), mr_comments_list(number). Lists accept page. Read-only; use workbench_git_issue for issues/comments and workbench_git_write for other mutations.',actions:['catalog','status','diff','log','branches','remote_head','repo_get','issues_list','issue_get','comments_list','mr_list','mr_get','mr_comments_list'],fields:['action','repository','remote','branch','number','page']},
    {name:'workbench_git_issue',description:'Create an issue or comment within configured platform permissions. issue_create(title,body), comment_create(number,body), mr_comment(number,body). Omit repository to use the active workspace. These L1 writes execute immediately; external publishing additionally requires a foreground human request and fresh native approval. Never resend an outcome_unknown operation; read the target first.',actions:['issue_create','comment_create','mr_comment'],fields:['action','repository','number','title','body'],enabled:gitConfig.issueTools!==false},
    {name:'workbench_git_write',description:'Git mutations within operator policy: stage(paths), commit(message), switch(branch), fetch(remote), push(remote,branch), mr_create(title,body,source_branch,target_branch), mr_merge(number,target_branch,authorization). Default is preview; confirm=true requests native one-time approval. Merge authorization mode is operator-selected: user-confirmed(quote,sourceSeq) or auto-reviewed(reviewId from trusted reviewer). External push/merge denied. Never retry outcome_unknown; inspect target state.',actions:['stage','commit','switch','fetch','push','mr_create','mr_merge'],fields:['action','repository','remote','branch','message','paths','title','body','source_branch','target_branch','number','confirm','authorization'],enabled:gitConfig.writeTools!==false},
  ]
  for(const definition of definitions){
   if(definition.enabled===false)continue
   ctx.tools.register(defineTool({
    name:definition.name,timeoutMs:65000,description:definition.description,
    parameters:Object.fromEntries(definition.fields.map(key=>[key,parameters[key]])),
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => {
      ownership?.assert('git',name)
      if(!definition.actions.includes(args.action))throw Error(`Action ${args.action} is not part of ${definition.name}; select the matching read, issue or write tool`)
      const cwd=exec.agent ? await ctx.workingDirectory.ensure(exec.agent,exec.signal):undefined
      if(['stage','commit','switch','fetch','push','mr_create','mr_merge'].includes(args.action) && args.confirm===true && !(args.action==='mr_merge'&&gitConfig.mergeAuthorization==='auto-reviewed')){
        // Runtime preview checks the configured ceiling before asking a human.
        const preview=await run({...args,confirm:false},exec.signal,cwd,exec)
        const approval=ctx.get('approval')
        if(!exec.agent || !approval)throw Error('not_confirmed: an interactive host approval is required')
        const outcome=await approval.request({agent:exec.agent,toolName:definition.name,callId:exec.callId,signal:exec.signal,reason:`Confirm Git operation: ${preview}`})
        if(outcome!=='allowed-once')throw Error(`not_confirmed: ${outcome}`)
      }
      const output=ctx.get('workbenchOutput')
      const value=await run(args,exec.signal,cwd,{...exec,write:(operation,identity)=>journal(identity,undefined,operation)}).catch(async error=>{throw Error(output?await output.bound(error.message,exec,definition.name):error.message)})
      return output?output.bound(value,exec,definition.name):value
    },
   }),{when:()=>ownership?.allows('git',name)??true})
  }
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-git', order: 420, interpolate: false, text: instructions }), 'Git usage')
}
