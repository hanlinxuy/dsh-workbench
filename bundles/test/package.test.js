import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'
for (const kind of ['core', 'workbench']) test(`${kind}: release provenance and defaults`, async () => {
  const root = new URL(`../${kind}/`, import.meta.url)
  const read = path => readFile(new URL(path, root), 'utf8')
  const pkg = JSON.parse(await read('package.json'))
  for (const version of Object.values(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.equal(!!pkg.dependencies['dsh-plugin-chatgpt'], kind === 'workbench')
  assert.ok((await read('components/chief/client.js')).includes(`id:'${pkg.name}'`))
  const patch = await read('cordis.patch.yml')
  assert.equal(patch.includes('id: chatgpt'), kind === 'workbench')
  if (kind === 'workbench') assert.match(patch, /id: chatgpt\n      disabled: true/)
  for (const id of ['independent-chief', 'workbench-browser', 'workbench-desktop', 'workbench-git']) assert.ok(patch.includes(`id: ${id}`))
  const entries = parse(patch, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).flatMap(layer => layer.insert)
  if (kind === 'workbench') assert.match(patch, /stateDir: !!js/)
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
  for (const [name, version] of Object.entries({ 'dsh-x-memory': '0.1.1', 'dsh-context': '0.83.1' })) assert.equal(pkg.dependencies[name], version)
  for (const id of ['x-memory', 'dsh-context']) {
    const entry = entries.find(entry => entry.id === id)
    assert.ok(entry, id)
    assert.equal(entry.disabled === true, false)
  }
  assert.equal(pkg.dependencies['dsh-ops'], undefined)
  assert.ok(!patch.includes('dsh-ops'))
  assert.ok(!(await read('settings/runtime.js')).includes('dsh-ops'))
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh'], '>=0.2.2-rc.1 <0.2.3-0')
  const provenance = JSON.parse(await read('provenance.json'))
  for (const [file, hash] of Object.entries(provenance.sha256)) assert.equal(createHash('sha256').update(await readFile(new URL(file, root))).digest('hex'), hash, file)
})
