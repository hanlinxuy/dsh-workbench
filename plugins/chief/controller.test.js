import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createController } from './controller.js'

test('dispatch provides a project-local read-only six-field memory snapshot without internal metadata', async () => {
  const fields = { goal: 'Ship A', priority: 'P0', constraints: 'Read only', criteria: 'Tests pass', blockers: 'Approval required', nextSteps: 'Ask user' }
  const memory = { ...fields, source: 'secret-review-request-id', updatedAt: 'private-timestamp', sessionId: 'secret-session', id: 'secret-project' }
  const state = { projects: [{ id: 'secret-project', name: 'A', sessionId: 'secret-session', owner: 'chief', seen: [] }] }
  const calls = []
  const controller = createController({ state, save: async () => {}, memory: {
    directory: 'secret-memory-directory',
    get(id) { assert.equal(id, 'secret-project'); return memory },
    update() { assert.fail('dispatch must not write project memory') },
  } }, { prompt: async (...args) => calls.push(args) })
  await controller.dispatch('A', 'Inspect only', { criteria: 'Task-specific criterion' })
  const prompt = calls[0][2]
  assert.match(prompt, /Read-only project memory snapshot/)
  assert.match(prompt, /not new authorization/)
  assert.match(prompt, /Report corrections to Chief/)
  assert.ok(prompt.includes(JSON.stringify(fields, null, 2)))
  assert.match(prompt, /Acceptance criteria for this task: Task-specific criterion/)
  for (const secret of ['secret-review-request-id', 'private-timestamp', 'secret-session', 'secret-project', 'secret-memory-directory']) assert.equal(prompt.includes(secret), false)
  assert.equal(state.projects[0].job.prompt, prompt)
  assert.equal(memory.criteria, 'Tests pass')
})

test('dispatch snapshots empty memory and refreshes it on the next authorized task', async () => {
  const state = { projects: [{ id: 'a', name: 'A', sessionId: 'a', owner: 'chief', seen: [] }] }
  let memory = {}
  const calls = []
  const controller = createController({ state, save: async () => {}, memory: { get: () => memory } }, { prompt: async (...args) => calls.push(args) })
  const id = await controller.dispatch('A', 'First')
  assert.ok(calls[0][2].includes('"priority": ""'))
  await controller.finish('a', id, { status: 'completed', text: 'Done' })
  memory = { priority: 'P1', blockers: 'New blocker', nextSteps: 'New next step', criteria: 'New criterion' }
  await controller.dispatch('A', 'Second')
  assert.ok(calls[1][2].includes('"blockers": "New blocker"'))
  assert.match(calls[1][2], /Acceptance criteria for this task: New criterion/)
  assert.equal(calls[0][2].includes('New blocker'), false)
})

test('two projects run independently and takeover preserves in-flight result', async () => {
  const state = { projects: [] }
  const calls = []
  const controller = createController({ state, save: async () => {} }, {
    createSession: async name => name,
    prompt: async (...args) => { calls.push(args) },
  })
  await controller.register('A', '/a'); await controller.register('B', '/b')
  const a = await controller.dispatch('A', 'review a')
  const b = await controller.dispatch('B', 'review b')
  await controller.takeover('A', 'user-1')
  await assert.rejects(controller.dispatch('A', 'new'), /user control/)
  assert.equal(await controller.finish('A', a, { status: 'completed', text: 'result a' }), true)
  assert.equal(await controller.finish('B', b, { status: 'completed', text: 'result b' }), true)
  assert.equal(state.projects[0].owner, 'user')
  assert.equal(state.projects[1].owner, 'chief')
  assert.equal(calls.length, 2)
})

test('recovery keeps uncertain submissions blocked instead of resending', async () => {
  const state = { projects: [{ name: 'A', sessionId: 'a', owner: 'chief', seen: [], job: { requestId: 'x', status: 'running' } }] }
  let prompts = 0
  const controller = createController({ state, save: async () => {} }, { prompt: async () => { prompts++ }, inspect: async () => undefined })
  await controller.recover()
  await assert.rejects(controller.dispatch('A', 'repeat'), /active work/)
  assert.equal(state.projects[0].job.status, 'unknown')
  assert.equal(prompts, 0)
})

test('concurrent reconciliation reports a finished job only once', async () => {
  const project = { name: 'A', sessionId: 'a', owner: 'user', seen: [], job: {requestId:'x', status:'running'} }
  const state = {projects:[project]}
  let release
  const gate = new Promise(resolve => { release = resolve })
  let notifications = 0
  const controller = createController({state, save:async()=>{}}, {
    inspect: async () => { await gate; return {status:'completed',text:'done'} },
    notify: async () => { notifications++ },
  })
  const first = controller.reconcile(project)
  const second = controller.reconcile(project)
  release()
  await Promise.all([first, second])
  assert.equal(notifications, 1)
  assert.equal(project.job.notification, 'sent')
  assert.equal(project.owner, 'user')
})

test('a delayed event from an earlier dispatch does not take over a resumed project', async () => {
  const state = {projects: []}
  const controller = createController({state, save:async()=>{}}, {createSession:async()=> 'a',prompt:async()=>{}})
  await controller.register('A','/a')
  const oldRequest = await controller.dispatch('A','first')
  await controller.finish('a',oldRequest,{status:'completed',text:'done'})
  await controller.dispatch('A','second')
  await controller.takeover('a',oldRequest)
  assert.equal(state.projects[0].owner,'chief')
})

test('commands distinguish Chief and project and home never resumes', async () => {
  const state = {chiefSessionId:'chief', projects:[{name:'A',sessionId:'a',owner:'user',seen:[],job:null}],route:null}
  const controller = createController({state,save:async()=>{}},{})
  assert.equal((await controller.command('/where','chief')).message,'Chief')
  await assert.rejects(controller.command('/switch','a'), /Specify/)
  await assert.rejects(controller.command('/home extra','a'), /arguments/)
  assert.equal((await controller.command('/home','a')).sessionId,'chief')
  assert.equal(state.projects[0].owner,'user')
  await controller.command('/resume','a')
  assert.equal(state.projects[0].owner,'chief')
})

test('reading an unfinished job does not mislabel it unknown while the host is alive', async () => {
  const project = {name:'A',sessionId:'a',owner:'chief',seen:[],job:{requestId:'x',status:'running'}}
  const controller = createController({state:{projects:[project]},save:async()=>{}},{inspect:async()=>undefined})
  await controller.reconcile(project)
  assert.equal(project.job.status,'running')
  await controller.recover()
  assert.equal(project.job.status,'unknown')
})

test('restart safely recovers pending notifications and reconciles uncertain delivery', async () => {
  const pending = {name:'A',sessionId:'a',owner:'chief',seen:[],job:{requestId:'a1',status:'completed',text:'a',notification:'pending'}}
  const uncertain = {name:'B',sessionId:'b',owner:'chief',seen:[],job:{requestId:'b1',status:'completed',text:'b',notification:'sending'}}
  const state = {projects:[pending,uncertain]}
  const delivered=[]
  const controller=createController({state,save:async()=>{}},{notify:async (_p,j)=>delivered.push(j.requestId),inspectNotice:async()=>false})
  await controller.recover()
  assert.deepEqual(delivered,['a1'])
  assert.equal(pending.job.notification,'sent')
  assert.equal(uncertain.job.notification,'unknown')
})

test('a failed resume keeps the previous user control and evidence', async () => {
  const project = {name:'A',sessionId:'a',owner:'user',seen:[],job:null,controlChangedAt:123,controlReason:'takeover'}
  const controller=createController({state:{projects:[project]},save:async()=>{throw new Error('disk full')}},{})
  await assert.rejects(controller.resume('A'),/disk full/)
  assert.equal(project.owner,'user')
  assert.equal(project.controlChangedAt,123)
  assert.equal(project.controlReason,'takeover')
})

test('restart remains usable and blocks retry if DSH inspection fails', async () => {
  const job={requestId:'x',status:'running'}
  const state={projects:[{name:'A',sessionId:'a',owner:'user',seen:[],job}]}
  const controller=createController({state,save:async()=>{}},{inspect:async()=>{throw new Error('offline')}})
  await controller.recover()
  assert.equal(job.status,'unknown')
  assert.match(job.recoveryError,/inspect/)
  assert.equal(state.projects[0].owner,'user')
})

test('uncertain notification remains visible without resending on restart', async () => {
  const job={requestId:'x',status:'completed',text:'ok',notification:'pending'}
  const state={projects:[{name:'A',sessionId:'a',owner:'chief',seen:[],job}]}
  let attempts=0
  const controller=createController({state,save:async()=>{}},{notify:async()=>{attempts++;throw new Error('timeout')},inspectNotice:async()=>false})
  await controller.recover()
  assert.equal(job.notification,'unknown')
  await controller.recover()
  assert.equal(attempts,1)
})

test('only an explicit resolve command acknowledges an uncertain task without resuming control', async () => {
  const job={requestId:'x',status:'unknown'}
  const project={name:'A',sessionId:'a',owner:'user',seen:[],job}
  const controller=createController({state:{projects:[project]},save:async()=>{}},{})
  await controller.command('/resolve','a')
  assert.equal(job.status,'abandoned')
  assert.equal(project.owner,'user')
  await assert.rejects(controller.command('/resolve','a'),/uncertain/)
  await assert.rejects(controller.dispatch('A','new'),/user control/)
})

test('project listing computes takeover timing without exposing prompt or full report', () => {
  const state={projects:[{name:'A',owner:'user',controlReason:'Desktop user message',controlChangedAt:1200,job:{requestId:'x',status:'completed',submittedAt:1000,finishedAt:5000,prompt:'secret task',text:'long result'}}]}
  const controller=createController({state,save:async()=>{}},{})
  const {projects, timeline}=controller.list()
  const item=projects[0]
  assert.deepEqual(item.job.timing,{durationMs:4000,takeoverAfterSubmitMs:200,finishedAfterTakeoverMs:3800,takeoverVsFinish:'before'})
  assert.deepEqual(timeline.map(e=>e.event),['submitted','desktop_takeover','finished'])
  assert.equal(item.job.resultLength,11)
  assert.equal('prompt' in item.job,false)
  assert.equal('text' in item.job,false)
})

test('read receipt only proves contiguous pages in the current Chief turn', () => {
  const job={requestId:'x',status:'completed',text:'a'.repeat(12001)}
  const project={id:'a',name:'A',job}
  const controller=createController({state:{projects:[project]},save:async()=>{}},{})
  assert.equal(controller.read('A',6000).readThisTurn.complete,false)
  assert.equal(controller.read('A',0).next,6000)
  assert.deepEqual(controller.read('A',6000).readThisTurn,{chars:12000,complete:false})
  const last=controller.read('A',12000)
  assert.deepEqual(last.readThisTurn,{chars:12001,complete:true})
  assert.deepEqual(last.timeline,controller.list().timeline)
  assert.equal(last.current.job.readThisTurn.complete,true)
  assert.equal(controller.list().projects[0].job.readThisTurn.complete,true)
  controller.startTurn()
  assert.deepEqual(controller.list().projects[0].job.readThisTurn,{chars:0,complete:false})
  controller.read('A',0)
  project.job={requestId:'y',status:'completed',text:'new'}
  assert.equal(controller.list().projects[0].job.readThisTurn.complete,false)
  assert.throws(()=>controller.read('A',-1),/offset/)
})

test('timeline orders recorded events and does not invent a takeover', () => {
  const projects=[
    {id:'a',name:'A',owner:'user',controlReason:'Desktop user message',controlChangedAt:300,job:{requestId:'a',submittedAt:100,finishedAt:200}},
    {id:'b',name:'B',owner:'chief',job:{requestId:'b',submittedAt:100,finishedAt:250}},
    {id:'c',name:'C',owner:'user',controlReason:'Explicit user resume',controlChangedAt:180,job:{requestId:'c',submittedAt:100}},
    {id:'d',name:'D',owner:'user',controlReason:'Desktop user message',controlChangedAt:250,job:{requestId:'d',submittedAt:100,finishedAt:250}},
  ]
  const controller=createController({state:{projects},save:async()=>{}},{})
  const result=controller.list()
  assert.equal(result.projects[0].job.timing.takeoverVsFinish,'after')
  assert.equal(result.projects[2].job.timing.takeoverVsFinish,undefined)
  assert.equal(result.projects[3].job.timing.takeoverVsFinish,'same_time')
  assert.match(result.projects[0].job.takeoverStatement,/晚于当前任务完成/)
  assert.match(result.projects[1].job.takeoverStatement,/不能推断此前是否接手/)
  assert.match(result.projects[3].job.takeoverStatement,/无法判断先后/)
  assert.deepEqual(result.timeline.map(e=>e.at),[100,100,100,100,200,250,250,250,300])
  assert.match(result.timelineNote,/equal timestamps/)
})
