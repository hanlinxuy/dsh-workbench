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
  // Use the host's managed subprocess provider, including cancellation and
  // scrubbed environment. Never forward all of process.env back into it.
  const execHost = async (file, args, options = {}) => {
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeout ?? 60000), ...(options.signal ? [options.signal] : [])])
    const child = ctx.subprocess.spawn({ argv: [file, ...args], cwd: options.cwd ?? process.cwd(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: options.maxBuffer ?? 2097152 }, stderr: { maxBytes: 65536 } },
      graceMs: 1000, signal, env: options.env })
    const outcome = await child.done
    const stdout = child.collected.stdout.readFrom(0)
    if (outcome.exitCode !== 0 || signal.aborted || stdout.lossy) {
      const error = new Error('Host subprocess failed or output exceeded limit')
      error.code = outcome.exitCode
      throw error
    }
    return { stdout: stdout.text }
  }

  const file = config.configFile ?? process.env.DSH_GIT_CONFIG
  const gitConfig=file ? JSON.parse(await readFile(file, 'utf8')) : config
  const policy=connectionPolicy(dirname(ctx.configEditor.documentPath))
  const journal=createWriteJournal(join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit'))
  const run=createGit(gitConfig,execHost,policy,async(authorization,actual,signal,exec)=>{
    const evidence=await authorizeMerge({mode:gitConfig.mergeAuthorization??'user-confirmed',authorization,actual,sessionId:exec.agent?.id,controller:ctx.get('sessionController'),reviewer:ctx.get('workbenchGitReview'),signal})
    const directory=join(dirname(ctx.configEditor.documentPath),'.workbench-private','audit')
    await mkdir(directory,{recursive:true,mode:0o700})
    await appendFile(join(directory,'merge.ndjson'),JSON.stringify({at:new Date().toISOString(),...evidence})+'\n',{mode:0o600})
  })
  ctx.tools.register(defineTool({
    name: 'workbench_git', timeoutMs: 65000,
    description: 'Use repository=current (or omit) to discover the active workspace and remote automatically. Configured repositories retain their policies. catalog; status/diff/branches(repository); log(repository,optional branch); remote_head(repository,remote,branch) reads actual remote branch hash; stage(repository,paths); commit(repository,message); switch(repository,branch); fetch(repository,remote); push(repository,remote,branch); repo_get/issues_list/issue_get/comments_list/issue_create/comment_create(repository,number,title,body,page). GitLab mr_list/mr_get/mr_comments_list(repository,number,page); mr_create(repository,title,body,source_branch,target_branch); mr_comment(repository,number,body); mr_merge(repository,number,target_branch). MR writes require internal GitLab and apiWrites; merge needs mergeTargetBranches and authorization: user-confirmed(quote,sourceSeq) or auto-reviewed(reviewId), selected by operator config. API writes and Git push are separately gated. External push and MR merge are denied. Write actions default to preview (zero remote requests). confirm=true requests one-time host approval; it cannot grant itself permission. Never retry uncertain writes.',
    parameters: { authorization:{type:'object',properties:{mode:{type:'string'},quote:{type:'string'},sourceSeq:{type:'number'},reviewId:{type:'string'}}}, confirm:{type:'boolean'}, action: { type: 'string', required: true }, repository: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' }, message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, number: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, page: { type: 'number' }, source_branch: { type: 'string' }, target_branch: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => {
      const cwd=exec.agent ? await ctx.workingDirectory.ensure(exec.agent,exec.signal):undefined
      if(['stage','commit','switch','fetch','push','mr_create','mr_merge'].includes(args.action) && args.confirm===true && !(args.action==='mr_merge'&&gitConfig.mergeAuthorization==='auto-reviewed')){
        // Runtime preview checks the configured ceiling before asking a human.
        const preview=await run({...args,confirm:false},exec.signal,cwd,exec)
        const approval=ctx.get('approval')
        if(!exec.agent || !approval)throw Error('not_confirmed: an interactive host approval is required')
        const outcome=await approval.request({agent:exec.agent,toolName:'workbench_git',callId:exec.callId,signal:exec.signal,reason:`Confirm Git operation: ${preview}`})
        if(outcome!=='allowed-once')throw Error(`not_confirmed: ${outcome}`)
      }
      const writes=['stage','commit','switch','fetch','push','issue_create','comment_create','mr_create','mr_comment','mr_merge']
      if(!writes.includes(args.action) || args.confirm!==true && !['issue_create','comment_create','mr_comment'].includes(args.action))return run(args,exec.signal,cwd,exec)
      return journal(args,cwd,()=>run(args,exec.signal,cwd,exec))
    },
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-git', order: 420, interpolate: false, text: instructions }), 'Git usage')
}
