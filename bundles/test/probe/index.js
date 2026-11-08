import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
export const inject = ['tools', 'llm', 'systemPrompt', 'pluginManager', 'connection', 'sessionController', 'workspaceRegistry', 'agentPresets', 'clientModules']
export function apply(ctx) {
  let sessionId
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/workbench-suite-test', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const run = async () => {
        const body = await request.json()
        if (body.action === 'toggle') return ctx.pluginManager.setPluginEnabled(body.id, body.enabled)
        if (body.action === 'bundle') return ctx.pluginManager.setBundleEnabled(body.name, body.enabled)
        const directory = join(process.env.DSH_HOME, 'suite-project')
        await mkdir(directory, { recursive: true })
        const workspace = await ctx.workspaceRegistry.resolveByPath(directory) ?? await ctx.workspaceRegistry.create(directory)
        sessionId ??= (await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'standard' })).sessionId
        const { agent } = await ctx.sessionController.resolveAgent(sessionId)
        const call = async (name, args, scope = agent) => {
          const result = await ctx.tools.execute({ name, arguments: args, agent: scope, callId: `suite-${Date.now()}`, signal: AbortSignal.timeout(60000) })
          if (result.isError) throw new Error(JSON.stringify(result))
          return result.value ?? result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
        }
        if (body.action === 'call') return call(body.name, body.args)
        if (body.action === 'seed') {
          const state = JSON.parse(await readFile(join(process.env.DSH_HOME, 'independent-chief/state.json'), 'utf8'))
          const { agent: chief } = await ctx.sessionController.resolveAgent(state.chiefSessionId)
          if (!state.projects.some(p => p.name === 'Suite acceptance')) await call('chief_project', { action: 'register', name: 'Suite acceptance', directory }, chief)
          await call('chief_project', { action: 'remember', name: 'Suite acceptance', source: 'suite regression', goal: 'SUITE_MEMORY_PRESERVED', blockers: 'test blocker', nextSteps: 'test next step' }, chief)
          return state.chiefSessionId
        }
        const prompt = await ctx.systemPrompt.assemble({ scope: agent, agent })
        return {
          tools: ['workbench_browser', 'workbench_desktop', 'workbench_git'].filter(name => ctx.tools.get(name, agent)),
          sections: prompt.sections.map(s => s.name),
          providers: ctx.llm.listProviders().map(p => p.id ?? p.provider ?? p.name),
          presets: (await ctx.agentPresets.list()).map(p => p.id),
          clients: ctx.clientModules.graph().entries.map(e => ({ id: e.id, name: e.name })),
          plugins: (await ctx.pluginManager.listPlugins()).filter(p => /chief|workbench|chatgpt/.test(p.moduleName)).map(p => ({ id: p.entryId, module: p.moduleName, enabled: p.enabled, phase: p.fiberPhase })),
        }
      }
      return run().then(value => Response.json({ ok: true, value }), error => Response.json({ ok: false, error: error.message }))
    },
  }), 'suite regression endpoint')
}
