// Isolated profile only; authenticates locally, never prints the login cookie.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash, createHmac } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'
import assert from 'node:assert/strict'
import YAML from 'yaml'
const name = process.env.SUITE_PROFILE || 'suite-001'
assert.match(name, /^suite-[a-z0-9-]+$/)
const home = join(homedir(), '.local/state/dsh-workbench-harness', name)
const authority = `127.0.0.1:${process.env.SUITE_PORT || '19457'}`, origin = `http://${authority}`
const credentials = YAML.parse(await readFile(join(home, '.credentials.yaml'), 'utf8'))
const secret = Buffer.from(credentials.records['client-connection/browser-session'].payload.secret, 'base64url')
const body = Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: Date.now(), expiresAt: Date.now() + 300000 })).toString('base64url')
const cookie = `dsh-auth-${createHash('sha256').update(authority).digest('base64url')}=v1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
const rpc = async input => {
  const response = await fetch(origin + '/api/workbench-suite-test', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin }, body: JSON.stringify(input) })
  const result = await response.json()
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const inspect = () => rpc({ action: 'inspect' })
const toggle = (id, enabled) => rpc({ action: 'toggle', id: `include:${id}`, enabled })
const state = () => readFile(join(home, 'independent-chief/state.json'), 'utf8').then(JSON.parse)
if (process.argv[2] === 'persistent') {
  const current = await inspect(), baseline = JSON.parse(await readFile(join(home, 'suite-baseline.json'), 'utf8'))
  assert.ok(!current.tools.includes('workbench_browser'))
  assert.ok(current.tools.includes('workbench_desktop'))
  assert.ok(!current.providers.includes('chatgpt'))
  assert.equal((await state()).chiefSessionId, baseline.chiefId)
  const project = (await state()).projects.find(p => p.name === 'Suite acceptance')
  assert.equal(project.sessionId, baseline.projectSessionId)
  const memory = await readFile(join(home, 'independent-chief/memory/projects', project.id + '.md'), 'utf8')
  for (const text of ['SUITE_MEMORY_PRESERVED', 'test blocker', 'test next step']) assert.ok(memory.includes(text))
  console.log('PASS: persisted switches, Chief/project identities, goal, blockers and next steps')
} else {
  let current = await inspect()
  assert.deepEqual(current.tools.sort(), ['workbench_browser', 'workbench_desktop', 'workbench_git'])
  assert.ok(current.presets.includes('independent-chief'))
  assert.equal(current.clients.filter(c => ['independent-chief', 'dsh-workbench-suite'].includes(c.id)).length, 1)
  assert.ok(!current.providers.includes('chatgpt'))
  assert.ok(!current.clients.some(c => c.id.includes('chatgpt')))
  const chiefId = await rpc({ action: 'seed' })
  const catalog = JSON.parse(await rpc({ action: 'call', name: 'workbench_git', args: { action: 'catalog' } }))
  assert.deepEqual(catalog.repositories, {})
  await assert.rejects(rpc({ action: 'call', name: 'workbench_git', args: { action: 'commit', repository: 'unconfigured', message: 'must fail' } }), /not configured/)
  for (const part of ['browser', 'desktop', 'git']) {
    await toggle(`workbench-${part}`, false)
    current = await inspect()
    assert.ok(!current.tools.includes(`workbench_${part}`))
    assert.ok(!current.sections.includes(`workbench-${part}`))
    await assert.rejects(rpc({ action: 'call', name: `workbench_${part}`, args: { action: 'version' } }))
    await toggle(`workbench-${part}`, true)
    assert.ok((await inspect()).tools.includes(`workbench_${part}`))
  }
  await toggle('independent-chief', false)
  current = await inspect()
  assert.ok(!current.presets.includes('independent-chief'))
  assert.ok(!current.sections.includes('independent-chief'))
  assert.ok(!current.clients.some(c => ['independent-chief', 'dsh-workbench-suite'].includes(c.id)))
  await toggle('independent-chief', true)
  assert.ok((await inspect()).presets.includes('independent-chief'))
  assert.equal((await state()).chiefSessionId, chiefId)
  await toggle('chatgpt', true)
  current = await inspect()
  assert.ok(current.providers.includes('chatgpt'))
  assert.ok(current.clients.some(c => c.id.includes('chatgpt')))
  await toggle('chatgpt', false)
  current = await inspect()
  assert.ok(!current.providers.includes('chatgpt'))
  assert.ok(!current.clients.some(c => c.id.includes('chatgpt')))
  assert.match(await rpc({ action: 'call', name: 'workbench_desktop', args: { action: 'version' } }), /1\.2\.0/)
  assert.match(await rpc({ action: 'call', name: 'workbench_browser', args: { action: 'version' } }), /0\.41\.2/)
  await toggle('workbench-browser', false)
  const project = (await state()).projects.find(p => p.name === 'Suite acceptance')
  await writeFile(join(home, 'suite-baseline.json'), JSON.stringify({ chiefId, projectSessionId: project.sessionId }, null, 2), { mode: 0o600 })
  console.log('PASS: defaults; tool/prompt/UI/provider unload and reload; restricted Git; component versions; seeded persistent memory')
}
