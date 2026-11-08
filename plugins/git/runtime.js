import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute } from 'node:path'
const exec = promisify(execFile)

// Configuration is operator-owned, loaded once. Tools cannot mutate policy.
export function createGit(config = {}) {
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
    if (platform.apiWrites !== undefined && (!Array.isArray(platform.apiWrites) || platform.apiWrites.some(action => !['issue_create', 'comment_create'].includes(action)))) throw new Error(`Unsupported API write permission: ${id}`)
    if (platform.tokenEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(platform.tokenEnv)) throw new Error(`Invalid credential reference: ${id}`)
  }
  for (const [id, repo] of Object.entries(repositories)) {
    if (!isAbsolute(repo.path ?? '')) throw new Error(`Absolute repository path required: ${id}`)
    if (repo.platform && !platforms[repo.platform]) throw new Error(`Unknown platform: ${id}`)
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
  return async (args, signal) => {
    const { action, repository, remote = 'origin', branch, message, paths, number, title, body, page = 1 } = args
    if (action === 'catalog') return JSON.stringify({
      platforms: Object.fromEntries(Object.entries(platforms).map(([id, p]) => [id, { kind: p.kind, network: p.network, apiWrites: p.apiWrites ?? [] }])),
      repositories: Object.fromEntries(Object.entries(repositories).map(([id, r]) => [id, { localWrite: r.localWrite === true, platform: r.platform, remotes: Object.fromEntries(Object.entries(r.remotes ?? {}).map(([name, rule]) => [name, { platform: rule.platform, fetch: rule.fetch === true, push: rule.push === true && platforms[rule.platform].network === 'internal' }])) }])),
    })
    const repo = Object.hasOwn(repositories, repository) ? repositories[repository] : undefined
    if (!repo) throw new Error('Repository is not configured')
    const git = async argv => {
      const { stdout } = await exec('git', ['--no-pager', '-C', repo.path, ...argv], {
        signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
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
        if (repo.localWrite !== true) throw new Error('Local writes are disabled')
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
        if (action === 'push' && (platform.network === 'external' || rule.push !== true)) throw new Error('Push is disabled for this remote')
        if (action !== 'push' && rule.fetch !== true) throw new Error('Remote reads are disabled for this remote')
        // get-url expands insteadOf/pushInsteadOf; verify every push destination.
        const urls = (await git(['remote', 'get-url', ...(action === 'push' ? ['--push'] : []), '--all', remote])).trim().split('\n')
        if (urls.some(url => url !== rule.url)) throw new Error('Remote URL changed; operator must update configuration')
        let host
        if (rule.url.includes('://')) host = new URL(rule.url).hostname
        else host = /^(?:[^@/:]+@)?([^/:]+):[^/].*$/.exec(rule.url)?.[1]
        if (!host && isAbsolute(rule.url)) host = 'local'
        if (!platform.hosts.includes(host)) throw new Error('Remote host is not allowed')
        if (action === 'fetch') return git(['-c', 'http.followRedirects=false', 'fetch', '--no-recurse-submodules', remote])
        if (typeof branch !== 'string' || branch.startsWith('-')) throw new Error('Explicit destination branch required')
        await git(['check-ref-format', `refs/heads/${branch}`])
        if (action === 'remote_head') return git(['-c', 'http.followRedirects=false', 'ls-remote', '--exit-code', '--heads', remote, `refs/heads/${branch}`])
        return git(['-c', 'http.followRedirects=false', '-c', 'push.followTags=false', 'push', '--no-follow-tags', '--recurse-submodules=no', remote, `HEAD:refs/heads/${branch}`])
      }
      const platform = platforms[repo.platform]
      if (!platform || platform.kind === 'git' || !repo.apiRepo) throw new Error('No API adapter configured for this repository')
      if (!['repo_get', 'issues_list', 'issue_get', 'comments_list', 'issue_create', 'comment_create'].includes(action)) throw new Error('Unsupported platform operation')
      const write = ['issue_create', 'comment_create'].includes(action)
      if (write && !platform.apiWrites?.includes(action)) throw new Error('API write is disabled')
      if (['issue_get', 'comments_list', 'comment_create'].includes(action) && (!Number.isSafeInteger(number) || number < 1)) throw new Error('Positive issue number required')
      if (!Number.isSafeInteger(page) || page < 1) throw new Error('Positive page required')
      if (write && (typeof body !== 'string' || !body.trim())) throw new Error('Body required')
      if (action === 'issue_create' && (typeof title !== 'string' || !title.trim())) throw new Error('Title required')
      const github = platform.kind === 'github'
      const prefix = github ? `repos/${repo.apiRepo.split('/').map(encodeURIComponent).join('/')}` : `projects/${encodeURIComponent(repo.apiRepo)}`
      const suffix = { repo_get: '', issues_list: '/issues', issue_get: `/issues/${number}`, comments_list: `/issues/${number}/${github ? 'comments' : 'notes'}`, issue_create: '/issues', comment_create: `/issues/${number}/${github ? 'comments' : 'notes'}` }[action]
      const url = new URL(platform.apiBase.replace(/\/$/, '') + '/' + prefix + suffix)
      if (['issues_list', 'comments_list'].includes(action)) { url.searchParams.set('per_page', '30'); url.searchParams.set('page', String(page)) }
      const token = platform.tokenEnv ? process.env[platform.tokenEnv] : undefined
      if (platform.tokenEnv && !token) throw new Error(`Credential environment variable missing: ${platform.tokenEnv}`)
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? github ? { Authorization: `Bearer ${token}` } : { 'PRIVATE-TOKEN': token } : {}) }
      const payload = action === 'issue_create' ? { title, [github ? 'body' : 'description']: body } : { body }
      const response = await fetch(url, { method: write ? 'POST' : 'GET', headers, ...(write ? { body: JSON.stringify(payload) } : {}), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`Platform HTTP ${response.status}; no automatic retry`)
      return JSON.stringify({ data: await response.json(), page, next: response.headers.get('x-next-page') || response.headers.get('link') || null })
    })
    const settled = pending.then(() => {}, () => {})
    queues.set(repository, settled)
    void settled.then(() => { if (queues.get(repository) === settled) queues.delete(repository) })
    return pending
  }
}
