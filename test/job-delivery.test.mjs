/** Optional queue integration retains only an authorized prepared ID and a stable output identity. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {PreparedForwardJobs,Config} from '../dist/job-delivery.js'
import {setup,node,scope,signal} from './helpers.mjs'
const options={timeout:30000}

test('queue admission binds actor, scope and operation while the producer checkpoints the original retained reference',options,async t=>{
 const f=await setup(t),prepared=await f.runtime.prepare({scope:scope(),operationId:'prepare',input:{kind:'generated',nodes:[node()]}},signal()),submitted=[]
 const queue={async submit(request){submitted.push(request);return{id:'synthetic-task',replayed:false}}},service=new PreparedForwardJobs(f.runtime,queue,Config({enabled:true,provider:'synthetic-forward',maxConcurrent:3}))
 assert.deepEqual(await service.submit({scope:scope(),actorId:'synthetic-actor',operationId:'delivery',preparedId:prepared.id},signal()),{id:'synthetic-task',replayed:false});assert.deepEqual(submitted[0].payload,{preparedId:prepared.id});assert.equal(submitted[0].provider,'synthetic-forward');assert.equal(submitted[0].actorId,'synthetic-actor');assert.equal(submitted[0].operationId,'delivery')
 const producer=service.producer(),outputs=[];assert.equal(producer.maxConcurrent,3);await producer.run(submitted[0],{signal:signal(),async checkpoint(id,parts){outputs.push({id,parts})}});assert.deepEqual(outputs,[{id:'prepared',parts:[{type:'forward',resourceId:prepared.id}]}]);assert.equal(JSON.stringify(submitted).includes('exact original'),false)
})

test('foreign scopes, injected payload bodies and cancelled execution cannot checkpoint or enqueue output',options,async t=>{
 const f=await setup(t),prepared=await f.runtime.prepare({scope:scope(),operationId:'prepare',input:{kind:'generated',nodes:[node()]}},signal());let admissions=0,checkpoints=0;const service=new PreparedForwardJobs(f.runtime,{async submit(){admissions++;throw Error('Must not be called')}},Config({})),request={scope:scope(),actorId:'actor',operationId:'op',preparedId:prepared.id}
 await assert.rejects(service.submit({...request,scope:scope('foreign')},signal()),error=>error.code==='not-found');await assert.rejects(service.submit({...request,payload:{text:'injected'}},signal()),error=>error.code==='invalid');assert.equal(admissions,0)
 const producer=service.producer(),context={signal:signal(),async checkpoint(){checkpoints++}};await assert.rejects(producer.run({scope:scope(),payload:{preparedId:prepared.id,nodes:[node()]}},context),error=>error.code==='invalid');const cancelled=new AbortController();cancelled.abort();await assert.rejects(producer.run({scope:scope(),payload:{preparedId:prepared.id}},{...context,signal:cancelled.signal}),error=>error.code==='cancelled');assert.equal(checkpoints,0)
})
