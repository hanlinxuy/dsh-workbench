import {parseArgs} from 'node:util'
import {spawnSync} from 'node:child_process'
import {readFile,readdir,mkdir,writeFile,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {inspectStructure} from '../dev/plugin-harness/scripts/structure.mjs'
import {assertModelEvidence} from '../dev/plugin-harness/scripts/evidence.mjs'

const {values}=parseArgs({options:{plugin:{type:'string'},evidence:{type:'string'},tool:{type:'string',default:'chief_project'},contains:{type:'string',default:''},output:{type:'string'},'l0-only':{type:'boolean'},gui:{type:'boolean'},'gui-evidence':{type:'string'}}})
const root=resolve(fileURLToPath(new URL('../',import.meta.url)))
if(!process.env.DSH_HOME)throw Error('preflight requires an isolated DSH_HOME')
if(values.plugin)await stat(join(resolve(values.plugin),'package.json'))
const directory=resolve(values.output??join(process.env.DSH_HOME,'workbench-preflight'))
await mkdir(directory,{recursive:true,mode:0o700})
const report={status:'running',node:process.version,scope:values.plugin??'workbench',gates:[],evidence:directory}
const run=(label,args)=>{
 const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:process.env,maxBuffer:8388608})
 report.gates.push({name:label,passed:result.status===0})
 return {result,log:writeFile(join(directory,label+'.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600})}
}
try{
 const tests=[]
 for(const dir of ['plugins/chief','plugins/browser','plugins/desktop','plugins/git','plugins/provider-gateway','bundles/test','dev/plugin-harness'])for(const file of await readdir(join(root,dir)))if(file.endsWith('.test.js'))tests.push(join(dir,file))
 const unit=run('L0',['--test',...tests]);await unit.log;if(unit.result.status!==0)throw Error('L0 failed; inspect L0.log')
 report.packages=await inspectStructure(root);report.gates.push({name:'structure',passed:true})
 const build=run('generated',['scripts/build-bundles.mjs','--check']);await build.log;if(build.result.status!==0)throw Error('Generated artifacts are stale')
 if(!values['l0-only']){
  if(!process.env.DSH_TOOLS_MODULE)throw Error('Native SDK evidence missing: set DSH_TOOLS_MODULE to the target host entry')
  const schema=run('native-schema',['dev/plugin-harness/scripts/native-schema-preflight.mjs']);await schema.log;if(schema.result.status!==0)throw Error('Native SDK schema preflight failed')
  if(!values.evidence)throw Error('L1 evidence missing: provide --evidence from the isolated host sessionController event export')
  const events=(await readFile(values.evidence,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))
  report.L1=assertModelEvidence(events,values)
  if(values.gui){
   if(!values['gui-evidence'])throw Error('L1b evidence missing: provide --gui-evidence with the reviewed screenshot/report path')
   await stat(values['gui-evidence']);report.L1b={artifact:resolve(values['gui-evidence']),status:'manual-review-artifact; not an automatic UI assertion'}
  }
 }
 report.status=values['l0-only']?'L0-PASS':'PASS'
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1}
await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify(report))
