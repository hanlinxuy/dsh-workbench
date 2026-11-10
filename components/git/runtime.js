import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, win32 } from 'node:path'
const exec = promisify(execFile)
const apiWrites = ['issue_create', 'comment_create', 'mr_create', 'mr_comment', 'mr_merge']
const allowedWrites = (platform, permission) => {
  const selected = permission ? permission.write ? apiWrites : ['issue_create'] : platform.apiWrites ?? []
  return selected.filter(action => (platform.apiWrites === undefined || platform.apiWrites.includes(action)) && (platform.network === 'internal' || ['issue_create', 'comment_create'].includes(action)))
}
export function remoteHost(url) {
  if (isAbsolute(url) || win32.isAbsolute(url)) return 'local'
  if (url.includes('://')) { const parsed = new URL(url); return parsed.protocol === 'file:' ? parsed.hostname || 'local' : parsed.hostname }
  return /^(?:[^@/:]+@)?([^/:]+):[^/].*$/.exec(url)?.[1]
}
const mrActions = ['mr_list', 'mr_get', 'mr_comments_list', 'mr_create', 'mr_comment', 'mr_merge']
// Exact branch names only: no patterns, revision expressions, options or ref traversal.
const validBranch = value => typeof value === 'string' && value.length > 0 && !value.startsWith('-') && !value.startsWith('/') && !value.endsWith('/') && !value.endsWith('.') && !/[\s\x00-\x1f\x7f~^:?*\[\\]/.test(value) && !value.includes('..') && !value.includes('@{') && value !== '@' && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'))

// Configuration is operator-owned, loaded once. Tools cannot mutate policy.
export function createGit(config = {}, execute = exec, permissionFor = async () => null) {
  const { platforms = {}, repositories = {} } = config
  for (const [id, platform] of Object.entries(platforms)) {
    if (!['internal', 'external'].includes(platform.network)) throw new Error(`Invalid network: ${id}`)
    if (!['github', 'gitlab', 'git'].includes(platform.kind)) throw new Error(`Unsupported adapter: ${id}`)
    if (!Array.isArray(platform.hosts) || !platform.hosts.length || platform.hosts.some(host => typeof host !== 'string' || !host)) throw new Error(`Missing hosts: ${id}`)
    if (platform.kind !== 'git') {
      const url = new URL(platform.apiBase)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid API base: ${id}`)
      if (!platform.hosts.includes(url.hostname)) throw new Error(`API host not configured: ${id}`)
      if (platform.network === 'external' && url.protocol !== 'https:') throw new Error(`External API requires HTTPS: ${id}`)
    }
    if (platform.apiWrites !== undefined && (!Array.isArray(platform.apiWrites) || platform.apiWrites.some(action => !apiWrites.includes(action)))) throw new Error(`Unsupported API write permission: ${id}`)
    if (platform.tokenEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(platform.tokenEnv)) throw new Error(`Invalid credential reference: ${id}`)
  }
  for (const [id, repo] of Object.entries(repositories)) {
    if (!isAbsolute(repo.path ?? '')) throw new Error(`Absolute repository path required: ${id}`)
    if (repo.platform && !platforms[repo.platform]) throw new Error(`Unknown platform: ${id}`)
    if (repo.mergeTargetBranches !== undefined && (!Array.isArray(repo.mergeTargetBranches) || repo.mergeTargetBranches.some(branch => !validBranch(branch)))) throw new Error(`Invalid merge target branch allowlist: ${id}`)
    if (repo.apiRepo && !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(repo.apiRepo)) throw new Error(`Invalid API repository: ${id}`)
    for (const [remote, rule] of Object.entries(repo.remotes ?? {})) {
      if (!/^[A-Za-z0-9_.-]+$/.test(remote) || remote.startsWith('-') || !platforms[rule.platform] || typeof rule.url !== 'string') throw new Error(`Invalid remote: ${id}/${remote}`)
      if (rule.url.includes('://')) {
        const url = new URL(rule.url)
        if (url.password || (['https:', 'http:'].includes(url.protocol) && url.username)) throw new Error('Use Git credential helpers, not credentials in URLs')
      }
    }
  }
  const queues = new Map()
  return async (args, signal, cwd) => {
    // Discover only the active workspace; explicit operator policies still win.
    if (cwd && (!args.repository || args.repository === "current") && !repositories.current) {
      const { stdout } = await execute("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { signal, timeout: 10000 })
      const path = stdout.trim()
      const known = Object.entries(repositories).find(([, repo]) => repo.path === path)
      if (known) return createGit(config, execute, permissionFor)({ ...args, repository: known[0] }, signal)
      const remote = args.remote ?? "origin"
      if (!/^[A-Za-z0-9_.-]+$/.test(remote) || remote.startsWith("-")) throw new Error("Invalid remote name")
      const result = await execute("git", ["-C", path, "config", "--get", `remote.${remote}.url`], { signal, timeout: 10000 }).catch(error => { if (error.code === 1) return { stdout: "" }; throw error })
      const raw = result.stdout.trim()
      const match = /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)[:/](.+?)(?:\.git)?$/.exec(raw)
      const host = match?.[1], apiRepo = match?.[2]
      const configured = Object.entries(platforms).find(([, platform]) => platform.hosts.includes(host))
      const platformId = configured?.[0] ?? "discovered"
      const platform = configured?.[1] ?? (host === "github.com" ? { kind: "github", network: "external", hosts: [host, "api.github.com"], apiBase: "https://api.github.com", githubLogin: true } : { kind: "git", network: "external", hosts: [host || "unknown"] })
      const permission=await permissionFor(platform.hosts)
      const readOnly = { ...platform, apiWrites: allowedWrites(platform, permission) }
      return createGit({ platforms: { ...platforms, [platformId]: readOnly }, repositories: { ...repositories, current: { path, platform: platformId, apiRepo, localWrite: permission?.write===true, remotes: raw ? { [remote]: { platform: platformId, url: raw, fetch: true, push: permission?.push===true } } : {} } } }, execute, permissionFor)({ ...args, repository: "current" }, signal)
    }
    const { action, repository, remote = 'origin', branch, message, paths, number, title, body, page = 1, source_branch, target_branch } = args
    if (action === 'catalog') {
      const policies=Object.fromEntries(await Promise.all(Object.entries(platforms).map(async([id,p])=>[id,await permissionFor(p.hosts)])))
      return JSON.stringify({
        platforms:Object.fromEntries(Object.entries(platforms).map(([id,p])=>[id,{kind:p.kind,network:p.network,apiWrites:allowedWrites(p,policies[id]),permissionSource:policies[id]?'settings intersect explicit configuration':'configuration'}])),
        repositories:Object.fromEntries(Object.entries(repositories).map(([id,r])=>[id,{localWrite:r.localWrite!==false&&(policies[r.platform??r.remotes?.origin?.platform]?.write??r.localWrite===true),platform:r.platform,mergeTargetBranches:r.mergeTargetBranches??[],remotes:Object.fromEntries(Object.entries(r.remotes??{}).map(([name,rule])=>[name,{platform:rule.platform,fetch:rule.fetch===true,push:platforms[rule.platform].network==='internal'&&rule.push!==false&&(policies[rule.platform]?.push??rule.push===true)}]))}]))
      })
    }
    const repo = Object.hasOwn(repositories, repository) ? repositories[repository] : undefined
    if (!repo) throw new Error('Repository is not configured')
    const git = async argv => {
      const { stdout } = await execute('git', ['--no-pager', '-C', repo.path, ...argv], {
        signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
        env: { GIT_TERMINAL_PROMPT: '0' },
      }).catch(error => { throw new Error(`Git command failed (${error.code ?? 'terminated'}); inspect repository/credentials locally. No write is automatically retried.`) })
      return stdout
    }
    const pending = (queues.get(repository) ?? Promise.resolve()).then(async () => {
      if (action === 'log' && branch !== undefined) {
        if (typeof branch !== 'string' || branch.startsWith('-')) throw new Error('Valid branch required')
        await git(['check-ref-format', '--branch', branch])
        return git(['log', '-20', '--oneline', branch, '--'])
      }
      if (['status', 'diff', 'log', 'branches'].includes(action)) {
        return git({ status: ['status', '--short', '--branch'], diff: ['diff', '--no-ext-diff', '--no-textconv'], log: ['log', '-20', '--oneline'], branches: ['branch', '--list'] }[action])
      }
      if (['stage', 'commit', 'switch'].includes(action)) {
        const permission=await permissionFor(platforms[repo.platform ?? repo.remotes?.[remote]?.platform]?.hosts ?? [])
        if (repo.localWrite === false || (permission && !permission.write))throw new Error('Local writes are disabled by platform settings')
        if (!permission && repo.localWrite !== true) throw new Error('Local writes are disabled')
        if (action === 'stage') {
          if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.startsWith(':'))) throw new Error('Supply relative literal file paths')
          return git(['--literal-pathspecs', 'add', '--', ...paths])
        }
        if (action === 'commit') {
          if (typeof message !== 'string' || !message.trim()) throw new Error('Commit message required')
          return git(['commit', '-m', message])
        }
        if (typeof branch !== 'string' || branch.startsWith('-')) throw new Error('Branch required')
        await git(['check-ref-format', '--branch', branch])
        return git(['switch', '--no-guess', branch])
      }
      if (['fetch', 'push', 'remote_head'].includes(action)) {
        const rule = repo.remotes?.[remote]
        if (!rule) throw new Error('Remote is not configured')
        const platform = platforms[rule.platform]
        const permission=await permissionFor(platform.hosts)
        if (action === 'push' && (platform.network === 'external' || rule.push === false || (permission ? !permission.push : rule.push !== true))) throw new Error('Push is disabled for this remote')
        if (action !== 'push' && rule.fetch !== true) throw new Error('Remote reads are disabled for this remote')
        // get-url expands insteadOf/pushInsteadOf; verify every push destination.
        const urls = (await git(['remote', 'get-url', ...(action === 'push' ? ['--push'] : []), '--all', remote])).trim().split('\n')
        if (urls.some(url => url !== rule.url)) throw new Error('Remote URL changed; operator must update configuration')
        const host = remoteHost(rule.url)
        if (!platform.hosts.includes(host)) throw new Error(`Remote host is not allowed: ${host ?? 'unrecognized'}`)
        if (action === 'fetch') return git(['-c', 'http.followRedirects=false', 'fetch', '--no-recurse-submodules', remote])
        if (typeof branch !== 'string' || branch.startsWith('-')) throw new Error('Explicit destination branch required')
        await git(['check-ref-format', `refs/heads/${branch}`])
        if (action === 'remote_head') return git(['-c', 'http.followRedirects=false', 'ls-remote', '--exit-code', '--heads', remote, `refs/heads/${branch}`])
        return git(['-c', 'http.followRedirects=false', '-c', 'push.followTags=false', 'push', '--no-follow-tags', '--recurse-submodules=no', remote, `refs/heads/${branch}:refs/heads/${branch}`])
      }
      const platform = platforms[repo.platform]
      if (!platform || platform.kind === 'git' || !repo.apiRepo) throw new Error('No API adapter configured for this repository')
      if (!['repo_get', 'issues_list', 'issue_get', 'comments_list', ...apiWrites, ...mrActions].includes(action)) throw new Error('Unsupported platform operation')
      const mr = mrActions.includes(action)
      if (mr && platform.kind !== 'gitlab') throw new Error('MR operations require a GitLab adapter')
      const write = apiWrites.includes(action)
      if (mr && write && platform.network !== 'internal') throw new Error('MR writes require an internal platform')
      const permission=await permissionFor(platform.hosts)
      if (write && !allowedWrites(platform, permission).includes(action)) throw new Error('API write is disabled')
      if (['issue_get', 'comments_list', 'comment_create'].includes(action) && (!Number.isSafeInteger(number) || number < 1)) throw new Error('Positive issue number required')
      if (['mr_get', 'mr_comments_list', 'mr_comment', 'mr_merge'].includes(action) && (!Number.isSafeInteger(number) || number < 1)) throw new Error('Positive MR number required')
      if (!Number.isSafeInteger(page) || page < 1) throw new Error('Positive page required')
      if (write && action !== 'mr_merge' && (typeof body !== 'string' || !body.trim())) throw new Error('Body required')
      if (['issue_create', 'mr_create'].includes(action) && (typeof title !== 'string' || !title.trim())) throw new Error('Title required')
      if (action === 'mr_create' && (!validBranch(source_branch) || !validBranch(target_branch) || source_branch === target_branch)) throw new Error('Distinct valid source_branch and target_branch required')
      if (action === 'mr_merge') {
        if (!validBranch(target_branch) || !repo.mergeTargetBranches?.includes(target_branch)) throw new Error('MR target_branch is not allowlisted')
      }
      const github = platform.kind === 'github'
      const prefix = github ? `repos/${repo.apiRepo.split('/').map(encodeURIComponent).join('/')}` : `projects/${encodeURIComponent(repo.apiRepo)}`
      const mrPath = `/merge_requests/${number}`
      const suffix = { repo_get: '', issues_list: '/issues', issue_get: `/issues/${number}`, comments_list: `/issues/${number}/${github ? 'comments' : 'notes'}`, issue_create: '/issues', comment_create: `/issues/${number}/${github ? 'comments' : 'notes'}`, mr_list: '/merge_requests', mr_get: mrPath, mr_comments_list: `${mrPath}/notes`, mr_create: '/merge_requests', mr_comment: `${mrPath}/notes`, mr_merge: `${mrPath}/merge` }[action]
      const url = new URL(platform.apiBase.replace(/\/$/, '') + '/' + prefix + suffix)
      if (['issues_list', 'comments_list', 'mr_list', 'mr_comments_list'].includes(action)) { url.searchParams.set('per_page', '30'); url.searchParams.set('page', String(page)) }
      let token = platform.tokenEnv ? process.env[platform.tokenEnv] : undefined
      if (!token && platform.githubLogin) token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (await execute("gh", ["auth", "token", "--hostname", "github.com"], { signal, timeout: 10000 }).catch(() => ({ stdout: "" }))).stdout.trim()
      if (platform.tokenEnv && !token) throw new Error(`Credential environment variable missing: ${platform.tokenEnv}`)
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? github ? { Authorization: `Bearer ${token}` } : { 'PRIVATE-TOKEN': token } : {}) }
      const request = async (target, method = 'GET', payload) => {
        const response = await fetch(target, { method, headers, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
        if (!response.ok) throw new Error(`Platform HTTP ${response.status}; no automatic retry`)
        return response
      }
      let payload = action === 'mr_create' ? { title, description: body, source_branch, target_branch } : action === 'issue_create' ? { title, [github ? 'body' : 'description']: body } : { body }
      if (action === 'mr_merge') {
        // Never trust the caller's target: read this MR from this configured project.
        const actual = await (await request(new URL(platform.apiBase.replace(/\/$/, '') + '/' + prefix + mrPath))).json()
        if (actual?.target_branch !== target_branch || !repo.mergeTargetBranches.includes(actual.target_branch)) throw new Error('Actual MR target branch does not match the allowlisted target_branch')
        if (actual.state !== 'opened' || actual.iid !== number || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(actual.sha ?? '')) throw new Error('MR must be opened with matching iid and a valid head SHA')
        // GitLab rejects a changed source head rather than merging unreviewed commits.
        payload = { sha: actual.sha }
      }
      const response = await request(url, action === 'mr_merge' ? 'PUT' : write ? 'POST' : 'GET', write ? payload : undefined)
      return JSON.stringify({ data: await response.json(), page, next: response.headers.get('x-next-page') || response.headers.get('link') || null })
    })
    const settled = pending.then(() => {}, () => {})
    queues.set(repository, settled)
    void settled.then(() => { if (queues.get(repository) === settled) queues.delete(repository) })
    return pending
  }
}
