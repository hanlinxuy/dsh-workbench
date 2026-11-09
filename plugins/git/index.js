import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createGit } from './runtime.js'
export const name = 'workbench-git'
export const inject = ['tools', 'systemPrompt', 'workingDirectory']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')
export async function apply(ctx, config = {}) {
  const file = config.configFile ?? process.env.DSH_GIT_CONFIG
  const run = createGit(file ? JSON.parse(await readFile(file, 'utf8')) : config)
  ctx.tools.register(defineTool({
    name: 'workbench_git', timeoutMs: 65000,
    description: 'Use repository=current (or omit) to discover the active workspace and remote automatically. Configured repositories retain their policies. catalog; status/diff/branches(repository); log(repository,optional branch); remote_head(repository,remote,branch) reads actual remote branch hash; stage(repository,paths); commit(repository,message); switch(repository,branch); fetch(repository,remote); push(repository,remote,branch); repo_get/issues_list/issue_get/comments_list/issue_create/comment_create(repository,number,title,body,page). API writes and Git push are separately gated. External push is denied. Never retry uncertain writes automatically.',
    parameters: { action: { type: 'string', required: true }, repository: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' }, message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, number: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, page: { type: 'number' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async (args, exec) => run(args, exec.signal, exec.agent ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : undefined),
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-git', order: 420, interpolate: false, text: instructions }), 'Git usage')
}
