import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createBrowser } from './runtime.js'

export const name = 'workbench-browser'
export const inject = ['tools', 'systemPrompt','credentials']
const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8')

export function apply(ctx, config = {}) {
  const run = createBrowser({
    home: config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'workbench-browser'),
    executablePath: config.executablePath ?? process.env.DSH_BROWSER_EXECUTABLE,
    accounts:config.accounts,sites:config.sites,credentials:ctx.credentials,
    headed: config.headed ?? process.env.DSH_BROWSER_HEADED === '1',
  })
  ctx.tools.register(defineTool({
    name: 'workbench_browser',
    timeoutMs: 65000,
    description: 'Use agent-browser with a persistent named login account. Actions: open(target URL), snapshot, click(target ref), fill(target ref,value), select(target ref,value), press(target key), text(optional target), url, wait(target selector), back, close, version. Configured site routes choose their account; pass site to use one. Explicit account is for unconfigured sites. Refresh snapshot after navigation. Closing preserves login. Configured sites support capture/restore of scoped cookies via the host credential store; never return cookie values. open accepts HTTP(S) only. JavaScript eval/evaluate is unavailable, including with confirm=true; use snapshot/text/url for supported reads.',
    parameters: {
      action: { type: 'string', required: true },
      account: { type: 'string' },
      site: { type: 'string' },
      target: { type: 'string' },
      value: { type: 'string' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: (args, exec) => run(args, exec.signal),
  }))
  ctx.effect(() => ctx.systemPrompt.section({ name: 'workbench-browser', order: 400, interpolate: false, text: instructions }), 'Browser usage')
}
