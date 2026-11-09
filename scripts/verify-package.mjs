/** Candidate publication checks reject private paths, unsupported launchers and stale retained build outputs. */
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
/** @param manifest - public package metadata. @returns after validating portable dependencies and declared optional entries. */
export function verifyManifest(manifest){
 assert.equal(manifest.type,'module');assert.equal(manifest.license,'MIT');assert.ok(!manifest.bin);assert.equal(manifest.engines.dsh,'0.2.2-rc.1');assert.equal(manifest.dsh.bundle.patch,'./cordis.patch.yml')
 for(const entry of['.','./job-delivery','./onebot','./control']){assert.ok(manifest.exports[entry].import.startsWith('./dist/'));assert.ok(manifest.exports[entry].types.endsWith('.d.ts'))}
 assert.equal(manifest.exports['./client'].default,'./dist/client.js');assert.equal(manifest.dsh.client.platform,'web');assert.equal(manifest.peerDependenciesMeta['dsh-qq-onebot'].optional,true)
 assert.equal(manifest.peerDependenciesMeta['dsh-job-delivery'].optional,true)
 for(const section of['dependencies','peerDependencies','devDependencies'])for(const[name,value]of Object.entries(manifest[section]??{}))assert.ok(!/^(?:file:|link:|workspace:|[a-z]:[\\/]|[\\/])/i.test(value),'Private dependency '+name)
}
/** @param files - dry-packed paths. @param modules - current direct source modules. @returns after rejecting private files, missing entries and retained stale build outputs. */
export function verifyFiles(files,modules){
 const exact=['LICENSE','README.md','README.zh.md','README.i18n.yaml','package.json','cordis.patch.yml']
 for(const file of files){assert.ok(exact.includes(file)||/^dist\/(?:client\/)?[a-z][a-z-]*\.(?:js|d\.ts)$/.test(file),'Unexpected archive file '+file);if(file.startsWith('dist/')&&file!=='dist/client.js'){const source=file.replace('dist/','src/').replace(/(?:\.d\.ts|\.js)$/,'.ts');assert.ok(modules.includes(source)||modules.includes(source.replace(/\.ts$/,'.tsx')),'Stale output '+file)}}
 for(const file of[...exact,'dist/index.js','dist/index.d.ts','dist/job-delivery.js','dist/job-delivery.d.ts','dist/onebot.js','dist/onebot.d.ts','dist/control.js','dist/control.d.ts','dist/client.js','dist/client/index.d.ts'])assert.ok(files.includes(file),'Missing archive file '+file)
}
async function sourceFiles(path){const result=[];for(const item of await readdir(path,{withFileTypes:true})){const child=resolve(path,item.name);if(item.isDirectory())result.push(...await sourceFiles(child));else if(/\.tsx?$/.test(child))result.push(child)}return result}
async function main(){
 const root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));verifyManifest(manifest)
 const en=await readFile(new URL('../README.md',import.meta.url),'utf8'),zh=await readFile(new URL('../README.zh.md',import.meta.url),'utf8');assert.equal(en.split('\n').length,zh.split('\n').length)
 for(const value of[en,zh]){assert.match(value,/^kind: "package-bundle"$/m);assert.equal(value.endsWith('\n')&&!value.endsWith('\n\n'),true)}
 const modules=(await sourceFiles(resolve(root,'src'))).map(value=>relative(root,value).replaceAll('\\','/'))
 for(const module of modules){const source=await readFile(resolve(root,module),'utf8');assert.ok(source.startsWith('/**'));assert.ok(!/\bas unknown\b/.test(source));assert.equal(source.endsWith('\n')&&!source.endsWith('\n\n'),true)}
 assert.ok(process.env.npm_execpath,'Run through npm run verify');const deadline=AbortSignal.timeout(60000),child=spawn(process.execPath,[process.env.npm_execpath,'pack','--dry-run','--ignore-scripts','--json'],{cwd:root,windowsHide:true,signal:deadline,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',failure;child.stdout.on('data',value=>{stdout+=value});child.stderr.on('data',value=>{stderr+=value});child.once('error',error=>{failure=error});const[code,signal]=await new Promise(resolve=>child.once('close',(...values)=>resolve(values)));if(failure)throw failure;assert.equal(deadline.aborted,false);assert.equal(signal,null);assert.equal(code,0,stderr);const pack=JSON.parse(stdout);assert.equal(pack.length,1);verifyFiles(pack[0].files.map(value=>value.path),modules);console.log(JSON.stringify({passed:true,package:manifest.name,files:pack[0].files.length,published:false}))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
