// Opt-in live, read-only integration test. Requires a running HTTP CONNECT proxy.
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createGit } from '../runtime.js'

if (process.argv[2] === 'worker') {
  const action = process.argv[3], directory = process.argv[4]
  const run = createGit({ platforms: { public: { kind: 'github', network: 'external', hosts: ['github.com', 'api.github.com'], apiBase: 'https://api.github.com', apiWrites: [] } }, repositories: { fixture: { path: directory, platform: 'public', apiRepo: 'hanlinxuy/dsh-workbench', remotes: { origin: { platform: 'public', url: 'https://github.com/hanlinxuy/dsh-workbench.git', fetch: true, push: false } } } } })
  await run({ action, repository: 'fixture' })
  console.log(JSON.stringify({ action, pass: true }))
} else {
  const proxy = new URL(process.env.CLASH_PROXY_URL || 'http://127.0.0.1:49159')
  assert.equal(proxy.protocol, 'http:')
  const home = await mkdtemp(join(tmpdir(), 'wb-proxy-'))
  const repo = join(home, 'repo'); await mkdir(repo)
  const globalConfig = join(home, 'gitconfig'); await writeFile(globalConfig, '')
  const tunnels = [], sockets = new Set()
  const relay = createServer((_req, res) => { res.writeHead(405); res.end() })
  relay.on('connect', (req, client, head) => {
    assert.ok(['api.github.com:443', 'github.com:443'].includes(req.url))
    tunnels.push(req.url)
    const upstream = connect(Number(proxy.port) || 80, proxy.hostname)
    for (const socket of [client, upstream]) { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => { client.destroy(); upstream.destroy() }) }
    upstream.on('connect', () => { upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\n\r\n`); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client) })
  })
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))
  const relayUrl = `http://127.0.0.1:${relay.address().port}`
  const child = (bin, args, selectedProxy) => new Promise(resolve => {
    const env = { ...process.env, NODE_USE_ENV_PROXY: '1', HTTP_PROXY: selectedProxy, HTTPS_PROXY: selectedProxy, http_proxy: selectedProxy, https_proxy: selectedProxy, ALL_PROXY: '', all_proxy: '', NO_PROXY: '', no_proxy: '', GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' }
    const proc = spawn(bin, args, { env }); let output = ''
    proc.stdout.on('data', data => { output += data }); proc.stderr.on('data', () => {})
    proc.on('error', () => resolve({ code: -1, output }))
    proc.on('close', code => resolve({ code, output }))
  })
  try {
    assert.equal((await child('git', ['init', '-b', 'main', repo], relayUrl)).code, 0)
    assert.equal((await child('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/hanlinxuy/dsh-workbench.git'], relayUrl)).code, 0)
    for (const action of ['repo_get', 'fetch']) {
      const result = await child(process.execPath, [fileURLToPath(import.meta.url), 'worker', action, repo], relayUrl)
      assert.equal(result.code, 0, `${action} through Clash failed`)
      const negative = await child(process.execPath, [fileURLToPath(import.meta.url), 'worker', action, repo], 'http://127.0.0.1:1')
      assert.notEqual(negative.code, 0, `${action} unexpectedly bypassed unavailable proxy`)
    }
    assert.ok(tunnels.includes('api.github.com:443')); assert.ok(tunnels.includes('github.com:443'))
    console.log(JSON.stringify({ pass: true, tunnels, checks: ['API GET through Clash', 'Git fetch through Clash', 'both fail with unavailable proxy'], writes: 0 }))
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => relay.close(resolve)); await rm(home, { recursive: true, force: true })
  }
}
