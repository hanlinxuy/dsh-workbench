import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const launcher = join(dirname(require.resolve('agent-browser/package.json')), 'bin/agent-browser.js')

export function createBrowser({ home, executablePath, headed = false }) {
  const queues = new Map()
  return async ({ action, account = 'default', target, value }, signal) => {
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(account)) throw new Error('account must contain 1-48 letters, digits, underscores or hyphens')
    const commands = {
      open: () => ['open', new URL(target).href],
      snapshot: () => ['snapshot', '-i'],
      click: () => ['click', target],
      fill: () => ['fill', target, value],
      select: () => ['select', target, value],
      press: () => ['press', target],
      text: () => ['get', 'text', target || 'body'],
      url: () => ['get', 'url'],
      wait: () => ['wait', target],
      back: () => ['back'],
      close: () => ['close'],
      version: () => ['--version'],
    }
    if (!Object.hasOwn(commands, action)) throw new Error('Unsupported browser action')
    const command = commands[action]()
    if (action !== 'version' && command.some(arg => typeof arg !== 'string' || arg.startsWith('--'))) throw new Error('Missing argument or unsupported option')
    const root = join(home, 'accounts', account)
    const session = `wb-${createHash('sha256').update(root).digest('hex').slice(0, 20)}`
    // Serialize commands sharing one login profile. Different accounts remain independent.
    const previous = queues.get(account) ?? Promise.resolve()
    const pending = previous.then(async () => {
      await mkdir(root, { recursive: true, mode: 0o700 })
      const config = join(root, 'browser.json')
      await writeFile(config, '{}', { mode: 0o600 })
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('AGENT_BROWSER_')))
      const args = action === 'version' ? ['--version'] : [
        '--config', config, '--session', session, '--profile', join(root, 'profile'),
        '--json', ...(headed ? ['--headed'] : []),
        ...(executablePath ? ['--executable-path', executablePath] : []), ...command,
      ]
      const { stdout, stderr } = await exec(process.execPath, [launcher, ...args], {
        env, cwd: root, signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      }).catch(error => {
        // execFile errors include the complete command (possibly a password).
        // Keep its diagnostic output, never the command string.
        throw new Error(`agent-browser failed (${error.code ?? 'terminated'}): ${error.stderr || error.stdout || 'no output'}`)
      })
      return stdout.trim() || stderr.trim()
    })
    const settled = pending.then(() => {}, () => {})
    queues.set(account, settled)
    void settled.then(() => { if (queues.get(account) === settled) queues.delete(account) })
    return pending
  }
}
