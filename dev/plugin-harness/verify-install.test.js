import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyInstall } from './scripts/verify-install.mjs'

test('an installed source root or unregistered bundle is an installation failure', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workbench-install-'))
  const name = 'fixture'
  const pkgDir = join(profile, 'node_modules', name)
  try {
    await mkdir(pkgDir, { recursive: true })
    const manifest = { dependencies: { [name]: 'file:fixture' }, dsh: { profile: { bundles: [] } } }
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name }))
    await assert.rejects(verifyInstall(profile), /plain dependency/)
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name, dsh: { bundle: { patch: './patch.yml' } } }))
    await assert.rejects(verifyInstall(profile), /not registered/)
    manifest.dsh.profile.bundles.push(name)
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest))
    assert.deepEqual(await verifyInstall(profile), [name])
  } finally { await rm(profile, { recursive: true, force: true }) }
})
