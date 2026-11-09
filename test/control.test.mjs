/** Native owner controls edit one runtime and preserve every retained original across refused changes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import Control,{Config as ControlConfig} from '../dist/control.js'
import {Config} from '../dist/config.js'
import {FIELDS} from '../dist/fields.js'
import {snapshotSchema,detailSchema,saveSchema,originalPageSchema} from '../dist/control-codecs.js'
import {setup,scope,node,signal,aid,original,png,mediaFixture,deferred} from './helpers.mjs'
const options={timeout:30000},rejected=reason=>error=>error.code==='qq-forward/control'&&error.details.reason===reason&&!error.message.includes('SYNTHETIC_PRIVATE')
async function mount(t,{editError=false,gate,limits={}}={}){
 const state=await setup(t),writes=[],entry={options:{id:'qq-forward',name:'dsh-qq-forward',config:state.config},disabled:false,fiber:{state:2,effectiveConfig:state.config,async restart(){writes.push('restart')}}},editor={entries:()=>[entry],async edit(target,change){assert.equal(target,entry);await gate?.promise;const next=change(entry.options.config);if(editError)throw Error('SYNTHETIC_PRIVATE_DIAGNOSTIC');writes.push(next);entry.options.config=next;entry.fiber.effectiveConfig=Config(next)}}
 const service=state.ctx.plugin({name:'synthetic-control-services',apply(ctx){ctx.effect(()=>ctx.provide('storageDomain',state.domains));ctx.effect(()=>ctx.provide('configEditor',editor));ctx.effect(()=>ctx.provide('imForward',state.runtime))}});await service.await();const fiber=state.ctx.plugin(Control,ControlConfig(limits));await fiber.await();state.cleanup(()=>fiber.dispose());state.cleanup(()=>service.dispose());return{...state,entry,writes,editor,control:state.ctx.imForwardControl}
}

test('field inventory covers every config key and codecs reject unknown edit or result fields',()=>{
 const config=Config({});assert.deepEqual(Object.keys(config).sort(),Object.keys(FIELDS).sort());assert.equal(saveSchema.safeParse({revision:'0'.repeat(64),patch:{prepareTimeoutMs:500}}).success,true);for(const patch of[{unknown:'SYNTHETIC_PRIVATE'},{maxPrepared:'4'},{enabled:'true'}])assert.equal(saveSchema.safeParse({revision:'0'.repeat(64),patch}).success,false)
})

test('native metadata and paged originals preserve exact scopes without returning receipts or source bodies',options,async t=>{
 const f=await mount(t,{limits:{pageSize:1,previewMedia:1,previewChars:30,maxScopeOptions:1}}),entries=new Map([[aid('first'),await original()],[aid('second'),await original()]]);mediaFixture(f,entries)
 const first=await f.runtime.prepare({scope:scope(),operationId:'first',input:{kind:'generated',nodes:[node([{type:'text',text:'SYNTHETIC_SOURCE_BODY'},{type:'image',attachmentId:aid('first')},{type:'image',attachmentId:aid('second')}])]}},signal());await f.runtime.prepare({scope:scope(),operationId:'second',input:{kind:'generated',nodes:[node()]}},signal());await f.runtime.prepare({scope:scope('other'),operationId:'other',input:{kind:'generated',nodes:[node()]}},signal())
 const snapshot=await f.control.describe();assert.equal(snapshot.active,true);assert.equal(snapshotSchema.safeParse(snapshot).success,true);const catalog=await f.control.scopes();assert.equal(catalog.scopes.length,1);assert.equal(catalog.omitted,1);const page=await f.control.list({scope:scope(),offset:0});assert.equal(page.records.length,1);assert.equal(page.total,2);assert.equal(page.nextOffset,1);assert.equal((await f.control.list({scope:scope(),offset:1})).records[0].id,first.id);assert.equal(JSON.stringify({snapshot,page}).includes('SYNTHETIC_SOURCE_BODY'),false)
 const detail=await f.control.inspect({scope:scope(),id:first.id});assert.equal(detailSchema.safeParse(detail).success,true);assert.equal(detail.preview.truncated,true);assert.equal(detail.originals.length,1);assert.equal(detail.omittedOriginals,1);const more=await f.control.originals({scope:scope(),id:first.id,offset:1});assert.equal(originalPageSchema.safeParse(more).success,true);assert.equal(more.originals[0].id,'second');assert.equal(more.nextOffset,null);assert.equal(JSON.stringify(detail).includes('sha256:'),false);assert.equal(JSON.stringify(detail).includes('dsh-media-native-v1'),false)
 await assert.rejects(f.control.inspect({scope:scope('other'),id:first.id}),rejected('not-found'));assert.deepEqual(Buffer.from((await f.runtime.readOriginal(scope(),first.id,aid('first'),signal())).copyBytes()),png);await assert.rejects(f.runtime.readOriginal(scope('other'),first.id,aid('first'),signal()),error=>error.code==='not-found')
})

test('configuration edits reject stale observations, unknown fields and namespace changes that would hide records',options,async t=>{
 const f=await mount(t),prepared=await f.runtime.prepare({scope:scope(),operationId:'retained',input:{kind:'generated',nodes:[node()]}},signal()),before=await f.control.describe();await assert.rejects(async()=>f.control.save({revision:'0'.repeat(64),patch:{maxPrepared:2}}),rejected('conflict'));await assert.rejects(async()=>f.control.save({revision:before.revision,patch:{sourcePath:'SYNTHETIC_PRIVATE'}}),rejected('invalid'));await assert.rejects(async()=>f.control.save({revision:before.revision,patch:{namespace:'hidden_data'}}),rejected('conflict'));await assert.rejects(async()=>f.control.save({revision:before.revision,patch:{maxNodes:0}}),rejected('invalid'));assert.equal(f.writes.length,0);assert.equal(f.runtime.inspect(scope(),prepared.id).operationId,'retained');assert.equal(f.runtime.status().maintenance,false)
})

test('a transactional edit holds maintenance and releases it after a sanitized failure',options,async t=>{
 const gate=deferred(),entered=deferred(),f=await mount(t,{editError:true,gate});f.cleanup(()=>gate.resolve());const before=await f.control.describe(),previous=f.editor.edit.bind(f.editor);f.editor.edit=async(...args)=>{entered.resolve();return previous(...args)};const pending=f.control.save({revision:before.revision,patch:{maxPrepared:999}}),refused=assert.rejects(pending,rejected('apply-failed'));await entered.promise;assert.equal(f.runtime.status().maintenance,true);await assert.rejects(f.runtime.prepare({scope:scope(),operationId:'during-edit',input:{kind:'generated',nodes:[node()]}},signal()),error=>error.code==='busy');gate.resolve();await refused;assert.equal(f.runtime.status().maintenance,false);assert.equal(f.writes.length,0);assert.equal((await f.control.describe()).revision,before.revision)
})

test('active media preparation refuses owner reload and the complete preparation deadline joins cleanup',options,async t=>{
 const f=await setup(t,{prepareTimeoutMs:100}),entered=deferred(),aborted=deferred(),cleanup=deferred(),input=await original();f.cleanup(()=>cleanup.resolve());const keepAlive=setTimeout(()=>cleanup.reject(Error('Synthetic fixture cleanup deadline')),10000);f.cleanup(()=>clearTimeout(keepAlive));f.media.register({account:scope().account,async read(destination,id,abort){abort.addEventListener('abort',()=>aborted.resolve(),{once:true});entered.resolve();await cleanup.promise;return input},async store(){throw Error('Unused')},async dispose(){}})
 const pending=f.runtime.prepare({scope:scope(),operationId:'timed-media',input:{kind:'generated',nodes:[node([{type:'image',attachmentId:aid('held')}])]}},signal()),refused=assert.rejects(pending,error=>error.code==='timeout');await entered.promise;assert.throws(()=>f.runtime.acquireMaintenance(),error=>error.code==='busy');await aborted.promise;assert.equal(f.runtime.status().preparing,1);cleanup.resolve();await refused;assert.equal(f.runtime.status().retained,0);assert.equal(f.runtime.status().preparing,0)
})

test('retained original policy prevents a save that would strand existing bytes',options,async t=>{
 const f=await mount(t);mediaFixture(f,new Map([[aid('first'),await original()]]));const prepared=await f.runtime.prepare({scope:scope(),operationId:'policy',input:{kind:'generated',nodes:[node([{type:'image',attachmentId:aid('first')}])]}},signal()),before=await f.control.describe();await assert.rejects(async()=>f.control.save({revision:before.revision,patch:{allowedMediaMimeTypes:'text/plain'}}),rejected('capacity'));assert.equal(f.writes.length,0);assert.deepEqual(Buffer.from((await f.runtime.readOriginal(scope(),prepared.id,aid('first'),signal())).copyBytes()),png)
})
