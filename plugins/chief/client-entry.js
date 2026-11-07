import { projectCommands } from './project-commands.js'
import { createChiefSidebar } from './sidebar.js'
import { createBoard } from './board.js'
import { createElement, useEffect, useState, useRef } from 'react'
export const inject = ['sessions', 'uiWorkspace', 'slots', 'layout']
export function apply(ctx, config = {}) {
  const sidebar = createChiefSidebar(ctx, config)
  const board = createBoard()
  let stopped = false, timer, revision, ready = false, navigation
  const status = document.createElement('div')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.style.cssText = 'pointer-events:none;position:fixed;bottom:24px;right:24px;max-width:420px;padding:12px 16px;border-radius:8px;background:Canvas;color:CanvasText;border:1px solid GrayText;z-index:10000;display:none'
  let statusTimer
  ctx.effect(() => { document.body.append(status); return () => { clearTimeout(statusTimer); status.remove() } }, 'Chief status')
  const notify = text => { status.textContent = text; status.style.display = 'block'; clearTimeout(statusTimer); statusTimer = setTimeout(() => { status.style.display = 'none' }, 6000) }
  const call = async (endpoint, payload) => {
    const response = await fetch('api/independent-chief', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({endpoint,payload})})
    const result = await response.json()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const open = async id => { await ctx.sessions.refresh(); if (!stopped) ctx.uiWorkspace.openSession(id) }
  // Use the native panel registry so pinning, collapsed sidebar and More all
  // behave like the built-in entries. This panel opens the bound conversation.
  function ChiefEntry() {
    const [error, setError] = useState('')
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
      setError('')
      const signal = ctx.layout.beginNavigation()
      void call('board').then(async state => {
        await ctx.sessions.refresh()
        if (!signal.aborted) ctx.uiWorkspace.openSession(state.chiefSessionId)
      }).catch(error => { if (!signal.aborted) setError(error.message) })
    }, [attempt])
    return createElement('div', { style: { padding: '32px' }, role: 'status' }, error
      ? createElement('div', null, `无法打开 Chief：${error}。`, createElement('button', { onClick: () => setAttempt(attempt + 1) }, '重试'))
      : '正在打开 Chief 管家…')
  }
  function BoardPanel() {
    const container = useRef(null)
    useEffect(() => {
      container.current.append(board.root)
      return () => board.root.remove()
    }, [])
    return createElement('div', { ref: container, style: { height: '100%', minHeight: 0 } })
  }
  function ChiefIcon({ size }) {
    const icon = useRef(null)
    useEffect(() => sidebar.mount(icon.current.closest('button'), size !== 18), [size])
    return createElement('svg', { ref: icon, 'data-chief-anchor': '', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true },
      createElement('path', { d: 'M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' }),
      createElement('path', { d: 'M8 10h8M8 14h5' }))
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'independent-chief-home' }, ChiefEntry))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'independent-chief-home', order: -10, label: 'Chief 管家' }, ChiefIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'independent-chief-board' }, BoardPanel))
  const refresh = async () => {
    const state = await call('board')
    if (stopped) return
    board.render(state)
    sidebar.update(state)
    const route = state.route
    if (ready && route && route.revision !== revision) await open(route.sessionId)
    revision = route?.revision; ready = true
  }
  ctx.effect(() => {
    const loop = () => refresh().catch(error => { if (!stopped) board.error(`状态更新失败：${error.message}。当前显示可能已过期。`) }).finally(() => { if (!stopped) timer = setTimeout(loop, 1500) })
    void loop()
    return () => { stopped = true; clearTimeout(timer); clearTimeout(navigation) }
  }, 'Chief navigation')
  const fiber = ctx.inject(['inputTriggers'], scope => scope.effect(() => scope.inputTriggers.registerSource(projectCommands({
    roster: {getSnapshot: () => ({ready})}, notify,
    call: async (_endpoint, payload) => { const result = await call('command', payload); const state = await call('state'); revision = state.route?.revision; return result },
    open: id => { clearTimeout(navigation); navigation = setTimeout(() => { void open(id).catch(error => notify(error.message)) }, 0) },
  })), 'Chief commands'))
  ctx.effect(() => () => fiber.dispose(), 'Chief command cleanup')
}
