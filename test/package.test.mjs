/** Release guards reject private dependencies and stale outputs without deleting local files. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {verifyManifest,verifyFiles} from '../scripts/verify-package.mjs'
test('public manifest rejects application binaries, private dependencies and mandatory optional adapters',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));verifyManifest(manifest)
 for(const change of[value=>{value.bin='start.js'},value=>{value.dependencies.private='file:F:/private'},value=>{value.peerDependenciesMeta['dsh-job-delivery'].optional=false},value=>{value.exports['.'].types='./src/index.ts'}]){const bad=structuredClone(manifest);change(bad);assert.throws(()=>verifyManifest(bad))}
})
test('packed file checks require public entries and reject secrets and obsolete modules',()=>{
 const files=['LICENSE','README.md','README.zh.md','README.i18n.yaml','package.json','cordis.patch.yml','dist/index.js','dist/index.d.ts','dist/job-delivery.js','dist/job-delivery.d.ts'],modules=['src/index.ts','src/job-delivery.ts'];verifyFiles(files,modules)
 for(const extra of['.env','data/private.sqlite','dist/removed.js','dist/removed.d.ts'])assert.throws(()=>verifyFiles([...files,extra],modules));assert.throws(()=>verifyFiles(files.filter(value=>value!=='dist/index.d.ts'),modules))
})
