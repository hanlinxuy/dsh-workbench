import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createServer} from 'node:https'
import * as tls from 'node:tls'
import {configureTrust} from '../settings/tls.js'

test('native trust rejects an unknown CA, adds explicit roots and preserves built-in trust',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'workbench-tls-')),before=tls.getCACertificates('default')
 let server
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'})
  server=createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(_req,res)=>res.end('strict TLS verified'))
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`https://127.0.0.1:${server.address().port}`
  await assert.rejects(fetch(url),error=>/CERT|SELF_SIGNED/.test(error.cause?.code??''))
  const result=await configureTrust({trust:{sources:['system','file'],extraCaFile:join(dir,'cert.pem')},onVerifyError:'fail'})
  assert.equal(result.sources.file,1);assert.ok(result.sources.bundled>0)
  assert.equal(await (await fetch(url)).text(),'strict TLS verified')
  assert.doesNotMatch(JSON.stringify(result),/BEGIN CERTIFICATE/)
  await assert.rejects(configureTrust({onVerifyError:'disable'}),/must fail/)
 }finally{tls.setDefaultCACertificates(before);if(server)await new Promise(r=>{server.close(r);server.closeAllConnections()});await rm(dir,{recursive:true,force:true})}
})
