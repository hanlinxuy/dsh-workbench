import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, stat } from 'node:fs/promises'
import { memoryFields } from './memory.js'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { openStore } from './store.js'
import { createActivity, createLifecycle, startPolling } from './lifecycle.js'
import { createController } from './controller.js'
import { readResult, readSessionEvents } from './history.js'
import { restoreChiefPreset } from './chief-session.js'

export const name = 'independent-chief'
export const inject = ['tools', 'agents', 'systemPrompt', 'sessionController', 'sessions', 'sessionTitle', 'workspaceRegistry', 'connection', 'agentPresets']

export function apply(ctx, config = {}) {
  const directory = config.home ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'independent-chief')
  let controller
  let store
  let internalWorkspaceId
  let chiefSessionId = config.chiefSessionId
  let initialized = false
  let initError
  let activity
  let isStopped = () => true
  const storeEffect = createLifecycle(async stopped => {
    isStopped = stopped
    initialized = false
    initError = undefined
    const opened = await openStore(directory)
    let stopPolling
    const activeActivity = createActivity()
    activity = activeActivity
    try {
      store = opened
      chiefSessionId = opened.state.chiefSessionId ?? config.chiefSessionId
      for (const agent of ctx.agents.list()) installChiefTool(agent)
      const activeController = createController(opened, {
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
          const events = await readSessionEvents(ctx.sessionController, sessionId, AbortSignal.timeout(30000))
          return readResult(events, requestId)
        },
        async audit(sessionId, requestId) {
          const events = await readSessionEvents(ctx.sessionController, sessionId, AbortSignal.timeout(30000))
          let current, selected
          for (const event of events) {
            if (event.type === 'turn/start') current = []
            if (event.type === 'user/message' && event.data.source?.rpcId === requestId) selected = current
            if (current && event.type === 'tool/call') current.push({ type: 'call', name: event.data.name, arguments: event.data.arguments })
            if (current && event.type === 'tool/result' && event.data.message?.isError) current.push({ type: 'error', content: event.data.message.content })
            if (event.type === 'turn/end' && current === selected) return selected
          }
          throw new Error('No complete task audit found')
        },
        async inspectNotice(requestId) {
          const events = await readSessionEvents(ctx.sessionController, opened.state.chiefSessionId, AbortSignal.timeout(30000))
          const id = `chief-report:${requestId}`
          return events.some(event => event.type === 'user/message' && event.data.source?.rpcId === id || event.type === 'agent/inbox/spliced' && (event.data?.inserted ?? []).some(message => message.source?.rpcId === id))
        },
        async notify(project, job) {
          await ctx.sessionController.prompt({ sessionId: opened.state.chiefSessionId, requestId: `chief-report:${job.requestId}`, mode: 'queue', content: [{ type: 'text', text: `项目 ${project.name} 的任务已结束，状态 ${job.status}。调用 chief_project 的 list 和 read 获取完整结果，核对验收标准和 audit 轨迹，调用 review 持久化验收、阻碍及下一步，再简洁汇报；执行完成不等于验收通过。不要未经用户要求追加任务。` }] }, AbortSignal.timeout(30000))
        },
        async prompt(sessionId, requestId, text) {
          await ctx.sessionController.prompt({ sessionId, requestId, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30000))
        },
      })
      controller = activeController
      const previous = opened.state.chiefSessionId ?? config.chiefSessionId
      if (previous) {
        await restoreChiefPreset(ctx, previous)
        store.state.chiefSessionId = previous
        await store.save()
      } else {
        const root = join(directory, 'workspace')
        await mkdir(root, { recursive: true })
        const workspace = await ctx.workspaceRegistry.resolveByPath(root) ?? await ctx.workspaceRegistry.create(root, 'Chief')
        const created = await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'independent-chief' })
        chiefSessionId = created.sessionId
        const resolved = await ctx.sessionController.resolveAgent(created.sessionId)
        if (resolved.error) throw new Error(resolved.error.message)
        await ctx.sessionTitle.rename(resolved.agent.session, 'Chief')
        store.state.chiefSessionId = created.sessionId
        await store.save()
      }
      internalWorkspaceId = (await ctx.workspaceRegistry.resolveByPath(join(directory, 'workspace')))?.id
      // Recovery can enqueue a Chief turn. Restrict its tools before that turn
      // can start; readiness gates tool execution, never the deny-all scope.
      for (const agent of ctx.agents.list()) installChiefTool(agent)
      await activeController.recover()
      if (!stopped()) {
        initialized = true
        stopPolling = startPolling(async () => {
          for (const project of opened.state.projects) {
            if (stopped()) break
            try { await activeController.reconcile(project) }
            catch (error) { console.error('Chief result recovery failed:', error.message) }
          }
        }, error => console.error('Chief result recovery failed:', error.message))
      }
    } catch (error) {
      initialized = false
      await activeActivity.stop()
      controller = undefined
      store = undefined
      await opened.close().catch(closeError => console.error('Chief cleanup failed:', closeError.message))
      initError = error
      console.error('Chief initialization failed:', error.message)
      // Keep Chief fail-closed until its scope is disposed, even though its
      // failed initialization no longer owns the writer lease.
      return () => { chiefSessionId = undefined; releaseInstalled() }
    }
    return async () => {
      initialized = false
      const drained = activeActivity.stop()
      try {
        await Promise.all([drained, stopPolling?.()])
      } finally {
        controller = undefined
        store = undefined
        chiefSessionId = undefined
        try { releaseInstalled() } finally { await opened.close() }
      }
    }
  }, error => { initError = error; console.error('Chief initialization failed:', error.message) })
  ctx.effect(storeEffect, 'independent chief store')
  // A coordinator that sleeps in a shell blocks progress reports (observed in
  // the real-model regression). Work belongs in a project session instead.
  ctx.tools.guard(exec => chiefSessionId && exec.agent?.id === chiefSessionId && ['bash', 'powershell', 'job_output'].includes(exec.name)
    ? 'Chief coordinates projects without shell jobs. Dispatch work to a project, then finish this turn; completion notifications will arrive.'
    : undefined)
  const chiefTool = defineTool({
    name: 'chief_project',
    description: 'Manage projects: list; register(name,directory); remember(name, goal/priority/constraints/criteria/blockers/nextSteps, source); dispatch(name,text,criteria,maxChars); read(name,offset); audit(name,offset); review(name,verdict,evidence,blockers,nextSteps); select(name). Review verdict: accepted/needs_changes/blocked. Omitted memory fields are preserved. Only dispatch authorized work.',
    parameters: { action: { type: 'string', required: true }, name: { type: 'string' }, directory: { type: 'string' }, text: { type: 'string' }, offset: { type: 'number' }, maxChars: { type: 'number' }, ...Object.fromEntries(memoryFields.filter(key => key !== 'updatedAt').map(key => [key, { type: 'string' }])), verdict: { type: 'string' }, evidence: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      if (!initialized || isStopped()) throw new Error(initError ? `Chief initialization failed: ${initError.message}` : 'Chief is not ready')
      return activity.run(async () => {
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
      })
    },
  })
  const installed = new Map()
  const releaseInstalled = () => {
    const releases = [...installed.values()]
    installed.clear()
    const errors = []
    for (const release of releases) {
      try { release() } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new AggregateError(errors, 'Chief tool cleanup failed')
  }
  const installChiefTool = agent => {
    if (!chiefSessionId || agent.id !== chiefSessionId || installed.has(agent)) return
    const releaseTools = agent.ctx.tools.restrict({ allow: [] })
    let releaseChief
    try { releaseChief = agent.ctx.tools.register(chiefTool) }
    catch (error) { installed.set(agent, releaseTools); throw error }
    installed.set(agent, () => { try { releaseChief() } finally { releaseTools() } })
  }
  ctx.on('agent/created', ({ agent }) => installChiefTool(agent))
  ctx.on('agent/disposed', ({ agent }) => { installed.get(agent)?.(); installed.delete(agent) })
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
        if (!initialized || isStopped()) throw new Error(initError ? `Chief initialization failed: ${initError.message}` : 'Chief is not ready')
        return await activity.run(async () => {
          let value
          if (body.endpoint === 'open') {
            await restoreChiefPreset(ctx, store.state.chiefSessionId)
            value = { chiefSessionId: store.state.chiefSessionId }
          } else if (body.endpoint === 'state') value = store.state
          else if (body.endpoint === 'board') value = { ...controller.list(), chiefSessionId: store.state.chiefSessionId, internalWorkspaceId, route: store.state.route }
          else if (body.endpoint === 'command') value = await controller.command(body.payload.line, body.payload.sessionId)
          else throw new Error('Unknown endpoint')
          return new Response(JSON.stringify({ok:true,value}), {headers:{'content-type':'application/json'}})
        })
      } catch (error) { return new Response(JSON.stringify({ok:false,error:{message:error.message}}), {headers:{'content-type':'application/json'}}) }
    },
  }), 'independent chief route')
  ctx.on('session/event', (session, event) => {
    if (!controller || isStopped()) return
    if (session?.id === store.state.chiefSessionId && event.type === 'turn/start') controller.startTurn()
    const entries = event.type === 'user/message' ? [event.data] : event.type === 'agent/inbox/spliced' ? event.data?.inserted ?? [] : []
    if (event.type === 'turn/end') {
      const project = store.state.projects.find(p => p.sessionId === session?.id)
      if (project) void activity.run(() => controller.reconcile(project)).catch(error => console.error('Chief result recovery failed:', error.message))
    }
    for (const entry of entries) {
      if (entry.source?.kind && entry.source.kind !== 'user') continue
      const id = entry.source?.rpcId ?? entry.id
      const project = store.state.projects.find(p => p.sessionId === session?.id)
      if (!id || !project || project.job?.requestId === id || !Array.isArray(entry.content)) continue
      void activity.run(() => controller.takeover(session.id, id, event.time)).catch(error => console.error('Chief takeover save failed:', error.message))
    }
  })
}
