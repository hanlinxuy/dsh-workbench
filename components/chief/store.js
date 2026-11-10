import { mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { openMemory } from './memory.js'

const writers = new Set()

// A SQLite write transaction is an operating-system-released single-writer
// lease. Never share a mutable store between independent controllers or wait
// synchronously for a lock that this same event loop must release.
export async function openStore(directory, execute) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  directory = await realpath(directory)
  const key = process.platform === 'win32' ? directory.toLowerCase() : directory
  if (writers.has(key)) throw new Error(`Chief store locked: already opening/open in this process (pid ${process.pid}, directory ${directory})`)
  writers.add(key)
  let lock
  let memory
  try {
    const lockPath = join(directory, 'writer.sqlite')
    const file = await open(lockPath, 'a', 0o600)
    await file.close()
    lock = new DatabaseSync(lockPath, { timeout: 0 })
    try { lock.exec('BEGIN IMMEDIATE') } catch (cause) {
      throw new Error(`Chief store writer lease unavailable (pid ${process.pid}, directory ${directory}); another process or store instance may hold the lease: ${cause.message}`, { cause })
    }
    const path = join(directory, 'state.json')
    let state
    try {
      state = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      state = { version: 1, chiefSessionId: null, projects: [], route: null }
    }
    if (state.version !== 1 || !Array.isArray(state.projects)) throw new Error('Unsupported Chief state')
    memory = await openMemory(join(directory, 'memory'), execute)
    let pending = Promise.resolve()
    let closing = false
    let closed
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
      close() {
        if (closed) return closed
        closing = true
        closed = (async () => {
          try { await pending } finally {
            try { await memory.close() } finally {
              try { lock.close() } finally { writers.delete(key) }
            }
          }
        })()
        return closed
      },
    }
  } catch (error) {
    try { lock?.close() } finally { writers.delete(key) }
    throw error
  }
}
