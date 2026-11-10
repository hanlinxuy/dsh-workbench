import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { verifyInstall, registerInstalledBundles } from './verify-install.mjs'

const [command, name, ...args] = process.argv.slice(2)
if (!['init', 'install', 'start', 'status', 'stop'].includes(command) || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(name ?? '')) {
  throw new Error('Usage: plugin-harness <init|install|start|status|stop> <name> [package-source | port]')
}
// A separate root and marker keep this tool away from existing DSH profiles.
const home = join(homedir(), '.local/state/dsh-workbench-harness', name)
const marker = join(home, 'harness.json')
const bin = process.env.DSH_BIN || 'dsh'
const env = { ...process.env, DSH_HOME: home }
if (command === 'init') {
  await mkdir(join(homedir(), '.local/state/dsh-workbench-harness'), { recursive: true, mode: 0o700 })
  await mkdir(home, { recursive: false, mode: 0o700 })
  await writeFile(marker, JSON.stringify({ version: 1, home, installs: [] }, null, 2), { flag: 'wx', mode: 0o600 })
  console.log(`Created isolated DSH_HOME: ${home}`)
} else {
  const state = JSON.parse(await readFile(marker, 'utf8'))
  if (state.version !== 1 || state.home !== home) throw new Error('Not a managed harness profile')
  const alive = state.pid && spawnSync('ps', ['-p', String(state.pid), '-o', 'command='], { encoding: 'utf8' }).stdout.includes(`--port ${state.port}`)
  if (command === 'install') {
    if (alive) throw new Error('Stop this harness before installing')
    if (!args[0] || args[0].startsWith('-')) throw new Error('Supply a Git package source or tgz')
    const source = args[0].endsWith('.tgz') ? resolve(args[0]) : args[0]
    const result = spawnSync(bin, ['plugin', '--profile', 'web', 'add', source], { env, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
    await registerInstalledBundles(join(home, 'profiles', 'web'))
    await verifyInstall(join(home, 'profiles', 'web'))
    state.installs.push({ source, at: new Date().toISOString() })
  } else if (command === 'start') {
    if (alive) throw new Error('Harness is already running')
    const port = Number(args[0])
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Supply an unused port (1024..65535)')
    const log = await open(join(home, 'host.log'), 'a', 0o600)
    const child = spawn(bin, ['--profile', 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
      env, detached: true, stdio: ['ignore', log.fd, log.fd],
    })
    await new Promise((ok, fail) => { child.once('spawn', ok); child.once('error', fail) })
    child.unref()
    await log.close()
    state.pid = child.pid
    state.port = port
    console.log('Process started; verify readiness in the private host.log (contains a login URL).')
  } else if (command === 'stop') {
    if (alive) process.kill(state.pid, 'SIGTERM')
    console.log('Stop requested; verify status before installation.')
  } else {
    console.log(JSON.stringify({ home, running: !!alive, pid: state.pid, port: state.port, installs: state.installs }, null, 2))
  }
  if (command === 'install' || command === 'start') await writeFile(marker, JSON.stringify(state, null, 2), { mode: 0o600 })
}
