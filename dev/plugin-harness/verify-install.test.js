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

test('migrated standalone bundles may remain installed but require an active suite', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'workbench-migrated-'))
  try {
    const names=['dsh-x-memory','dsh-workbench-core']
    for(const name of names){
      await mkdir(join(profile,'node_modules',name),{recursive:true})
      await writeFile(join(profile,'node_modules',name,'package.json'),JSON.stringify({dsh:{bundle:{patch:'patch.yml'}}}))
    }
    const manifest={dependencies:Object.fromEntries(names.map(name=>[name,'1.0.0'])),dsh:{profile:{bundles:['dsh-workbench-core']}}}
    await writeFile(join(profile,'package.json'),JSON.stringify(manifest))
    await writeFile(join(profile,'workbench-migration.json'),JSON.stringify({handled:['dsh-x-memory']}))
    assert.deepEqual(await verifyInstall(profile),names)
    manifest.dsh.profile.bundles=[]
    await writeFile(join(profile,'package.json'),JSON.stringify(manifest))
    await assert.rejects(verifyInstall(profile),/not registered/)
  } finally { await rm(profile,{recursive:true,force:true}) }
})

test('CLI installation explicitly registers validated bundles, preserves base and rejects source roots',async()=>{
 const {registerInstalledBundles}=await import('./scripts/verify-install.mjs')
 const profile=await mkdtemp(join(tmpdir(),'cli-registration-'))
 try{await mkdir(join(profile,'node_modules/fixture'),{recursive:true});const manifest={dependencies:{fixture:'1'},dsh:{profile:{bundles:['base']}}};await writeFile(join(profile,'package.json'),JSON.stringify(manifest));await writeFile(join(profile,'node_modules/fixture/package.json'),'{}');await assert.rejects(registerInstalledBundles(profile),/not a DSH bundle/);await writeFile(join(profile,'node_modules/fixture/package.json'),JSON.stringify({dsh:{bundle:{patch:'patch.yml'}}}));await writeFile(join(profile,'node_modules/fixture/patch.yml'),'[]');await registerInstalledBundles(profile);await registerInstalledBundles(profile);assert.deepEqual(await verifyInstall(profile),['fixture'])}finally{await rm(profile,{recursive:true,force:true})}
})
