import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createDesktop } from './runtime.js'
export const name = 'workbench-desktop'
export const inject = ['tools', 'systemPrompt']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')
export function apply(ctx, config = {}) {
  const run = createDesktop({ home: config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'workbench-desktop'), headed: config.headed === true })
  ctx.tools.register(defineTool({
    name: 'workbench_desktop', timeoutMs: 50000,
    description: 'Operate native desktop apps with agent-desktop. Actions: version/status/permissions/guide/apps; windows/snapshot(app); get(ref, optional property); click/check/uncheck(ref); fill/type/select(ref,value); press(app,value key combo). Observe current refs and verify effects. Web tasks use workbench_browser. OS desktop is shared even with isolated DSH profiles.',
    parameters: { action: { type: 'string', required: true }, app: { type: 'string' }, ref: { type: 'string' }, value: { type: 'string' }, property: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: (args, exec) => run(args, { signal: exec.signal, scope: exec.agent?.id }),
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-desktop', order: 410, interpolate: false, text: instructions }), 'Desktop usage')
}
