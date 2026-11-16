import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createSpill} from '../settings/spill.js'
test('spill retains redacted full text with bounded head/tail, persistent paging, dedup and logged cleanup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'wb-spill-'));let saves=0,time=0;const logs=[]
 const store={saveText:async({content})=>{const locator=join(directory,`native-${++saves}.txt`);await writeFile(locator,content,{mode:0o600});return {locator,bytes:Buffer.byteLength(content)}}}
 const options={directory,store,now:()=>time,log:text=>logs.push(text),retentionDays:1,totalBudgetMiB:2}
 const owner={sessionId:'session-a',toolName:'fixture',callId:'call'}
 try{
  const spill=await createSpill(options),text='HEAD\ntoken=private-fixture\n'+('line data\n'.repeat(110000))+'TAIL',result=await spill.bound(text,owner),handle=result.match(/spill:[a-f0-9]+/)[0]
  assert.ok(Buffer.byteLength(result)<32768);assert.match(result,/HEAD/);assert.match(result,/TAIL/);assert.match(result,/行 .*省略/);assert.doesNotMatch(result,/private-fixture/)
  assert.doesNotMatch(await readFile(join(directory,'native-1.txt'),'utf8'),/private-fixture/)
  await spill.bound(text,owner);assert.equal(saves,1)
  const restarted=await createSpill(options);let offset=0,parts=[]
  do{const page=await restarted.read(handle,'session-a',offset,2000);parts.push(page.text);offset=page.nextOffset}while(offset!==null)
  assert.equal(parts.join(''),text.replace('token=private-fixture','token=***'))
  await assert.rejects(restarted.read(handle,'session-b'),/another session/)
  await restarted.bound(text+'second',owner);assert.equal(logs.length,1,'capacity cleanup is logged')
  await assert.rejects(restarted.read(handle,'session-a'),/spill_not_found/)
  time=86400001;await createSpill(options);assert.equal(logs.length,2);assert.match(logs[0],/1 files/)
  await assert.rejects(readFile(join(directory,'native-1.txt')),{code:'ENOENT'})
 }finally{await rm(directory,{recursive:true,force:true})}
})
