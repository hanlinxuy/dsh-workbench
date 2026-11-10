import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { createGit } from './runtime.js'

const config = (platform = {}, repo = {}) => ({
  platforms: { lab: { kind: 'gitlab', network: 'internal', hosts: ['gitlab.example.invalid'], apiBase: 'https://gitlab.example.invalid/api/v4', ...platform } },
  repositories: { fixture: { path: tmpdir(), platform: 'lab', apiRepo: 'group/sub/repo', ...repo } },
})
const args = (action, extra = {}) => ({ action, repository: 'fixture', ...extra })
const opened = { iid: 7, target_branch: 'main', state: 'opened', sha: 'a'.repeat(40) }
function mock(t, data = opened) {
  const sent = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push({ url: String(url), method: options.method, body: options.body && JSON.parse(options.body), redirect: options.redirect })
    return new Response(JSON.stringify(data), { status: 200, headers: { 'x-next-page': '3' } })
  })
  return sent
}

test('GitLab MR reads use encoded project, iid and notes with pagination', async t => {
  const sent = mock(t)
  const run = createGit(config())
  const list = JSON.parse(await run(args('mr_list', { page: 2 })))
  await run(args('mr_get', { number: 7 }))
  await run(args('mr_comments_list', { number: 7, page: 2 }))
  assert.equal(list.next, '3')
  assert.equal(list.page, 2)
  assert.deepEqual(sent.map(r => r.url), [
    'https://gitlab.example.invalid/api/v4/projects/group%2Fsub%2Frepo/merge_requests?per_page=30&page=2',
    'https://gitlab.example.invalid/api/v4/projects/group%2Fsub%2Frepo/merge_requests/7',
    'https://gitlab.example.invalid/api/v4/projects/group%2Fsub%2Frepo/merge_requests/7/notes?per_page=30&page=2',
  ])
  assert.ok(sent.every(r => r.method === 'GET' && r.body === undefined && r.redirect === 'error'))
})

test('MR writes deny by default and permissions are action specific', async t => {
  const sent = mock(t)
  for (const permissions of [undefined, [], ['issue_create', 'comment_create']]) {
    const run = createGit(config({ apiWrites: permissions }, { mergeTargetBranches: ['main'] }))
    for (const action of ['mr_create', 'mr_comment', 'mr_merge']) await assert.rejects(run(args(action, { number: 7, title: 'T', body: 'B', source_branch: 'feature/a', target_branch: 'main' })), /API write is disabled/)
  }
  const external = createGit(config({ network: 'external', apiWrites: ['mr_create', 'mr_comment', 'mr_merge'] }, { mergeTargetBranches: ['main'] }))
  for (const action of ['mr_create', 'mr_comment', 'mr_merge']) await assert.rejects(external(args(action, { number: 7, title: 'T', body: 'B', source_branch: 'feature/a', target_branch: 'main' })), /internal/)
  const run = createGit(config({ apiWrites: ['mr_create'] }))
  await assert.rejects(run(args('mr_comment', { number: 7, body: 'B' })), /API write is disabled/)
  assert.equal(sent.length, 0)
})

test('authorized internal MR create/comment use POST and GitLab payloads', async t => {
  const sent = mock(t)
  const run = createGit(config({ apiWrites: ['mr_create', 'mr_comment'] }))
  await run(args('mr_create', { title: 'Title', body: 'Description', source_branch: 'feature/a', target_branch: 'main' }))
  await run(args('mr_comment', { number: 7, body: 'Comment' }))
  assert.equal(sent[0].method, 'POST')
  assert.ok(sent[0].url.endsWith('/merge_requests'))
  assert.deepEqual(sent[0].body, { title: 'Title', description: 'Description', source_branch: 'feature/a', target_branch: 'main' })
  assert.equal(sent[1].method, 'POST')
  assert.ok(sent[1].url.endsWith('/merge_requests/7/notes'))
  assert.deepEqual(sent[1].body, { body: 'Comment' })
})

test('merge requires internal platform and explicit exact target allowlist before any request', async t => {
  const sent = mock(t)
  for (const [platform, repo, target] of [
    [{ network: 'external' }, { mergeTargetBranches: ['main'] }, 'main'],
    [{}, {}, 'main'], [{}, { mergeTargetBranches: [] }, 'main'],
    [{}, { mergeTargetBranches: ['main'] }, 'release'],
    [{}, { mergeTargetBranches: ['main'] }, undefined],
  ]) {
    const run = createGit(config({ apiWrites: ['mr_merge'], ...platform }, repo))
    await assert.rejects(run(args('mr_merge', { number: 7, target_branch: target })), /internal|allowlisted|disabled/)
  }
  assert.equal(sent.length, 0)
})

test('merge checks actual MR branch and pins source SHA in PUT merge', async t => {
  const sent = mock(t)
  const run = createGit(config({ apiWrites: ['mr_merge'] }, { mergeTargetBranches: ['main'] }))
  await run(args('mr_merge', { number: 7, target_branch: 'main' }))
  assert.equal(sent.length, 2)
  assert.ok(sent[0].url.endsWith('/merge_requests/7'))
  assert.equal(sent[0].method, 'GET')
  assert.ok(sent[1].url.endsWith('/merge_requests/7/merge'))
  assert.equal(sent[1].method, 'PUT')
  assert.deepEqual(sent[1].body, { sha: opened.sha })
})

for (const [name, change] of Object.entries({ spoofed: { target_branch: 'protected' }, missing: { target_branch: undefined }, closed: { state: 'closed' }, wrongIid: { iid: 8 }, missingSHA: { sha: undefined } })) {
  test(`merge rejects ${name} actual MR without PUT`, async t => {
    const sent = mock(t, { ...opened, ...change })
    const run = createGit(config({ apiWrites: ['mr_merge'] }, { mergeTargetBranches: ['main'] }))
    await assert.rejects(run(args('mr_merge', { number: 7, target_branch: 'main' })), /Actual MR|MR must/)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].method, 'GET')
  })
}

test('MR input validation and adapter isolation reject without requests', async t => {
  const sent = mock(t)
  const run = createGit(config({ apiWrites: ['mr_create', 'mr_comment', 'mr_merge'] }, { mergeTargetBranches: ['main'] }))
  for (const action of ['mr_get', 'mr_comments_list', 'mr_comment', 'mr_merge']) {
    for (const number of [undefined, 0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(run(args(action, { number, body: 'B', target_branch: 'main' })), /MR number/)
  }
  for (const page of [0, 1.5, '2']) await assert.rejects(run(args('mr_list', { page })), /page/)
  for (const branch of ['', '-main', 'release/*', '../main', 'a..b', 'a b', 'a\\b', 'a.lock', 'a@{1}', 'a//b']) {
    await assert.rejects(run(args('mr_create', { title: 'T', body: 'B', source_branch: branch, target_branch: 'main' })), /source_branch/)
    assert.throws(() => createGit(config({}, { mergeTargetBranches: [branch] })), /allowlist/)
  }
  await assert.rejects(run(args('mr_create', { title: 'T', body: 'B', source_branch: 'main', target_branch: 'main' })), /Distinct/)
  await assert.rejects(run(args('mr_create', { title: ' ', body: 'B' })), /Title/)
  await assert.rejects(run(args('mr_comment', { number: 7, body: ' ' })), /Body/)
  const github = createGit(config({ kind: 'github', apiWrites: ['mr_create', 'mr_comment', 'mr_merge'] }))
  for (const action of ['mr_list', 'mr_get', 'mr_comments_list', 'mr_create', 'mr_comment', 'mr_merge']) await assert.rejects(github(args(action)), /GitLab adapter/)
  assert.equal(sent.length, 0)
})

test('external GitLab MR reads remain available with no write permissions', async t => {
  const sent = mock(t)
  const run = createGit(config({ network: 'external' }))
  for (const action of ['mr_list', 'mr_get', 'mr_comments_list']) await run(args(action, { number: 7 }))
  assert.equal(sent.length, 3)
  assert.ok(sent.every(r => r.method === 'GET'))
})

test('merge PUT HTTP failure is not retried', async t => {
  const methods = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    methods.push(options.method)
    return new Response(JSON.stringify(opened), { status: options.method === 'GET' ? 200 : 409 })
  })
  const run = createGit(config({ apiWrites: ['mr_merge'] }, { mergeTargetBranches: ['main'] }))
  await assert.rejects(run(args('mr_merge', { number: 7, target_branch: 'main' })), /HTTP 409; no automatic retry/)
  assert.deepEqual(methods, ['GET', 'PUT'])
})

test('merge preflight errors and ambiguous write failures never retry', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{}', { status: 403 }) })
  const run = createGit(config({ apiWrites: ['mr_merge'] }, { mergeTargetBranches: ['main'] }))
  await assert.rejects(run(args('mr_merge', { number: 7, target_branch: 'main' })), /HTTP 403/)
  assert.equal(calls, 1)
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++
    if (options.method === 'GET') return new Response(JSON.stringify(opened))
    throw new Error('ambiguous timeout')
  })
  await assert.rejects(run(args('mr_merge', { number: 7, target_branch: 'main' })), /ambiguous timeout/)
  assert.equal(calls, 3)
})
