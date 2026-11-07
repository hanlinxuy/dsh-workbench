import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
export const inject = ['tools', 'sessionController', 'workspaceRegistry']
export function apply(ctx) {
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      const home = process.env.DSH_HOME
      const report = join(home, 'browser-host-probe.json')
      const check = async () => {
        const directory = join(home, 'probe-project')
        await mkdir(directory, { recursive: true })
        const workspace = await ctx.workspaceRegistry.resolveByPath(directory) ?? await ctx.workspaceRegistry.create(directory)
        const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'standard' })
        const { agent } = await ctx.sessionController.resolveAgent(sessionId)
        assert.ok(ctx.tools.get('workbench_browser', agent), 'browser available to project')
        const state = JSON.parse(await readFile(join(home, 'independent-chief/state.json'), 'utf8'))
        const { agent: chief } = await ctx.sessionController.resolveAgent(state.chiefSessionId)
        assert.ok(ctx.tools.get('chief_project', chief), 'Chief ready')
        assert.equal(ctx.tools.get('workbench_browser', chief), undefined, 'Chief remains coordinator')
        const call = async arguments_ => {
          const result = await ctx.tools.execute({ name: 'workbench_browser', arguments: arguments_, agent,
            callId: `probe-${Date.now()}`, signal: AbortSignal.timeout(60000) })
          assert.ok(!result.isError, JSON.stringify(result))
          return JSON.stringify(result)
        }
        assert.match(await call({ action: 'version' }), /0\.41\.2/)
        await call({ action: 'open', target: 'data:text/html,<h1>DSH_BROWSER_HOST_OK</h1><button>Probe</button>' })
        assert.match(await call({ action: 'snapshot' }), /Probe/)
        assert.match(await call({ action: 'text' }), /DSH_BROWSER_HOST_OK/)
        await call({ action: 'close' })
        return { pass: true, sessionId, chiefId: state.chiefSessionId, version: '0.41.2', checks: ['project tool available', 'Chief restricted', 'host dispatch', 'open', 'snapshot', 'read', 'close'] }
      }
      await check().then(result => writeFile(report, JSON.stringify(result, null, 2)), error => writeFile(report, JSON.stringify({ pass: false, error: error.message }, null, 2)))
    }, 4000)
    return () => clearTimeout(timer)
  }, 'isolated browser integration probe')
}
