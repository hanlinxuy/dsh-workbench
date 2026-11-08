import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createGit } from './runtime.js'

test('Git local writes, configured internal push, external denial and changed remote', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-git-test-'))
  const repo = join(home, 'repo'), remote = join(home, 'remote.git')
  await mkdir(repo)
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid')
    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
    git('remote', 'add', 'origin', remote)
    const config = { platforms: { internal: { kind: 'git', network: 'internal', hosts: ['local'] }, outside: { kind: 'git', network: 'external', hosts: ['local'] } }, repositories: { project: { path: repo, localWrite: true, remotes: { origin: { platform: 'internal', url: remote, push: true, fetch: true } } }, readonly: { path: repo } } }
    let run = createGit(config)
    await writeFile(join(repo, 'file.txt'), 'verified\n')
    await assert.rejects(run({ action: 'stage', repository: 'readonly', paths: ['file.txt'] }), /Local writes/)
    await run({ action: 'stage', repository: 'project', paths: ['file.txt'] })
    await run({ action: 'commit', repository: 'project', message: 'Fixture commit' })
    await run({ action: 'push', repository: 'project', branch: 'main' })
    assert.equal(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }), git('rev-parse', 'HEAD'))
    const actual = await run({ action: 'remote_head', repository: 'project', branch: 'main' })
    assert.ok(actual.startsWith(git('rev-parse', 'HEAD').trim() + '\t'))
    git('branch', 'before-change')
    await writeFile(join(repo, 'file.txt'), 'second\n')
    git('add', 'file.txt'); git('commit', '-m', 'Second commit')
    assert.doesNotMatch(await run({ action: 'log', repository: 'project', branch: 'before-change' }), /Second commit/)
    assert.match(await run({ action: 'log', repository: 'project' }), /Second commit/)
    await assert.rejects(run({ action: 'log', repository: 'project', branch: '--all' }), /Valid branch/)
    await run({ action: 'fetch', repository: 'project' })
    assert.match(await run({ action: 'log', repository: 'project' }), /Fixture commit/)
    config.repositories.project.remotes.origin.platform = 'outside'
    run = createGit(config)
    await assert.rejects(run({ action: 'push', repository: 'project', branch: 'main' }), /Push is disabled/)
    config.repositories.project.remotes.origin.platform = 'internal'
    run = createGit(config)
    git('remote', 'set-url', 'origin', join(home, 'other.git'))
    await assert.rejects(run({ action: 'fetch', repository: 'project' }), /Remote URL changed/)
    await assert.rejects(run({ action: 'stage', repository: 'project', paths: ['../secret'] }), /literal file paths/)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('GitHub/GitLab adapters: exact endpoints, write permissions, pagination and redirects', async () => {
  const requests = []
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part
    requests.push({ url: req.url, method: req.method, body: body ? JSON.parse(body) : null })
    if (req.url.includes('/redirect/')) { res.writeHead(302, { Location: '/unexpected' }); return res.end() }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: 7, ok: true }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const config = { platforms: {}, repositories: {} }
    for (const kind of ['github', 'gitlab']) {
      config.platforms[kind] = { kind, network: 'internal', hosts: ['127.0.0.1'], apiBase: `${base}/${kind}`, apiWrites: ['issue_create', 'comment_create'] }
      config.repositories[kind] = { path: tmpdir(), platform: kind, apiRepo: kind === 'github' ? 'owner/repo' : 'group/sub/repo' }
    }
    let run = createGit(config)
    for (const repository of ['github', 'gitlab']) {
      await run({ action: 'issue_create', repository, title: 'Test', body: 'Body' })
      await run({ action: 'comment_create', repository, number: 7, body: 'Comment' })
      await run({ action: 'issues_list', repository, page: 2 })
    }
    assert.equal(requests[0].url, '/github/repos/owner/repo/issues')
    assert.deepEqual(requests[0].body, { title: 'Test', body: 'Body' })
    assert.equal(requests[1].url, '/github/repos/owner/repo/issues/7/comments')
    assert.equal(requests[3].url, '/gitlab/projects/group%2Fsub%2Frepo/issues')
    assert.deepEqual(requests[3].body, { title: 'Test', description: 'Body' })
    assert.equal(requests[4].url, '/gitlab/projects/group%2Fsub%2Frepo/issues/7/notes')
    assert.match(requests[5].url, /page=2/)
    config.platforms.github.apiWrites = []
    run = createGit(config)
    await assert.rejects(run({ action: 'issue_create', repository: 'github', title: 'No', body: 'No' }), /API write is disabled/)
    await assert.rejects(run({ action: 'repo_delete', repository: 'github' }), /Unsupported/)
    assert.equal(requests.length, 6)
    config.platforms.github.apiBase = `${base}/redirect`
    run = createGit(config)
    await assert.rejects(run({ action: 'repo_get', repository: 'github' }))
    assert.equal(requests.length, 7, 'redirect not followed')
    assert.throws(() => createGit({ platforms: { bad: { kind: 'github', network: 'external', hosts: ['127.0.0.1'], apiBase: base } } }), /HTTPS/)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
