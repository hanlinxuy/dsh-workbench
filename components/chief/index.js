import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, stat } from 'node:fs/promises'
import { memoryFields } from './memory.js'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { openStore } from './store.js'
import { createController } from './controller.js'
import { readResult } from './history.js'
import { restoreChiefPreset } from './chief-session.js'

export const name = 'independent-chief'
export const inject = ['tools', 'agents', 'systemPrompt', 'sessionController', 'sessions', 'sessionTitle', 'workspaceRegistry', 'connection', 'agentPresets']

export function apply(ctx, config = {}) {
  const directory = config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'independent-chief')
  let controller
  let store
  let internalWorkspaceId
  let initialized = false
  let initError
  ctx.effect(() => {
    const ready = openStore(directory).then(async opened => {
      store = opened
      controller = createController(store, {
        async createSession(name, path) {
          if (!(await stat(path)).isDirectory()) throw new Error('Project path is not a directory')
          const workspace = await ctx.workspaceRegistry.resolveByPath(path) ?? await ctx.workspaceRegistry.create(path)
          const presets = ctx.get?.('agentPresets')
          const standard = presets && (await presets.list()).some(p => p.id === 'standard' && p.broken === undefined)
          const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id, ...(standard ? { agentPreset: 'standard' } : {}) })
          const resolved = await ctx.sessionController.resolveAgent(sessionId)
          if (resolved.error) throw new Error(resolved.error.message)
          await ctx.sessionTitle.rename(resolved.agent.session, name)
          return sessionId
        },
        async inspect(sessionId, requestId) {
          const snapshot = await ctx.sessionController.inspect(sessionId, AbortSignal.timeout(30000))
          return readResult(snapshot.events, requestId)
        },
        async audit(sessionId, requestId) {
          const snapshot = await ctx.sessionController.inspect(sessionId, AbortSignal.timeout(30000))
          let current, selected
          for (const event of snapshot.events) {
            if (event.type === 'turn/start') current = []
            if (event.type === 'user/message' && event.data.source?.rpcId === requestId) selected = current
            if (current && event.type === 'tool/call') current.push({ type: 'call', name: event.data.name, arguments: event.data.arguments })
            if (current && event.type === 'tool/result' && event.data.message?.isError) current.push({ type: 'error', content: event.data.message.content })
            if (event.type === 'turn/end' && current === selected) return selected
          }
          throw new Error('No complete task audit found')
        },
        async inspectNotice(requestId) {
          const snapshot = await ctx.sessionController.inspect(store.state.chiefSessionId, AbortSignal.timeout(30000))
          const id = `chief-report:${requestId}`
          return snapshot.events.some(event => event.type === 'user/message' && event.data.source?.rpcId === id || event.type === 'agent/inbox/spliced' && (event.data?.inserted ?? []).some(message => message.source?.rpcId === id))
        },
        async notify(project, job) {
          await ctx.sessionController.prompt({ sessionId: store.state.chiefSessionId, requestId: `chief-report:${job.requestId}`, mode: 'queue', content: [{ type: 'text', text: `项目 ${project.name} 的任务已结束，状态 ${job.status}。调用 chief_project 的 list 和 read 获取完整结果，核对验收标准和 audit 轨迹，调用 review 持久化验收、阻碍及下一步，再简洁汇报；执行完成不等于验收通过。不要未经用户要求追加任务。` }] }, AbortSignal.timeout(30000))
        },
        async prompt(sessionId, requestId, text) {
          await ctx.sessionController.prompt({ sessionId, requestId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30000))
        },
      })
      const previous = store.state.chiefSessionId ?? config.chiefSessionId
      if (previous) {
        await restoreChiefPreset(ctx, previous)
        store.state.chiefSessionId = previous
        await store.save()
      } else {
        const root = join(directory, 'workspace')
        await mkdir(root, { recursive: true })
        const workspace = await ctx.workspaceRegistry.resolveByPath(root) ?? await ctx.workspaceRegistry.create(root, 'Chief')
        const created = await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'independent-chief' })
        const resolved = await ctx.sessionController.resolveAgent(created.sessionId)
        if (resolved.error) throw new Error(resolved.error.message)
        await ctx.sessionTitle.rename(resolved.agent.session, 'Chief')
        store.state.chiefSessionId = created.sessionId
        await store.save()
      }
      internalWorkspaceId = (await ctx.workspaceRegistry.resolveByPath(join(directory, 'workspace')))?.id
      await controller.recover()
      initialized = true
      for (const agent of ctx.agents.list()) installChiefTool(agent)
    }).catch(error => { initError = error; console.error('Chief initialization failed:', error.message) })
    return async () => { await ready; if (store) await store.close() }
  }, 'independent chief store')
  ctx.effect(() => {
    let stopped = false
    let timer
    const poll = async () => {
      if (initialized) {
        for (const project of store.state.projects) {
          try { await controller.reconcile(project) }
          catch (error) { console.error('Chief result recovery failed:', error.message) }
        }
      }
      if (!stopped) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, 'independent chief recovery polling')
  // A coordinator that sleeps in a shell blocks progress reports (observed in
  // the real-model regression). Work belongs in a project session instead.
  ctx.tools.guard(exec => store?.state.chiefSessionId && exec.agent?.id === store.state.chiefSessionId && ['bash', 'powershell', 'job_output'].includes(exec.name)
    ? 'Chief coordinates projects without shell jobs. Dispatch work to a project, then finish this turn; completion notifications will arrive.'
    : undefined)
  const chiefTool = defineTool({
    name: 'chief_project',
    description: 'Manage projects: list; register(name,directory); remember(name, goal/priority/constraints/criteria/blockers/nextSteps, source); dispatch(name,text,criteria,maxChars); read(name,offset); audit(name,offset); review(name,verdict,evidence,blockers,nextSteps); select(name). Review verdict: accepted/needs_changes/blocked. Omitted memory fields are preserved. Only dispatch authorized work.',
    parameters: { action: { type: 'string', required: true }, name: { type: 'string' }, directory: { type: 'string' }, text: { type: 'string' }, offset: { type: 'number' }, maxChars: { type: 'number' }, ...Object.fromEntries(memoryFields.filter(key => key !== 'updatedAt').map(key => [key, { type: 'string' }])), verdict: { type: 'string' }, evidence: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      if (!initialized) throw new Error(initError ? `Chief initialization failed: ${initError.message}` : 'Chief is not ready')
      if (exec.agent?.id !== store.state.chiefSessionId) throw new Error('Only the configured Chief can manage projects')
      if (args.action === 'list') { return JSON.stringify(controller.list()) }
      if (args.action === 'read') return JSON.stringify(controller.read(args.name, args.offset))
      if (args.action === 'register') return JSON.stringify(await controller.register(args.name, args.directory))
      if (args.action === 'remember') return JSON.stringify(await controller.remember(args.name, Object.fromEntries(memoryFields.filter(key => key !== 'updatedAt' && args[key] !== undefined).map(key => [key, args[key]]))))
      if (args.action === 'audit') return JSON.stringify(await controller.audit(args.name, args.offset))
      if (args.action === 'review') return JSON.stringify(await controller.review(args.name, args))
      if (args.action === 'dispatch') return JSON.stringify(await controller.dispatch(args.name, args.text, { criteria: args.criteria, maxChars: args.maxChars }))
      if (args.action === 'select') return JSON.stringify(await controller.command(`/switch ${args.name}`, store.state.chiefSessionId))
      throw new Error('Unknown project action')
    },
  })
  const installed = new Map()
  const installChiefTool = agent => {
    if (!initialized || agent.id !== store.state.chiefSessionId || installed.has(agent)) return
    const releaseTools = agent.ctx.tools.restrict({ allow: [] })
    const releaseChief = agent.ctx.tools.register(chiefTool)
    installed.set(agent, () => { releaseChief(); releaseTools() })
  }
  ctx.on('agent/created', ({ agent }) => installChiefTool(agent))
  ctx.on('agent/disposed', ({ agent }) => { installed.get(agent)?.(); installed.delete(agent) })
  ctx.effect(() => () => { for (const dispose of installed.values()) dispose(); installed.clear() }, 'Chief scoped tool')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'independent-chief', order: 650, interpolate: false,
    text: context => store?.state.chiefSessionId && context?.agent?.id === store.state.chiefSessionId
      ? '' : 'Project coordination is available through Chief 管家 in the sidebar. For requests to switch projects or manage other sessions, direct the user to that entry or /home. Do not inspect files or run shell commands to work around project-routing permissions.',
  }), 'independent chief prompt')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/independent-chief', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const body = await request.json()
        if (!initialized) throw new Error(initError ? `Chief initialization failed: ${initError.message}` : 'Chief is not ready')
        let value
        if (body.endpoint === 'open') {
          await restoreChiefPreset(ctx, store.state.chiefSessionId)
          value = { chiefSessionId: store.state.chiefSessionId }
        } else if (body.endpoint === 'state') value = store.state
        else if (body.endpoint === 'board') value = { ...controller.list(), chiefSessionId: store.state.chiefSessionId, internalWorkspaceId, route: store.state.route }
        else if (body.endpoint === 'command') value = await controller.command(body.payload.line, body.payload.sessionId)
        else throw new Error('Unknown endpoint')
        return new Response(JSON.stringify({ok:true,value}), {headers:{'content-type':'application/json'}})
      } catch (error) { return new Response(JSON.stringify({ok:false,error:{message:error.message}}), {headers:{'content-type':'application/json'}}) }
    },
  }), 'independent chief route')
  ctx.on('session/event', (session, event) => {
    if (!controller) return
    if (session?.id === store.state.chiefSessionId && event.type === 'turn/start') controller.startTurn()
    const entries = event.type === 'user/message' ? [event.data] : event.type === 'agent/inbox/spliced' ? event.data?.inserted ?? [] : []
    if (event.type === 'turn/end') {
      const project = store.state.projects.find(p => p.sessionId === session?.id)
      if (project) void controller.reconcile(project).catch(error => console.error('Chief result recovery failed:', error.message))
    }
    for (const entry of entries) {
      if (entry.source?.kind && entry.source.kind !== 'user') continue
      const id = entry.source?.rpcId ?? entry.id
      const project = store.state.projects.find(p => p.sessionId === session?.id)
      if (!id || !project || project.job?.requestId === id || !Array.isArray(entry.content)) continue
      void controller.takeover(session.id, id, event.time).catch(error => console.error('Chief takeover save failed:', error.message))
    }
  })
}
