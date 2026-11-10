import { dirname } from 'node:path'
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
  const exec = async (file, args, options = {}) => {
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
  const run = createGit(file ? JSON.parse(await readFile(file, 'utf8')) : config, exec, connectionPolicy(dirname(ctx.configEditor.documentPath)))
  ctx.tools.register(defineTool({
    name: 'workbench_git', timeoutMs: 65000,
    description: 'Use repository=current (or omit) to discover the active workspace and remote automatically. Configured repositories retain their policies. catalog; status/diff/branches(repository); log(repository,optional branch); remote_head(repository,remote,branch) reads actual remote branch hash; stage(repository,paths); commit(repository,message); switch(repository,branch); fetch(repository,remote); push(repository,remote,branch); repo_get/issues_list/issue_get/comments_list/issue_create/comment_create(repository,number,title,body,page). GitLab mr_list/mr_get/mr_comments_list(repository,number,page); mr_create(repository,title,body,source_branch,target_branch); mr_comment(repository,number,body); mr_merge(repository,number,target_branch). MR writes require internal GitLab and explicit apiWrites; merge additionally requires the repository mergeTargetBranches exact allowlist, checked against the actual MR. API writes and Git push are separately gated. External push and MR merge are denied. Never retry uncertain writes automatically.',
    parameters: { action: { type: 'string', required: true }, repository: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' }, message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, number: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, page: { type: 'number' }, source_branch: { type: 'string' }, target_branch: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => run(args, exec.signal, exec.agent ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : undefined),
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-git', order: 420, interpolate: false, text: instructions }), 'Git usage')
}
