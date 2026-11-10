import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyInstall(profile) {
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  const migration = await readFile(join(profile, 'workbench-migration.json'), 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return { handled: [] }; throw error })
  const suiteActive = manifest.dsh?.profile?.bundles?.some(name => ['dsh-workbench-core', 'dsh-workbench-suite'].includes(name))
  const dependencies = Object.keys(manifest.dependencies ?? {})
  if (!dependencies.length) throw new Error('No plugin package was installed')
  for (const name of dependencies) {
    const pkg = JSON.parse(await readFile(join(profile, 'node_modules', name, 'package.json'), 'utf8'))
    if (!pkg.dsh?.bundle?.patch) throw new Error(`${name} is a plain dependency, not a DSH bundle. Check the Git branch/subdirectory or install the package tgz.`)
    if (!manifest.dsh?.profile?.bundles?.includes(name) && !(suiteActive && migration.handled.includes(name))) throw new Error(`${name} was downloaded but is not registered in dsh.profile.bundles; installation is incomplete.`)
  }
  return dependencies
}

// dsh plugin is a pnpm forwarding CLI on some hosts. Register only validated
// bundle dependencies after installation; never silently register a source root.
export async function registerInstalledBundles(profile) {
  const {writeFile,rename}=await import('node:fs/promises')
  const file=join(profile,'package.json'),manifest=JSON.parse(await readFile(file,'utf8'))
  const additions=[]
  for(const name of Object.keys(manifest.dependencies??{})){
    const pkg=JSON.parse(await readFile(join(profile,'node_modules',name,'package.json'),'utf8'))
    if(!pkg.dsh?.bundle?.patch)throw Error(`${name} is not a DSH bundle; no registration changed`)
    await readFile(join(profile,'node_modules',name,pkg.dsh.bundle.patch),'utf8')
    additions.push(name)
  }
  manifest.dsh??={};manifest.dsh.profile??={};manifest.dsh.profile.bundles=[...new Set([...(manifest.dsh.profile.bundles??[]),...additions])]
  await writeFile(file+'.tmp',JSON.stringify(manifest,null,2)+'\n');await rename(file+'.tmp',file)
  return additions
}
