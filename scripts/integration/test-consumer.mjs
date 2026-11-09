/** Install exact archives in a new consumer, without application launch or ancestor runtime dependencies. */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,writeFile,realpath,copyFile,statfs} from 'node:fs/promises'
import {join,resolve,relative,isAbsolute,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {verifyInstalledArchive} from './verify-installed.mjs'
import {releaseInputs} from '../release-spec.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv
const argument=(key,otherwise)=>{const index=args.indexOf(key);assert.ok(index<0?otherwise:args[index+1],'Pass '+key);return index<0?otherwise:args[index+1]}
assert.ok(process.env.npm_execpath,'Run through npm run test:consumer')
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8')),disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=1073741824,'Consumer installation requires a one-GiB free-space budget')
const runs=join(root,'.test-artifacts','consumer');await mkdir(runs,{recursive:true});const area=await mkdtemp(join(runs,'run-')),attempt=await mkdtemp(join(area,'attempt-')),archives=[]
const sourceRoot=await realpath(argument('--inputs',join(root,'.test-artifacts','release-inputs')))
for(const input of releaseInputs){const source=join(sourceRoot,input.file),path=join(attempt,input.file);assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),input.sha256);await copyFile(source,path);archives.push(path)}
const candidate=await realpath(argument('--candidate-archive',join(root,'artifacts',manifest.name+'-'+manifest.version+'.tgz'))),candidatePath=join(attempt,basename(candidate));await copyFile(candidate,candidatePath);archives.push(candidatePath)
await writeFile(join(area,'package.json'),JSON.stringify({name:'isolated-forward-consumer',private:true,type:'module',overrides:{...manifest.overrides,'dsh-im-kit':'$dsh-im-kit','dsh-media-kit':'$dsh-media-kit'}},null,2)+'\n');await mkdir(join(attempt,'temp'))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|SECRET|TOKEN|PASSWORD/i.test(key)));Object.assign(env,{NPM_CONFIG_CACHE:join(root,'.npm-cache'),TEMP:join(attempt,'temp'),TMP:join(attempt,'temp')})
const commands=[]
async function run(argv){const timeout=AbortSignal.timeout(300000),child=spawn(process.execPath,argv,{cwd:area,env,windowsHide:true,signal:timeout,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',failure;child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});child.once('error',error=>{failure=error});const done=new Promise(resolve=>child.once('close',(...values)=>resolve(values)));try{await writeFile(join(attempt,'setup-live.json'),JSON.stringify({pid:child.pid})+'\n')}catch(error){child.kill('SIGKILL');await done;throw error}const [code,signal]=await done;commands.push({argv,code,signal,timedOut:timeout.aborted,stdout,stderr});await writeFile(join(attempt,'commands.json'),JSON.stringify(commands,null,2)+'\n');if(failure)throw failure;assert.equal(timeout.aborted,false);assert.equal(signal,null);assert.equal(code,0,(stderr+'\n'+stdout).slice(-1800));return stdout}
await run([process.env.npm_execpath,'install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',...archives,...Object.entries(manifest.peerDependencies).filter(([name])=>!releaseInputs.some(input=>input.name===name)).map(([name,version])=>name+'@'+version),'@deepseek-ai/dsh@0.2.2-rc.1','@types/node@24.0.0','@types/react@18.3.28','@types/react-dom@18.3.7'])
const installedFiles=await verifyInstalledArchive(candidatePath,join(area,'node_modules',manifest.name),join(attempt,'installed-files.json')),consumer=join(attempt,'consumer.ts')
await writeFile(consumer,`import z from '@deepseek-ai/schemastery'
import type {Context} from '@deepseek-ai/cordis'
import {Config,ForwardRuntime,type PreparedId,type ForwardNode,type ForwardProvider} from 'dsh-qq-forward'
import type {ConversationScope,AttachmentId} from 'dsh-im-kit'
import {PreparedForwardJobs} from 'dsh-qq-forward/job-delivery'
import {oneBotProvider} from 'dsh-qq-forward/onebot'
import ForwardControl from 'dsh-qq-forward/control'
import type * as Client from 'dsh-qq-forward/client'
const config=z.resolve({enabled:false},Config,{})[0]
const limit:number=config.prepareTimeoutMs+config.maxConcurrentReads
async function original(ctx:Context,scope:ConversationScope,id:PreparedId,attachment:AttachmentId,signal:AbortSignal){return ctx.imForward.readOriginal(scope,id,attachment,signal)}
function prepared(ctx:Context,scope:ConversationScope,id:PreparedId){return ctx.imForward.inspect(scope,id)}
void limit;void original;void prepared;void ForwardRuntime;void oneBotProvider;void PreparedForwardJobs;void ForwardControl
export type NativeClient=typeof Client
export type Node=ForwardNode
export type Provider=ForwardProvider
`)

const program=ts.createProgram([consumer],{strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,types:['node','react'],typeRoots:[join(area,'node_modules','@types')],lib:['lib.es2023.d.ts','lib.esnext.disposable.d.ts','lib.dom.d.ts'],skipLibCheck:false,allowImportingTsExtensions:true,jsx:ts.JsxEmit.ReactJSX}),diagnostics=ts.getPreEmitDiagnostics(program)
await writeFile(join(attempt,'type-diagnostics.txt'),ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>area,getCanonicalFileName:file=>file,getNewLine:()=> '\n'}));assert.equal(diagnostics.length,0,'Consumer declaration errors; see owned diagnostics')
const compiler=await realpath(join(root,'node_modules','typescript','lib')),inputs=program.getSourceFiles().map(file=>resolve(file.fileName));for(const path of inputs){const local=relative(area,path),library=relative(compiler,path);assert.ok(!local.startsWith('..')&&!isAbsolute(local)||!library.startsWith('..')&&!isAbsolute(library),'Consumer borrowed an ancestor declaration')}
await writeFile(join(attempt,'runtime.mjs'),`import assert from 'node:assert/strict'
import {Config,ForwardRuntime,name} from 'dsh-qq-forward'
import {oneBotProvider} from 'dsh-qq-forward/onebot'
import {PreparedForwardJobs} from 'dsh-qq-forward/job-delivery'
import ForwardControl from 'dsh-qq-forward/control'
assert.equal(name,'qq-forward');assert.equal(Config({}).enabled,false);assert.equal(typeof ForwardRuntime.open,'function');assert.equal(typeof ForwardRuntime.prototype.readOriginal,'function');assert.equal(typeof oneBotProvider,'function');assert.equal(typeof PreparedForwardJobs,'function');assert.equal(typeof ForwardControl,'function')
console.log(JSON.stringify({passed:true,applicationsStarted:0,connectionsOpened:0}))
`)

const runtime=JSON.parse((await run([join(attempt,'runtime.mjs')])).trim()),result={passed:true,archiveSha256:createHash('sha256').update(await readFile(candidatePath)).digest('hex'),installedFiles,declarationInputs:inputs.length,ancestorDependenciesBorrowed:false,strictDeclarationErrors:0,runtime,realModelCalls:0,qqMessages:0,bilibiliWrites:0}
await writeFile(join(attempt,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({area,attempt,...result}))
