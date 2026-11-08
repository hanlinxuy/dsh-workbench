import { readFile } from 'node:fs/promises'

const prompt = await readFile(new URL('./prompt.md', import.meta.url), 'utf8')
export const inject = ['systemPrompt']

// Only loaded by the Chief preset. Project memory is supplied by chief_project,
// backed by the host's private Markdown/Git store, not the project working tree.
export function apply(ctx, config = {}) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'chief-persona-and-memory', order: 650, interpolate: false,
    text: `${prompt}\n${config.instructions ?? ''}`,
  }), 'Chief preset instructions')
}
