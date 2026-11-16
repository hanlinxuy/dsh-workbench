import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createVision} from './vision.js'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64')
test('vision sends pixels only to the backend, returns text metadata and cleans owned temporary images',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vision-')),image=join(dir,'screen.png');let calls=0
 try{
  await writeFile(image,png)
  const run=createVision({baseURL:'http://127.0.0.1/v1',model:'vision-test',temporaryDirectory:dir},{request:async(_url,options)=>{calls++;assert.match(options.body,/data:image\/png;base64/);assert.equal(JSON.parse(options.body).stream,false);return Response.json({choices:[{message:{content:'The dialog contains a test error.'}}]})}})
  const result=await run({image,question:'Read the error',temporary:true})
  assert.equal(result.text,'The dialog contains a test error.');assert.equal(result.model,'vision-test');assert.equal(result.bytes,png.length);assert.equal(result.untrusted,true);assert.equal(calls,1)
  assert.doesNotMatch(JSON.stringify(result),/iVBORw0|data:image/);await assert.rejects(stat(image),{code:'ENOENT'})
  await assert.rejects(run({image,question:'Read'}),/vision_not_found/)
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('vision rejects oversized/unsupported files, external denial sends zero requests and timeout is explicit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vision-')),image=join(dir,'screen.png');let calls=0,approved=false
 const request=async(_url,{signal})=>{calls++;if(signal)return new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('fixture expired')),1000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason)},{once:true})});return Response.json({choices:[{message:{content:'text'}}]})}
 try{
  await writeFile(image,png)
  const external={baseURL:'https://vision.example.invalid/v1',model:'vision-test',external:true}
  await assert.rejects(createVision(external,{request})({image,question:'Read'}),/egress_not_confirmed/);assert.equal(calls,0)
  await assert.rejects(createVision(external,{request,approveExternal:async()=>{throw Error('egress_denied')}})({image,question:'Read'}),/egress_denied/);assert.equal(calls,0)
  assert.throws(()=>createVision({...external,external:false},{request}),/defaults to internal/)
  await assert.rejects(createVision({baseURL:'http://localhost/v1',model:'v',maxBytes:1},{request})({image,question:'Read'}),/too_large/)
  await assert.rejects(createVision({...external,timeoutMs:5},{request,approveExternal:async()=>{approved=true}})({image,question:'Read'}),/timeout/);assert.equal(approved,true)
  await writeFile(image,'not-an-image');await assert.rejects(createVision({baseURL:'http://localhost/v1',model:'v'},{request})({image,question:'Read'}),/unsupported_format/)
 }finally{await rm(dir,{recursive:true,force:true})}
})
