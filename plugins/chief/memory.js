import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
export const memoryFields = ['goal', 'priority', 'constraints', 'criteria', 'blockers', 'nextSteps', 'source', 'updatedAt']

// Markdown is authoritative. Blockquotes keep headings inside user text from
// becoming structural headings. Edit while the host is stopped, then restart.
export function markdown(title, fields) {
  return `# ${title.replaceAll('\n', ' ')}\n\n` + Object.entries(fields).map(([key, value]) => `## ${key}\n\n${String(value).split('\n').map(line => `> ${line}`).join('\n')}\n`).join('\n')
}
export function parseMemory(text) {
  const fields = {}
  for (const section of text.split('\n## ').slice(1)) {
    const split = section.indexOf('\n')
    const key = section.slice(0, split)
    const lines = section.slice(split + 1).replace(/\n+$/, '').replace(/^\n/, '').split('\n')
    if (!memoryFields.includes(key) || key in fields || lines.some(line => !line.startsWith('> '))) throw new Error('Invalid Chief memory Markdown; preserve headings and blockquotes')
    fields[key] = lines.map(line => line.slice(2)).join('\n')
  }
  if (memoryFields.some(key => !(key in fields))) throw new Error('Missing Chief memory section')
  return fields
}
export function emptyMemory() {
  return Object.fromEntries(memoryFields.map(key => [key, '']))
}
export async function openMemory(directory, execute = exec) {
  await mkdir(join(directory, 'projects'), { recursive: true, mode: 0o700 })
  await mkdir(join(directory, 'reviews'), { recursive: true, mode: 0o700 })
  const git = args => execute('git', ['-C', directory, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=DSH Chief', '-c', 'user.email=chief@localhost', ...args])
  await git(['init', '--quiet'])
  const records = new Map()
  const reviews = new Map()
  const errors = new Map()
  for (const file of await readdir(join(directory, 'projects'))) {
    if (file.endsWith('.md')) {
      const path = join(directory, 'projects', file)
      await readFile(path, 'utf8').then(text => records.set(file.slice(0, -3), parseMemory(text))).catch(error => errors.set(path, `${path}: ${error.message}`))
    }
  }
  // Reviews use a fixed Markdown schema as well; only the verdict is needed
  // by the compact board. The complete evidence remains in the review file.
  for (const file of await readdir(join(directory, 'reviews'))) {
    if (file.endsWith('.md')) {
      const text = await readFile(join(directory, 'reviews', file), 'utf8')
      const verdict = text.match(/\n## verdict\n\n> (accepted|needs_changes|blocked)\n/)
      if (!verdict) { const path = join(directory, 'reviews', file); errors.set(path, `${path}: Invalid Chief review Markdown`); continue }
      reviews.set(file.slice(0, -3), { verdict: verdict[1], file: join(directory, 'reviews', file) })
    }
  }
  let pending = Promise.resolve()
  const dirty = await git(['status', '--porcelain', '--', 'projects', 'reviews'])
  let lastError = dirty.stdout.trim() ? 'Memory has uncommitted Markdown changes; inspect the local Git repository.' : null
  let closing = false
  return {
    directory,
    get: id => records.get(id) ?? emptyMemory(),
    review: requestId => reviews.get(requestId) ?? null,
    errorFor: id => errors.get(join(directory, 'projects', `${id}.md`)) ?? null,
    get error() { return [...errors.values(), lastError].filter(Boolean).join('\n') || null },
    update(project, patch, review) {
      const issue = errors.get(join(directory, 'projects', `${project.id}.md`)) || (review && errors.get(join(directory, 'reviews', `${review.requestId}.md`)))
      if (issue) return Promise.reject(new Error(`Repair memory file and restart before writing: ${issue}`))
      if (closing) return Promise.reject(new Error('Memory store is closing'))
      const operation = pending.then(async () => {
        const value = { ...(records.get(project.id) ?? emptyMemory()), ...patch, updatedAt: new Date().toISOString() }
        const files = [[`projects/${project.id}.md`, markdown(project.name, value)]]
        if (review) files.push([`reviews/${review.requestId}.md`, markdown(`Review ${project.name}`, review)])
        for (const [file, text] of files) {
          const path = join(directory, file)
          await writeFile(path + '.tmp', text, { mode: 0o600 })
          await rename(path + '.tmp', path)
        }
        records.set(project.id, value)
        if (review) reviews.set(review.requestId, { verdict: review.verdict, file: join(directory, files[1][0]) })
        await git(['add', '--', ...files.map(([file]) => file)])
        // Commit only these paths, never accidentally include a staged user file.
        await git(['commit', '--quiet', '--only', '-m', review ? `Review ${review.requestId}` : `Update project ${project.id}`, '--', ...files.map(([file]) => file)])
        const dirty = await git(['status', '--porcelain', '--', 'projects', 'reviews'])
        lastError = dirty.stdout.trim() ? 'Memory has uncommitted Markdown changes; inspect the local Git repository.' : null
        return value
      })
      pending = operation.catch(error => { lastError = `Memory persistence/Git failed: ${error.message}` })
      return operation
    },
    close() { closing = true; return pending },
  }
}
