import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { openMemory } from './memory.js'

// A SQLite write transaction is an operating-system-released single-writer
// lease. State is kept separately; a crashed process cannot leave a stale lock.
export async function openStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lockPath = join(directory, 'writer.sqlite')
  const file = await open(lockPath, 'a', 0o600)
  await file.close()
  const lock = new DatabaseSync(lockPath, { timeout: 0 })
  try { lock.exec('BEGIN IMMEDIATE') } catch (error) { lock.close(); throw error }
  const path = join(directory, 'state.json')
  let state
  try {
    state = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') { lock.close(); throw error }
    state = { version: 1, chiefSessionId: null, projects: [], route: null }
  }
  if (state.version !== 1 || !Array.isArray(state.projects)) { lock.close(); throw new Error('Unsupported Chief state') }
  let memory
  try { memory = await openMemory(join(directory, 'memory')) } catch (error) { lock.close(); throw error }
  let pending = Promise.resolve()
  let closing = false
  return {
    state,
    memory,
    save() {
      if (closing) return Promise.reject(new Error('Chief store is closing'))
      const contents = JSON.stringify(state)
      pending = pending.then(async () => {
        const temporary = `${path}.tmp`
        await writeFile(temporary, contents, { mode: 0o600 })
        await rename(temporary, path)
      })
      return pending
    },
    async close() {
      closing = true
      try { await pending; await memory.close() } finally { lock.close() }
    },
  }
}
