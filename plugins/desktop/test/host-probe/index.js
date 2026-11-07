import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scenario } from './scenario.js'
export const inject = ['tools', 'sessionController', 'workspaceRegistry']
export function apply(ctx) {
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      const home = process.env.DSH_HOME
      const check = async () => {
        const directory = join(home, 'probe-project')
        await mkdir(directory, { recursive: true })
        const workspace = await ctx.workspaceRegistry.resolveByPath(directory) ?? await ctx.workspaceRegistry.create(directory)
        const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'standard' })
        const { agent } = await ctx.sessionController.resolveAgent(sessionId)
        for (const name of ['workbench_desktop', 'workbench_git']) assert.ok(ctx.tools.get(name, agent), `${name} visible in project`)
        const state = JSON.parse(await readFile(join(home, 'independent-chief/state.json'), 'utf8'))
        const { agent: chief } = await ctx.sessionController.resolveAgent(state.chiefSessionId)
        assert.ok(ctx.tools.get('chief_project', chief))
        for (const name of ['workbench_desktop', 'workbench_git']) assert.equal(ctx.tools.get(name, chief), undefined)
        const call = async (name, arguments_) => {
          const result = await ctx.tools.execute({ name, arguments: arguments_, agent, callId: `probe-${Date.now()}`, signal: AbortSignal.timeout(60000) })
          assert.ok(!result.isError, JSON.stringify(result))
          // ToolResult keeps its typed output in value; content is its text rendering.
          const text = result.value ?? result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n')
          assert.equal(typeof text, 'string', JSON.stringify(result))
          return text
        }
        const catalog = await call('workbench_git', { action: 'catalog' })
        assert.match(catalog, /repositories/)
        const status = await call('workbench_git', { action: 'status', repository: 'fixture' })
        assert.match(status, /main/)
        await writeFile(join(home, 'git-host-probe.json'), JSON.stringify({ pass: true, checks: ['project tool available', 'Chief restriction', 'catalog', 'status'] }, null, 2))
        const desktop = await scenario(args => call('workbench_desktop', args))
        return { pass: true, desktop, git: ['catalog', 'status'], chiefId: state.chiefSessionId, sessionId, scope: 'host tool execution, not model planning' }
      }
      await check().then(result => writeFile(join(home, 'desktop-host-probe.json'), JSON.stringify(result, null, 2)), error => writeFile(join(home, 'desktop-host-probe.json'), JSON.stringify({ pass: false, error: error.message }, null, 2)))
    }, 4000)
    return () => clearTimeout(timer)
  }, 'isolated desktop/Git integration probe')
}
