import { readFile } from 'node:fs/promises'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createGit } from './runtime.js'
export const name = 'workbench-git'
export const inject = ['tools', 'systemPrompt']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')
export async function apply(ctx, config = {}) {
  const file = config.configFile ?? process.env.DSH_GIT_CONFIG
  const run = createGit(file ? JSON.parse(await readFile(file, 'utf8')) : config)
  ctx.tools.register(defineTool({
    name: 'workbench_git', timeoutMs: 65000,
    description: 'Configured Git repositories/platforms only. catalog; status/diff/log/branches(repository); stage(repository,paths); commit(repository,message); switch(repository,branch); fetch(repository,remote); push(repository,remote,branch); repo_get/issues_list/issue_get/comments_list/issue_create/comment_create(repository,number,title,body,page). API writes and Git push are separately gated. External push is denied. Never retry uncertain writes automatically.',
    parameters: { action: { type: 'string', required: true }, repository: { type: 'string' }, remote: { type: 'string' }, branch: { type: 'string' }, message: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, number: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, page: { type: 'number' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: (args, exec) => run(args, exec.signal),
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-git', order: 420, interpolate: false, text: instructions }), 'Git usage')
}
