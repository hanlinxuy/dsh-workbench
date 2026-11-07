// DSH currently exposes flat panel entries only. Keep native navigation and add
// one sibling group beside our hidden anchor; never move React-owned elements.
export function createChiefSidebar(ctx, config) {
  const style = document.createElement('style')
  const workspaceStyle = document.createElement('style')
  style.textContent = `
nav button:has(svg[data-chief-anchor]){display:none!important}
.chief-nav{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.chief-nav button{font:inherit;color:inherit;background:transparent;border:0;border-radius:10px;cursor:pointer;min-height:36px;text-align:left}
.chief-nav button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.chief-nav button:focus-visible{outline:2px solid Highlight;outline-offset:-2px}
.chief-nav .chief-chat{flex:1;padding:8px;display:flex;gap:10px;align-items:center}
.chief-nav .chief-expand{width:30px;text-align:center}
.chief-nav .chief-child{flex-basis:100%;padding:8px 12px 8px 34px}
.chief-nav [hidden]{display:none!important}
.chief-nav[data-wide=false] .chief-label{display:none}
.chief-nav[data-wide=false] .chief-chat{justify-content:center;padding:6px}
.chief-nav[data-wide=false] .chief-expand{width:16px;padding:0}
.chief-nav[data-wide=false] .chief-child{padding:8px;text-align:center}
`
  ctx.effect(() => {
    document.head.append(style, workspaceStyle)
    return () => { style.remove(); workspaceStyle.remove() }
  }, 'Chief sidebar presentation')
  let expanded = false
  return {
    update(state) {
      const id = state.internalWorkspaceId
      workspaceStyle.textContent = config.hideInternalWorkspace !== false && id
        ? `[role="tree"] div:has(> span > [data-row-key="workspace:${CSS.escape(id)}"]){display:none!important}` : ''
    },
    mount(anchor, wide) {
      const group = document.createElement('div')
      group.className = 'chief-nav'
      group.dataset.wide = String(wide)
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', 'Chief 导航')
      group.innerHTML = `<button type="button" class="chief-chat" aria-label="Chief 管家"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h8M8 14h5"/></svg><span class="chief-label">Chief 管家</span></button><button type="button" class="chief-expand" aria-label="展开 Chief 子菜单"></button><button type="button" class="chief-child" aria-label="项目看板"><span aria-hidden="true">▤</span><span class="chief-label"> 项目看板</span></button>`
      const chat = group.querySelector('.chief-chat')
      const toggle = group.querySelector('.chief-expand')
      const child = group.querySelector('.chief-child')
      const render = () => {
        toggle.textContent = expanded ? '⌄' : '›'
        toggle.setAttribute('aria-expanded', String(expanded))
        toggle.setAttribute('aria-label', expanded ? '收起 Chief 子菜单' : '展开 Chief 子菜单')
        child.hidden = !expanded
      }
      chat.onclick = () => ctx.layout.selectPanel('independent-chief-home')
      toggle.onclick = () => { expanded = !expanded; render() }
      child.onclick = () => ctx.layout.selectPanel('independent-chief-board')
      render()
      anchor.before(group)
      return () => group.remove()
    },
  }
}
