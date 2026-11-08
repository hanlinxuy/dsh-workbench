import Preset from '@deepseek-ai/dsh-agent-preset'
import * as Chief from './index.js'
export const name = 'independent-chief'
export function apply(ctx, config = {}) {
  ctx.plugin(Preset, { id: 'independent-chief', name: 'Chief 管家', description: '项目协调、独立 Markdown 记忆与任务验收', order: 20, plugins: [ { id: 'chief-persona-and-memory', name: new URL('../../preset.js', import.meta.url).href, config: { instructions: 'Your persistent memory is the private Chief Markdown/Git store. Read it with chief_project list; update it with remember and review. Do not claim to remember project facts without reading this store.' } }, { id: 'chief-time-context', name: '@deepseek-ai/dsh-time-context' } ] })
  ctx.plugin(Chief, config)
}
