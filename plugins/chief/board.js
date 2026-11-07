// A read-only native main panel; the existing DSH workspace and conversation remain
// the only editing/navigation surface. All dynamic content is rendered as text.
export function createBoard() {
  const root = document.createElement('div')
  root.className = 'chief-board'
  root.innerHTML = `<style>
.chief-board{font:13px/1.5 system-ui;color:CanvasText}
.chief-board button{font:inherit;color:inherit;cursor:pointer;background:Canvas;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:14px;padding:7px 12px}
.chief-board{height:100%;overflow:auto;padding:32px;box-sizing:border-box;background:inherit}
.chief-board section{max-width:760px;margin:0 auto}
.chief-board header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.chief-board h2{font-size:17px;margin:0}.chief-board h3{font-size:14px;margin:0 0 6px}
.chief-board .chief-summary{opacity:.65;margin:8px 0 16px}.chief-board article{border-top:1px solid color-mix(in srgb,CanvasText 12%,transparent);padding:15px 0}
.chief-board p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.chief-board .chief-meta{opacity:.7;font-size:12px}.chief-board .chief-attention{border-left:3px solid #d29839;padding-left:10px}
.chief-board details{margin-top:10px;font-size:12px}.chief-board summary{cursor:pointer;opacity:.7}
.chief-board .chief-error{color:#c74a35}
</style><section id="chief-project-board" aria-label="Chief 项目看板"><header><h2>项目进度</h2></header><p class="chief-summary">正在读取项目记录…</p><p class="chief-error" role="status"></p><div class="chief-cards"></div></section>`
  let previous
  return {
    root,
    error(message) { root.querySelector('.chief-error').textContent = message },
    render(state) {
      root.querySelector('.chief-error').textContent = state.memoryError ?? ''
      const signature = JSON.stringify(state.projects)
      if (signature === previous) return
      previous = signature
      const cards = root.querySelector('.chief-cards')
      cards.replaceChildren()
      root.querySelector('.chief-summary').textContent = state.projects.length ? `${state.projects.length} 个项目 · 记录来自本地 Markdown 与任务状态` : '还没有项目。在 Chief 中用自然语言登记目录即可。'
      const execution = { completed: '执行完成', failed: '执行失败', running: '执行中', submitting: '正在派发', unknown: '执行待核对', abandoned: '已人工核对放弃', cancelled: '已取消' }
      const acceptance = { pending: '待验收', accepted: 'Chief 验收通过', needs_changes: '需修正', blocked: '验收受阻' }
      for (const project of [...state.projects].sort((a, b) => Number(Boolean(b.memory.blockers) || ['needs_changes','blocked'].includes(b.acceptance?.verdict)) - Number(Boolean(a.memory.blockers) || ['needs_changes','blocked'].includes(a.acceptance?.verdict)))) {
        const card = document.createElement('article')
        card.setAttribute('aria-label', project.name)
        const title = document.createElement('h3'); title.textContent = `${project.name}${project.memory.priority ? ` · ${project.memory.priority}` : ''}`; card.append(title)
        const meta = document.createElement('p'); meta.className = 'chief-meta'
        meta.textContent = `${project.owner === 'user' ? '你已接手' : 'Chief 管理'} · ${execution[project.job?.status] ?? '未派发'}${project.acceptance ? ` · ${acceptance[project.acceptance.verdict] ?? '待核对'}` : ''}`; card.append(meta)
        for (const [label, value] of [['目标',project.memory.goal],['阻碍',project.memory.blockers],['下一步',project.memory.nextSteps]]) {
          const line = document.createElement('p'); line.textContent = `${label}：${value || '未记录'}`
          if (label === '阻碍' && value) line.className = 'chief-attention'
          card.append(line)
        }
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '约束与依据'; details.append(summary)
        for (const [label, value] of [['约束',project.memory.constraints],['验收标准',project.job?.criteria || project.memory.criteria],['来源',project.memory.source],['记忆更新',project.memory.updatedAt],['验收记录',project.acceptance?.file]]) {
          const line = document.createElement('p'); line.textContent = `${label}：${value || '未记录'}`; details.append(line)
        }
        card.append(details); cards.append(card)
      }
    },
  }
}
