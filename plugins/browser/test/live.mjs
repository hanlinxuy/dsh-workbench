import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createBrowser } from '../runtime.js'

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/login') {
    res.writeHead(302, { 'Set-Cookie': `user=${url.searchParams.get('user')}; Path=/; Max-Age=3600; HttpOnly`, Location: '/' })
    return res.end()
  }
  res.setHeader('Content-Type', 'text/html')
  res.end(`<h1>Account: ${req.headers.cookie || 'guest'}</h1><form action='/login'><label>User <input name='user'></label><button>Sign in</button></form><label>Note <input id='note'></label><button onclick="document.getElementById('result').textContent=document.getElementById('note').value">Save note</button><p id='result'></p>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const home = await mkdtemp(join(tmpdir(), 'wb-browser-live-'))
const options = { home, executablePath: process.env.DSH_BROWSER_EXECUTABLE }
let run = createBrowser(options)
const url = `http://127.0.0.1:${server.address().port}`
try {
  const call = async (action, target, value, account = 'alice') => {
    const raw = await run({ action, target, value, account })
    const result = JSON.parse(raw)
    assert.notEqual(result.success, false, raw)
    return raw
  }
  await call('open', url)
  assert.match(await call('snapshot'), /Sign in/)
  await call('fill', 'input[name=user]', 'alice')
  await call('click', 'button[type=submit], form button')
  assert.match(await call('text'), /user=alice/)
  await call('fill', '#note', 'FORM_VERIFIED')
  await call('click', 'button[onclick]')
  assert.match(await call('text', '#result'), /FORM_VERIFIED/)
  await call('close')
  run = createBrowser(options)
  await call('open', url)
  assert.match(await call('text'), /user=alice/)
  await call('close')
  await call('open', url, undefined, 'bob')
  assert.match(await call('text', undefined, undefined, 'bob'), /guest/)
  await call('fill', 'input[name=user]', 'bob', 'bob')
  await call('click', 'form button', undefined, 'bob')
  assert.match(await call('text', undefined, undefined, 'bob'), /user=bob/)
  await call('close', undefined, undefined, 'bob')
  await call('open', url)
  assert.match(await call('text'), /user=alice/)
  console.log('PASS: real browser form, persistent login after runtime recreation, separate account and switch back')
} finally {
  await Promise.allSettled(['alice', 'bob'].map(account => run({ action: 'close', account })))
  await new Promise(resolve => server.close(resolve))
  await rm(home, { recursive: true, force: true })
}
