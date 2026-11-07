import { randomUUID, createHash } from 'node:crypto'
import { register, take, resume, dispatch } from './state.js'
import { emptyMemory, memoryFields } from './memory.js'

// Host I/O is injected so the same rules run with a DSH adapter or a test host.
export function createController(store, host) {
  const { state } = store
  const reads = new Map()
  const audits = new Map()
  const find = name => {
    const query = name.trim().toLocaleLowerCase()
    const exact = state.projects.filter(p => p.name.toLocaleLowerCase() === query)
    const matches = exact.length ? exact : state.projects.filter(p => p.name.toLocaleLowerCase().includes(query))
    if (!query || matches.length !== 1) throw new Error('Choose one unambiguous project')
    return matches[0]
  }
  return {
    state,
    startTurn() { reads.clear(); audits.clear() },
    list() {
      const events = []
      const projects = state.projects.map(project => {
        const job = project.job
        const memory = store.memory?.get(project.id) ?? emptyMemory()
        const acceptance = job ? store.memory?.review(job.requestId) ?? { verdict: 'pending' } : null
        if (!job) return { ...project, memory, acceptance, job: null }
        const { prompt, text, ...summary } = job
        const timing = {}
        let takeoverStatement = `${project.name}：当前记录没有可比较的桌面接手和任务完成事件；不能推断此前是否接手。`
        if (Number.isFinite(job.submittedAt) && Number.isFinite(job.finishedAt) && job.finishedAt >= job.submittedAt) timing.durationMs = job.finishedAt - job.submittedAt
        if (Number.isFinite(job.submittedAt)) events.push({ project: project.name, event: 'submitted', at: job.submittedAt })
        if (Number.isFinite(job.finishedAt)) events.push({ project: project.name, event: 'finished', at: job.finishedAt })
        if (project.controlReason === 'Desktop user message' && Number.isFinite(project.controlChangedAt) && Number.isFinite(job.submittedAt) && project.controlChangedAt >= job.submittedAt) {
          events.push({ project: project.name, event: 'desktop_takeover', at: project.controlChangedAt })
          timing.takeoverAfterSubmitMs = project.controlChangedAt - job.submittedAt
          if (Number.isFinite(job.finishedAt) && job.finishedAt >= project.controlChangedAt) timing.finishedAfterTakeoverMs = job.finishedAt - project.controlChangedAt
          if (Number.isFinite(job.finishedAt)) {
            timing.takeoverVsFinish = project.controlChangedAt < job.finishedAt ? 'before' : project.controlChangedAt > job.finishedAt ? 'after' : 'same_time'
            takeoverStatement = `${project.name}：最近记录的桌面接手${timing.takeoverVsFinish === 'before' ? '早于当前任务完成' : timing.takeoverVsFinish === 'after' ? '晚于当前任务完成' : '与当前任务完成时间相同，无法判断先后'}。`
          }
        }
        const receipt = reads.get(project.id)
        const readThisTurn = receipt?.requestId === job.requestId ? { chars: receipt.chars, complete: receipt.complete } : { chars: 0, complete: false }
        return { ...project, memory, acceptance, job: { ...summary, resultLength: text?.length ?? 0, timing, takeoverStatement, readThisTurn } }
      })
      events.sort((a, b) => a.at - b.at)
      return { projects, timeline: events, memoryDirectory: store.memory?.directory, memoryError: store.memory?.error ?? null, timelineNote: 'Only recorded current-job and latest desktop takeover events are included; equal timestamps do not establish order.' }
    },
    read(name, offset = 0) {
      const project = find(name)
      const job = project.job
      if (!job || typeof job.text !== 'string') return { text: '', next: null, status: job?.status ?? 'none', readThisTurn: { chars: 0, complete: false } }
      if (!Number.isInteger(offset) || offset < 0 || offset > job.text.length) throw new Error('Invalid report offset')
      const text = job.text.slice(offset, offset + 6000)
      const next = offset + text.length < job.text.length ? offset + text.length : null
      let receipt = reads.get(project.id)
      if (!receipt || receipt.requestId !== job.requestId || offset === 0) receipt = { requestId: job.requestId, chars: 0, complete: false }
      if (offset === receipt.chars && text.length) receipt.chars += text.length
      receipt.complete = job.text.length > 0 && receipt.chars === job.text.length
      reads.set(project.id, receipt)
      const { projects, timeline, timelineNote } = this.list()
      return { text, next, status: job.status, readThisTurn: { chars: receipt.chars, complete: receipt.complete }, current: projects.find(p => p.id === project.id), timeline, timelineNote }
    },
    async register(name, directory) {
      if (state.projects.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Project already exists')
      const sessionId = await host.createSession(name, directory)
      register(state, { id: randomUUID(), name, directory, sessionId })
      await store.save()
      return sessionId
    },
    async audit(name, offset = 0) {
      const project = find(name)
      if (!project.job) throw new Error('No task to audit')
      if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid audit offset')
      const events = await host.audit(project.sessionId, project.job.requestId)
      let receipt = audits.get(project.id)
      if (!receipt || receipt.requestId !== project.job.requestId || offset === 0) receipt = { requestId: project.job.requestId, count: 0, complete: false }
      if (offset === receipt.count) receipt.count += events.slice(offset, offset + 20).length
      receipt.complete = receipt.count === events.length
      audits.set(project.id, receipt)
      return { events: events.slice(offset, offset + 20), next: offset + 20 < events.length ? offset + 20 : null, requestId: project.job.requestId }
    },
    async remember(name, patch) {
      const project = find(name)
      if (!store.memory) throw new Error('Memory store unavailable')
      const keys = Object.keys(patch)
      if (!keys.length || keys.some(key => !memoryFields.includes(key) || key === 'updatedAt' || typeof patch[key] !== 'string' || patch[key].length > 12000)) throw new Error('Invalid memory fields')
      if (!patch.source?.trim()) throw new Error('Memory source is required')
      return store.memory.update(project, patch)
    },
    async review(name, { verdict, evidence, blockers, nextSteps }) {
      const project = find(name)
      const job = project.job
      if (!['accepted', 'needs_changes', 'blocked'].includes(verdict) || typeof evidence !== 'string' || !evidence.trim() || evidence.length > 12000 || typeof blockers !== 'string' || typeof nextSteps !== 'string' || blockers.length > 12000 || nextSteps.length > 12000) throw new Error('Review requires verdict, evidence, blockers and nextSteps')
      if (!job || !['completed', 'failed'].includes(job.status)) throw new Error('Task has not finished')
      if (job.text && !this.list().projects.find(p => p.id === project.id).job.readThisTurn.complete) throw new Error('Read the complete report in this turn before reviewing')
      if (verdict === 'accepted' && (job.status !== 'completed' || !job.criteria?.trim() || job.maxChars && job.text.length > job.maxChars)) throw new Error('Acceptance failed: unsuccessful execution, missing criteria or report length exceeded')
      if (verdict === 'accepted' && (!audits.get(project.id)?.complete || audits.get(project.id)?.requestId !== job.requestId)) throw new Error('Read the complete tool audit in this turn before accepting')
      const record = { requestId: job.requestId, verdict, criteria: job.criteria ?? '', evidence, blockers, nextSteps, reportSha256: createHash('sha256').update(job.text ?? '').digest('hex'), reviewedAt: new Date().toISOString() }
      await store.memory.update(project, { blockers, nextSteps, source: `Review ${job.requestId}: ${evidence}` }, record)
      return { ...record, reviewer: 'Chief model; evidence is not independent proof' }
    },
    async dispatch(name, text, { criteria, maxChars } = {}) {
      const project = find(name)
      const requestId = randomUUID()
      if (criteria !== undefined && (typeof criteria !== 'string' || !criteria.trim() || criteria.length > 12000)) throw new Error('Invalid acceptance criteria')
      if (maxChars !== undefined && (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 100000)) throw new Error('Invalid maxChars')
      const memory = store.memory?.get(project.id) ?? emptyMemory()
      criteria = criteria ?? memory.criteria
      const prompt = `${text}\n\nProject goal: ${memory.goal || 'Not recorded'}\nConstraints: ${memory.constraints || 'Follow the user request and project rules'}\nAcceptance criteria: ${criteria || 'Not recorded; cannot mark accepted until criteria are provided'}${maxChars ? `\nReport limit: ${maxChars} UTF-16 code units.` : ''}`
      dispatch(project, { requestId, prompt, criteria, ...(maxChars ? { maxChars } : {}) })
      project.seen.push(requestId)
      await store.save()
      // A user may take over while the initial save is pending.
      if (project.owner !== 'chief') { project.job.status = 'cancelled'; await store.save(); throw new Error('Project is under user control') }
      try { await host.prompt(project.sessionId, requestId, prompt) }
      catch (error) { project.job.status = 'unknown'; await store.save(); throw error }
      // Events may settle the job before prompt returns.
      if (project.job.requestId === requestId && project.job.status === 'submitting') { project.job.status = 'running'; project.job.acceptedAt = Date.now() }
      await store.save()
      return requestId
    },
    async takeover(sessionId, messageId, at, reason) {
      const project = state.projects.find(p => p.sessionId === sessionId)
      if (project && take(project, messageId, at, reason)) await store.save()
    },
    find,
    async command(line, sessionId) {
      const match = /^\/(home|where|switch|resume|resolve)(?:\s+(.*))?$/.exec(line.trim())
      if (!match) throw new Error('Use /home, /where, /switch, /resume or /resolve')
      const [, action, name] = match
      if ((action === 'home' || action === 'where') && name) throw new Error(`/${action} takes no arguments`)
      if (action === 'switch' && !name) throw new Error('Specify a project')
      if (action === 'where' && sessionId === state.chiefSessionId) return { sessionId, navigate: false, message: 'Chief' }
      if (action === 'home' && !state.chiefSessionId) throw new Error('Chief is not ready')
      if (action === 'home') { state.route = { sessionId: state.chiefSessionId, revision: (state.route?.revision ?? 0) + 1 }; await store.save(); return { sessionId: state.chiefSessionId, navigate: true, message: 'Chief' } }
      const project = name ? find(name) : state.projects.find(p => p.sessionId === sessionId)
      if (!project) throw new Error('Specify a project')
      if (action === 'resume') { await this.resume(project.name); return { navigate: false, message: `${project.name}: returned to Chief` } }
      if (action === 'resolve') {
        if (project.job?.status !== 'unknown') throw new Error('Only an uncertain task can be resolved; inspect the DSH session first')
        project.job.status = 'abandoned'
        project.job.resolvedAt = Date.now()
        try { await store.save() } catch (error) { project.job.status = 'unknown'; delete project.job.resolvedAt; throw error }
        return { navigate: false, message: `${project.name}: uncertain task acknowledged; no new task was started` }
      }
      if (action === 'switch') { await this.takeover(project.sessionId, undefined, undefined, 'User switched to project'); state.route = { sessionId: project.sessionId, revision: (state.route?.revision ?? 0) + 1 }; await store.save() }
      return { sessionId: project.sessionId, navigate: action === 'switch', message: `${project.name}: ${project.owner}` }
    },
    async resume(name) {
      const project = find(name)
      const previous = {owner:project.owner,controlChangedAt:project.controlChangedAt,controlReason:project.controlReason}
      resume(project)
      try { await store.save() } catch (error) { Object.assign(project, previous); throw error }
    },
    async reconcile(project, afterRestart = false) {
      const job = project.job
      if (!job || !['submitting', 'running', 'unknown'].includes(job.status)) return
      const result = await host.inspect(project.sessionId, job.requestId)
      if (project.job !== job || !['submitting', 'running', 'unknown'].includes(job.status)) return
      if (!result && (!afterRestart || job.status === 'unknown')) return
      if (result) { Object.assign(job, result); job.notification = 'pending' }
      else if (afterRestart) job.status = 'unknown'
      await store.save()
      if (result && host.notify) await this.notify(project, job)
    },
    async notify(project, job) {
      if (job.notification !== 'pending') return
      job.notification = 'sending'
      await store.save()
      await host.notify(project, job)
      job.notification = 'sent'
      await store.save()
    },
    async recover() {
      for (const project of state.projects) {
        try { await this.reconcile(project, true) }
        catch (error) {
          const job = project.job
          if (job && ['submitting', 'running', 'unknown'].includes(job.status)) {
            job.status = 'unknown'
            job.recoveryError = 'Could not inspect the DSH session; retry inspection before dispatching.'
            await store.save()
          } else if (job?.notification === 'sending') {
            job.notification = 'unknown'
            job.notificationError = 'Delivery outcome is unknown; inspect Chief before retrying.'
            await store.save()
          } else throw error
        }
        const job = project.job
        try {
          if (job?.notification === 'pending' && host.notify) await this.notify(project, job)
          else if (job?.notification === 'sending') {
            const found = host.inspectNotice && await host.inspectNotice(job.requestId)
            job.notification = found ? 'sent' : 'unknown'
            await store.save()
          }
        } catch (error) {
          if (job?.notification !== 'sending') throw error
          job.notification = 'unknown'
          job.notificationError = 'Delivery outcome is unknown; inspect Chief before retrying.'
          await store.save()
        }
      }
    },
    async finish(sessionId, requestId, result) {
      const project = state.projects.find(p => p.sessionId === sessionId)
      if (!project || project.job?.requestId !== requestId) return false
      Object.assign(project.job, result)
      await store.save()
      return true
    },
  }
}
