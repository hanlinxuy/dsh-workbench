import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBrowser } from './runtime.js'

test('uses the pinned package, validates routing and arguments before execution', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-unit-'))
  const run = createBrowser({ home })
  try {
    assert.match(await run({ action: 'version' }), /agent-browser 0\.41\.2/)
    await assert.rejects(run({ action: 'open', account: '../other', target: 'https://example.com' }), /account/)
    await assert.rejects(run({ action: 'fill', target: '@e1' }), /Missing argument/)
    await assert.rejects(run({ action: 'connect', target: '9222' }), /Unsupported/)
    await assert.rejects(run({ action: 'click', target: '--auto-connect' }), /unsupported option/)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('eval remains unavailable even with claimed approval; rejection has no browser side effects', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-deny-'))
  const run = createBrowser({ home })
  const secret = 'private-expression-marker'
  try {
    for (const action of ['eval', 'evaluate']) {
      for (const confirm of [undefined, false, true, 'true', 1]) {
        await assert.rejects(run({ action, confirm, target: secret, value: secret,
          expression: secret, approved: true, hostApproved: true }), error => {
          assert.match(error.message, /eval is unavailable/)
          assert.match(error.message, /confirm=true does not authorize/)
          assert.ok(!error.message.includes(secret))
          return true
        })
      }
    }
    for (const action of ['Eval', 'EVAL', 'eval ', ' eval', 'evaluate\n', 'execute', 'javascript', 'get', '__proto__', 'constructor']) {
      await assert.rejects(run({ action, target: secret, confirm: true }), /Unsupported browser action/)
    }
    assert.deepEqual(await readdir(home), [], 'rejected requests must not create an account or launch AB')
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('open rejects script and non-HTTP navigation before launching AB', async () => {
  const home = await mkdtemp(join(tmpdir(), 'wb-browser-url-deny-'))
  const run = createBrowser({ home })
  try {
    for (const target of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>', 'file:///tmp/test.html',
      'about:blank', 'ftp://example.com/',
    ]) {
      await assert.rejects(run({ action: 'open', target, confirm: true }), /only HTTP\(S\) URLs/)
    }
    assert.deepEqual(await readdir(home), [])
  } finally { await rm(home, { recursive: true, force: true }) }
})

 test('child environment excludes unrelated credentials', async()=>{
 const home=await mkdtemp(join(tmpdir(),'env-boundary-'));process.env.WORKBENCH_TEST_SECRET='never-forward';
 const calls=[];const run=createBrowser({home},async(file,args,options)=>{calls.push({args,env:options.env});return {stdout:'{"ok":true}',stderr:''}});
 try{await run({action:'version'});assert.equal(calls[0].env.WORKBENCH_TEST_SECRET,undefined);assert.ok(calls[0].env.PATH);}
 finally{delete process.env.WORKBENCH_TEST_SECRET;await rm(home,{recursive:true,force:true})}
 })

test('site routing owns identity and isolates same-account profiles by site',async()=>{
 const home=await mkdtemp(join(tmpdir(),'wb-sites-'));const calls=[]
 const run=createBrowser({home,accounts:{primary:{}},sites:{a:{account:'primary',allowedHosts:['a.invalid']},b:{account:'primary',allowedHosts:['b.invalid']}}},async(file,args,options)=>{calls.push({args,cwd:options.cwd});return {stdout:'{"success":true,"data":{"url":"https://a.invalid"}}',stderr:''}})
 try{
  await assert.rejects(run({action:'open',site:'missing',target:'https://a.invalid'}),/Unknown site/)
  await assert.rejects(run({action:'open',site:'a',account:'other',target:'https://a.invalid'}),/cannot switch/)
  await assert.rejects(run({action:'open',site:'a',target:'https://b.invalid'}),/host_mismatch/)
  assert.equal(calls.length,0)
  await run({action:'open',site:'a',target:'https://a.invalid'})
  await run({action:'open',site:'b',target:'https://b.invalid'})
  assert.notEqual(calls[0].cwd,calls[1].cwd)
  await assert.rejects(run({action:'snapshot',site:'b'}),/host_mismatch/)
  assert.equal(calls.length,3,'only URL identity guard runs for mismatched page')
 }finally{await rm(home,{recursive:true,force:true})}
})

test('capture filters the cookie jar and restore uses bound site/account without returning secrets',async()=>{
 const home=await mkdtemp(join(tmpdir(),'wb-cookies-'));let stored,sets=0
 const cookie=(domain,value,expires=-1)=>({domain,name:'session',value,expires,path:'/',secure:true,httpOnly:true,sameSite:'Lax'})
 const run=createBrowser({home,accounts:{primary:{}},sites:{portal:{account:'primary',allowedHosts:['portal.example.invalid'],cookieRef:'PORTAL_PRIMARY_COOKIES'}},credentials:{set:async(ref,value)=>{assert.equal(ref,'PORTAL_PRIMARY_COOKIES');stored=value},resolve:async()=>({value:stored})}},async(file,args)=>{
  if(args.includes('cookies')&&args.includes('get'))return {stdout:JSON.stringify({success:true,data:{cookies:[cookie('.example.invalid','private-cookie'),cookie('other.invalid','wrong-cookie'),cookie('portal.example.invalid','expired-cookie',1)]}})}
  if(args.includes('set')){sets++;assert.ok(args.includes('private-cookie'));return {stdout:'{"success":true}'}}
  return {stdout:'{"success":true,"data":{"url":"https://portal.example.invalid/home"}}'}
 })
 try{
  const captured=await run({action:'capture',site:'portal'})
  assert.doesNotMatch(captured,/private-cookie|wrong-cookie|expired-cookie/)
  assert.equal(JSON.parse(captured).kept,1);assert.equal(JSON.parse(captured).dropped,2);assert.deepEqual(JSON.parse(captured).droppedReasons,{invalid:0,domain:1,expired:1})
  assert.doesNotMatch(stored,/wrong-cookie|expired-cookie/)
  const restored=await run({action:'restore',site:'portal'});assert.equal(sets,1);assert.doesNotMatch(restored,/private-cookie/)
  stored=JSON.stringify({...JSON.parse(stored),site:'other'})
  await assert.rejects(run({action:'restore',site:'portal'}),/captured_for_other_site/);assert.equal(sets,1)
  stored=JSON.stringify({site:'portal',account:'primary',cookies:[cookie('portal.example.invalid','expired',1)]})
  await assert.rejects(run({action:'restore',site:'portal'}),/expired/);assert.equal(sets,1)
 }finally{await rm(home,{recursive:true,force:true})}
})

test('screenshot returns private PNG metadata and prunes only owned artifacts',async()=>{
 const {writeFile,stat}=await import('node:fs/promises')
 const home=await mkdtemp(join(tmpdir(),'wb-screenshot-'))
 const png=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(640,16);png.writeUInt32BE(480,20)
 const run=createBrowser({home,screenshots:{maxBytes:1024}},async(_file,args)=>{const at=args.indexOf('screenshot');assert.ok(at>=0);await writeFile(args[at+1],png);return {stdout:JSON.stringify({success:true}),stderr:''}})
 try{
  const result=JSON.parse(await run({action:'screenshot'}))
  assert.equal(result.width,640);assert.equal(result.height,480);assert.equal(result.bytes,32);assert.equal(result.sha256.length,64)
  assert.doesNotMatch(JSON.stringify(result),/base64/)
  if(process.platform!=='win32')assert.equal((await stat(result.path)).mode&0o777,0o600)
  const unrelated=join(home,'screenshots','keep-business.png');await writeFile(unrelated,'business')
  for(let n=0;n<34;n++)await run({action:'screenshot'})
  assert.ok((await readdir(join(home,'screenshots'))).includes('keep-business.png'))
  assert.equal((await readdir(join(home,'screenshots'))).length,33)
 }finally{await rm(home,{recursive:true,force:true})}
})
