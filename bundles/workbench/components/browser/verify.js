import {dirname,resolve} from 'node:path'

// Commands are operator-owned argv arrays, never model-provided shell strings.
export async function verifySite(card,{spawn,node=process.execPath,python='python',offline=false,signal}){
 const contract=card.verify
 if(!contract||!Array.isArray(contract.argv)||!contract.argv.length||contract.argv.some(v=>typeof v!=='string')||!Array.isArray(contract.expects)||!contract.expects.length||contract.expects.some(v=>typeof v!=='string'||!v.trim()))throw Error('Site verify requires argv and reviewed nonempty expects')
 if(!Array.isArray(contract.artifacts)||!contract.artifacts.length||contract.artifacts.some(v=>typeof v!=='string'||!v.trim()))throw Error('Site verify requires manual screenshot artifacts')
 const artifacts=contract.artifacts.map(label=>({label,status:'manual',message:'需人看：核对本次页面截图与业务数据；未自动断言截图。'}))
 if(offline)return {status:'skipped',reason:'offline',artifacts}
 const argv=[...contract.argv]
 if(argv[0]==='node')argv[0]=node
 if(['python','python3'].includes(argv[0]))argv[0]=python
 const child=spawn({argv,cwd:resolve(dirname(card.source),contract.cwd??'.'),stdio:{stdin:'ignore',stdout:{maxBytes:1048576},stderr:{maxBytes:65536}},graceMs:1000,signal:AbortSignal.any([AbortSignal.timeout(60000),...(signal?[signal]:[])]),...(process.versions.electron&&argv[0]===process.execPath?{env:{ELECTRON_RUN_AS_NODE:'1'}}:{})})
 const outcome=await child.done,stdout=child.collected.stdout.readFrom(0),stderr=child.collected.stderr.readFrom(0)
 const lines=stdout.text.split(/\r?\n/)
 const assertions=contract.expects.map(expect=>{
  const comparison=expect.match(/^([\w.-]+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/)
  if(!comparison)return {expect,passed:lines.includes(expect)}
  const [,key,operator,threshold]=comparison,valueLine=lines.find(line=>line.startsWith(key+'=')),actual=valueLine?.slice(key.length+1)
  const number=Number(actual),limit=Number(threshold)
  return {expect,actual:actual??null,passed:actual!==undefined&&actual.trim()!==''&&Number.isFinite(number)&&({'>=':number>=limit,'<=':number<=limit,'>':number>limit,'<':number<limit})[operator]}
 })
 const passed=outcome.exitCode===0&&!stdout.lossy&&!stderr.lossy&&assertions.every(a=>a.passed)
 return {status:passed?'machine-passed':'failed',exitCode:outcome.exitCode,assertions,artifacts,...(!passed?{outputTail:(stdout.text+'\n'+stderr.text).slice(-6000)}:{})}
}
