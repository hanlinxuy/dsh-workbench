import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const bin = join(dirname(require.resolve('agent-desktop/package.json')), 'bin')
const platform = require('agent-desktop/lib/platform.js')

export function createDesktop({ home, headed = false }, execute = exec) {
  let queue = Promise.resolve()
  return async ({ action, app, ref, value, property = 'text' }, { signal, scope = 'default' } = {}) => {
    const commands = {
      version: () => ['version'], status: () => ['status'], permissions: () => ['permissions'],
      guide: () => ['skills', 'get', 'platform'],
      apps: () => ['list-apps'], windows: () => ['list-windows', '--app', app],
      snapshot: () => ['snapshot', '--app', app, '--compact'],
      get: () => ['get', ref, '--property', property],
      click: () => ['click', ref], fill: () => ['set-value', ref, value],
      type: () => ['type', ref, value], select: () => ['select', ref, value],
      check: () => ['check', ref], uncheck: () => ['uncheck', ref],
      press: () => ['press', value, '--app', app],
    }
    if (!Object.hasOwn(commands, action)) throw new Error('Unsupported desktop action')
    for (const arg of [app, ref, property]) {
      if (arg !== undefined && (typeof arg !== 'string' || arg.startsWith('-'))) throw new Error('Arguments must be text, not CLI options')
    }
    if (value !== undefined && typeof value !== 'string') throw new Error('Desktop value must be text')
    if(action==='press' && value?.startsWith('-')) throw new Error('Key combination cannot be a CLI option')
    const args = commands[action]()
    if (['fill', 'type', 'select'].includes(action)) args.splice(2, 0, '--')
    if (args.includes(undefined)) throw new Error('Missing desktop argument')
    const entry = platform.resolve(process.platform, process.arch)
    if (!entry?.released) throw new Error('No agent-desktop release for this platform')
    const pending = queue.then(async () => {
      const directory = join(home, createHash('sha256').update(scope).digest('hex').slice(0, 20))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USERPROFILE|TMP|TEMP|TMPDIR|LANG|LC_.*|SystemRoot|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)))
      env.AGENT_DESKTOP_HOME = directory
      const executable = join(bin, entry.binaryName)
      if (process.platform !== 'win32') await chmod(executable, 0o755)
      if (process.platform === 'darwin') {
        env.AGENT_DESKTOP_MACOS_HELPER_PATH = join(bin, `agent-desktop-macos-helper-darwin-${process.arch}`)
        await chmod(env.AGENT_DESKTOP_MACOS_HELPER_PATH, 0o755)
      }
      const { stdout } = await execute(executable, [...(headed ? ['--headed'] : []), ...args], {
        env, cwd: directory, signal, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
      }).catch(error => { throw new Error(error.stdout || `agent-desktop failed (${error.code ?? 'terminated'})`) })
      const result = JSON.parse(stdout)
      if (!result.ok) throw new Error(stdout.trim())
      return stdout.trim()
    })
    queue = pending.then(() => {}, () => {})
    return pending
  }
}
