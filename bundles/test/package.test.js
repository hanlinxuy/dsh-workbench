import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
for (const kind of ['core', 'workbench']) test(`${kind}: release provenance and defaults`, async () => {
  const root = new URL(`../${kind}/`, import.meta.url)
  const read = path => readFile(new URL(path, root), 'utf8')
  const pkg = JSON.parse(await read('package.json'))
  for (const version of Object.values(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.equal(!!pkg.dependencies['dsh-plugin-chatgpt'], kind === 'workbench')
  const patch = await read('cordis.patch.yml')
  assert.equal(patch.includes('id: chatgpt'), kind === 'workbench')
  if (kind === 'workbench') assert.match(patch, /id: chatgpt\n      disabled: true/)
  for (const id of ['independent-chief', 'workbench-browser', 'workbench-desktop', 'workbench-git']) assert.ok(patch.includes(`id: ${id}`))
  const provenance = JSON.parse(await read('provenance.json'))
  for (const [file, hash] of Object.entries(provenance.sha256)) assert.equal(createHash('sha256').update(await readFile(new URL(file, root))).digest('hex'), hash, file)
})
