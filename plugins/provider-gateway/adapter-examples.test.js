import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createJSONLogin,createCredentialPool} from './adapter-examples.js'
test('SSO example uses real JSON HTTP, rejects failures and honors cancellation',async()=>{
 let body,status=200
 const server=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;body=JSON.parse(text);res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({access_token:'fixture-token'}))})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try{
  const login=createJSONLogin({url:`http://127.0.0.1:${server.address().port}`,accountRef:'ACCOUNT',passwordRef:'PASSWORD'})
  const credentials={get:async ref=>ref==='ACCOUNT'?'fixture-user':'fixture-password'}
  assert.equal((await login({credentials})).token,'fixture-token');assert.equal(body.username,'fixture-user')
  status=401;await assert.rejects(login({credentials}),/HTTP 401/)
  await assert.rejects(login({credentials,signal:AbortSignal.abort()}),/abort/i)
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections()})}
})
test('dual credential pool resolves fresh references, metadata hides values and unknown models decline',async()=>{
 let tenant='fixture-tenant'
 const pool=createCredentialPool({entries:[{backend:'a',account:'employee',team:'team',models:['m'],tokenRef:'TOKEN',tenantKeyRef:'TENANT'}],credentials:{get:async r=>r==='TOKEN'?'fixture-token':tenant}})
 assert.doesNotMatch(JSON.stringify(pool.list()),/fixture-/)
 assert.equal((await pool.borrow('a','m')).headers.authorization,'Bearer fixture-tenant')
 tenant=undefined;assert.equal((await pool.borrow('a','m')).key_source,'none')
 assert.equal(await pool.borrow('a','other'),undefined)
 await assert.rejects(pool.borrow('a','m',AbortSignal.abort()),/abort/i)
})
