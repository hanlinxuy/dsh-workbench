import test from 'node:test'
import assert from 'node:assert/strict'
import {verifySite} from './verify.js'
const card={source:'/cards/portal.json',verify:{argv:['node','verify.mjs'],expects:['home_status=200','entries>=1','OK: records'],artifacts:['首页列表截图']}}
test('site business assertions fail empty 200 and 500; screenshot remains explicitly manual',async()=>{
 for(const [output,exitCode,expected] of [['home_status=200\nentries=0\nOK: records',0,'failed'],['home_status=500\nentries=1\nOK: records',1,'failed'],['home_status=200\nentries=1\nOK: records',0,'machine-passed']]){
  let command
  const result=await verifySite(card,{node:'/host/node',spawn:args=>{command=args;return {done:Promise.resolve({exitCode}),collected:{stdout:{readFrom:()=>({text:output,lossy:false})},stderr:{readFrom:()=>({text:'',lossy:false})}}}}})
  assert.equal(result.status,expected);assert.equal(command.argv[0],'/host/node');assert.equal(result.artifacts[0].status,'manual')
  if(exitCode===1)assert.match(result.outputTail,/500/)
 }
 const offline=await verifySite(card,{offline:true,spawn:()=>assert.fail('offline must not spawn')});assert.equal(offline.status,'skipped')
 await assert.rejects(verifySite({...card,verify:{...card.verify,expects:[]}},{spawn(){}}),/expects/)
})
