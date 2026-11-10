import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) throw new Error('Commit the release before generating package branches')
execFileSync(process.execPath, ['scripts/build-bundles.mjs', '--check'], { cwd, stdio: 'inherit' })
for (const kind of ['core', 'workbench']) {
  const branch = `release/${kind}`
  const commit = git('subtree', 'split', `--prefix=bundles/${kind}`, 'HEAD')
  const pkg = JSON.parse(git('show', `${commit}:package.json`))
  if (!pkg.dsh?.bundle?.patch || pkg.name !== `dsh-workbench-${kind === 'core' ? 'core' : 'suite'}`) {
    throw new Error(`Invalid package root for ${branch}`)
  }
  const previous = git('for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`)
  if (previous) git('merge-base', '--is-ancestor', previous, commit)
  git('update-ref', `refs/heads/${branch}`, commit, previous || '0'.repeat(40))
  console.log(`${branch}: ${commit} (${pkg.name}@${pkg.version})`)
}
console.log('Validate these commits, then push release/core and release/workbench. No profile was changed.')
