import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

function parsePrivateJSON(text){
  try{return JSON.parse(text)}catch{throw Error('Invalid private browser state; no values returned')}
}
const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const launcher = join(dirname(require.resolve('agent-browser/package.json')), 'bin/agent-browser.js')

export function createBrowser({ home, executablePath, headed = false, accounts={}, sites={}, credentials }, execute = exec) {
  const cookieRefs=new Set()
  for(const [id,site] of Object.entries(sites)){
    if(!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||!site||!Object.hasOwn(accounts,site.account)||!Array.isArray(site.allowedHosts)||!site.allowedHosts.length||site.allowedHosts.some(host=>typeof host!=='string'||!/^[a-z0-9.-]+$/i.test(host)))throw Error(`Invalid site/account route: ${id}`)
    if(site.cookieRef!==undefined){if(!/^[A-Z_][A-Z0-9_]*$/.test(site.cookieRef)||cookieRefs.has(site.cookieRef))throw Error('Cookie ref must be unique per site/account');cookieRefs.add(site.cookieRef)}
  }
  const queues = new Map()
  return async ({ action, account, site, target, value }, signal) => {
    const route=site===undefined?undefined:sites[site]
    if(site!==undefined&&!route)throw Error('Unknown site route; configure the site before use')
    if(route && account!==undefined && account!==route.account)throw Error('Site account is operator configured; tool arguments cannot switch its identity')
    account=route?.account??account??'default'
    if(Object.keys(accounts).length && !Object.hasOwn(accounts,account))throw Error('Configured account missing; no fallback to default identity')
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(account)) throw new Error('account must contain 1-48 letters, digits, underscores or hyphens')
    // Fail closed: a caller-supplied confirm flag is not host approval. Do not
    // forward expressions to AB until per-call approval and audit are verified.
    if (action === 'eval' || action === 'evaluate') {
      throw new Error('Browser eval is unavailable: verified per-call host approval and result-safe audit are not integrated; confirm=true does not authorize JavaScript')
    }
    if(['capture','restore'].includes(action) && (!route?.cookieRef||!credentials))throw Error('Configure a site cookieRef and host credential store first')
    const commands = {
      capture:()=>['cookies','get'],
      restore:()=>['get','url'],
      open: () => {
        const url = new URL(target)
        // Navigation must not become an alternate JavaScript execution surface.
        if(route&&!route.allowedHosts.includes(url.hostname))throw Error('host_mismatch: navigation is outside this site route')
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Browser open supports only HTTP(S) URLs')
        return ['open', url.href]
      },
      snapshot: () => ['snapshot', '-i'],
      click: () => ['click', target],
      fill: () => ['fill', target, value],
      select: () => ['select', target, value],
      press: () => ['press', target],
      text: () => ['get', 'text', target || 'body'],
      url: () => ['get', 'url'],
      wait: () => ['wait', target],
      back: () => ['back'],
      close: () => ['close'],
      version: () => ['--version'],
    }
    if (!Object.hasOwn(commands, action)) throw new Error('Unsupported browser action')
    const command = commands[action]()
    if (action !== 'version' && command.some(arg => typeof arg !== 'string' || arg.startsWith('--'))) throw new Error('Missing argument or unsupported option')
    const root = route?join(home,'sites',site,'accounts',account):join(home, 'accounts', account)
    const queueKey=route?`${site}/${account}`:account
    const session = `wb-${createHash('sha256').update(root).digest('hex').slice(0, 20)}`
    // Serialize commands sharing one login profile. Different accounts remain independent.
    const previous = queues.get(queueKey) ?? Promise.resolve()
    const pending = previous.then(async () => {
      await mkdir(root, { recursive: true, mode: 0o700 })
      const config = join(root, 'browser.json')
      await writeFile(config, '{}', { mode: 0o600 })
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USERPROFILE|TMP|TEMP|TMPDIR|LANG|LC_.*|SystemRoot|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)))
      // Desktop's process.execPath is Electron. Keep its child in Node mode
      // without forwarding the rest of the host environment.
      if(process.versions.electron)env.ELECTRON_RUN_AS_NODE='1'
      const args = action === 'version' ? ['--version'] : [
        '--config', config, '--session', session, '--profile', join(root, 'profile'),
        '--json', ...(headed ? ['--headed'] : []),
        ...(executablePath ? ['--executable-path', executablePath] : []), ...command,
      ]
      if(route && !['open','close','version'].includes(action)){
        const base=args.slice(0,args.length-command.length)
        const probe=await execute(process.execPath,[launcher,...base,'get','url'],{env,cwd:root,signal,timeout:10000,maxBuffer:65536}).catch(()=>{throw Error('not_logged_in: open the configured site in its dedicated profile first')})
        const current=parsePrivateJSON(probe.stdout)
        const url=current.data?.url
        if(typeof url!=='string'||!route.allowedHosts.includes(new URL(url).hostname))throw Error('host_mismatch: current browser page is outside the configured site; no action dispatched')
      }
      if(action==='restore'){
        const saved=await credentials.resolve(route.cookieRef)
        if(!saved?.value)throw Error('not_logged_in: capture login for this site first')
        const record=parsePrivateJSON(saved.value)
        if(record.site!==site||record.account!==account)throw Error('captured_for_other_site: cookie identity does not match this route')
        if(!Array.isArray(record.cookies)||record.cookies.some(c=>!c||typeof c.domain!=='string'||typeof c.name!=='string'||typeof c.value!=='string'||typeof c.expires!=='number'))throw Error('Invalid private cookie record; capture again')
        const cookies=record.cookies.filter(c=>c.expires===-1||c.expires>Date.now()/1000)
        if(!cookies.length)throw Error('expired: sign in again in this dedicated profile')
        const base=args.slice(0,args.length-command.length)
        for(const cookie of cookies){
          const domain=cookie.domain.replace(/^\./,'')
          if(!route.allowedHosts.some(host=>host===domain||host.endsWith('.'+domain)))throw Error('host_mismatch: stored cookie is outside this site')
          const options=['--domain',cookie.domain,'--path',cookie.path??'/',...(cookie.httpOnly?['--http-only']:[]),...(cookie.secure?['--secure']:[]),...(cookie.sameSite?['--same-site',cookie.sameSite]:[]),...(cookie.expires>0?['--expires',String(cookie.expires)]:[])]
          const restored=await execute(process.execPath,[launcher,...base,'cookies','set',cookie.name,cookie.value,...options],{env,cwd:root,signal,timeout:10000,maxBuffer:65536}).catch(()=>{throw Error('Cookie restore failed; inspect login state before retrying')})
          if(parsePrivateJSON(restored.stdout).success!==true)throw Error('Cookie restore failed; inspect login state before retrying')
        }
        return JSON.stringify({site,account,restored:cookies.length,expired:record.cookies.length-cookies.length})
      }
      const { stdout, stderr } = await execute(process.execPath, [launcher, ...args], {
        env, cwd: root, signal, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      }).catch(error => {
        // execFile errors include the complete command (possibly a password).
        // Keep its diagnostic output, never the command string.
        if(action==='capture')throw Error('Cookie capture failed; no cookie values returned')
        throw new Error(`agent-browser failed (${error.code ?? 'terminated'}): ${error.stderr || error.stdout || 'no output'}`)
      })
      if(action==='capture'){
        const result=parsePrivateJSON(stdout),cookies=result.data?.cookies
        if(!result.success||!Array.isArray(cookies))throw Error('not_logged_in: cookie capture returned no valid session')
        const kept=cookies.filter(c=>typeof c.domain==='string'&&typeof c.name==='string'&&typeof c.value==='string'&&route.allowedHosts.some(host=>host===c.domain.replace(/^\./,'')||host.endsWith('.'+c.domain.replace(/^\./,'')))&&(c.expires===-1||c.expires>Date.now()/1000))
        if(!kept.length)throw Error('not_logged_in: no live cookies for this site; sign in first')
        const capturedAt=new Date().toISOString()
        await credentials.set(route.cookieRef,JSON.stringify({site,account,capturedAt,cookies:kept})).catch(()=>{throw Error('Cookie credential storage unavailable')})
        return JSON.stringify({site,account,kept:kept.length,dropped:cookies.length-kept.length,capturedAt})
      }
      return stdout.trim() || stderr.trim()
    })
    const settled = pending.then(() => {}, () => {})
    queues.set(queueKey, settled)
    void settled.then(() => { if (queues.get(queueKey) === settled) queues.delete(queueKey) })
    return pending
  }
}
