/** Public services run inside a real SDK profile; original acquisition is restricted to the synthetic fixture server. */
import assert from 'node:assert/strict'
import {writeFile,rename} from 'node:fs/promises'
import {identifier,sameScope} from 'dsh-im-kit'
import {ImMediaRuntime} from 'dsh-media-kit/im'
import {inspectOriginal,resolveInspection,mediaProvider,mediaSource} from 'dsh-media-kit'
export const name='synthetic-forward-probe'
export const inject=['im','imForward','imForwardJobs','imForwardControl','jobDelivery','qqOnebot','typertGateway','remoteAccess']
async function record(path,data){await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path)}
export async function apply(ctx,config){
 const signal=new AbortController().signal,scope={account:ctx.qqOnebot.account,kind:'group',peerId:identifier('im.peer','90000100')},other={...scope,peerId:identifier('im.peer','90000101')},checks=[],media=new ImMediaRuntime({maxProviders:1,maxPendingPerProvider:4});let acquired=0
 ctx.effect(()=>()=>media.close());ctx.effect(()=>ctx.provide('imMedia',media));ctx.effect(()=>media.register({account:scope.account,async store(){throw Error('No fixture store operation')},async read(target,id,abort){assert.equal(sameScope(target,scope),true);const source=ctx.qqOnebot.mediaSource(target,id);assert.ok(source?.url?.startsWith(config.originalOrigin+'/'));const response=await fetch(source.url,{signal:abort});assert.equal(response.status,200);acquired++;return inspectOriginal(resolveInspection({maxBytes:1048576,maxDetectorBuffer:1048576,maxWidth:8192,maxHeight:8192,maxPixels:16777216,allowedMimeTypes:['image/png','image/gif']}),{bytes:new Uint8Array(await response.arrayBuffer()),source:{provider:mediaProvider('native-fixture'),id:mediaSource(String(id)),kind:'fixture'}},abort)},async dispose(){}}))
 const owner={id:'forward-owner-fixture',ctx,principal:{kind:'owner'},signal,interactions:'none',async dispose(){}},invoke=(method,args={},peer=owner)=>ctx.typertGateway.invoke({namespace:'imForwardControl',method,args,peer,signal:peer.signal}),methods=['describe','save','restart','scopes','list','inspect','originals']
 ctx.effect(()=>ctx.remoteAccess.registerPolicy('forward-fixture-guest',{bindings:()=>[{resource:{kind:'global'},role:{name:'forward-fixture',resource:'global',actions:methods.map(method=>'imForwardControl/'+method)}}]}))
 const guest={...owner,id:'forward-guest-fixture',principal:{kind:'forward-fixture-guest'}}
 try{
  for(const method of methods)await assert.rejects(invoke(method,['describe','scopes'].includes(method)?{}:{request:{}},guest),error=>error.code==='qq-forward/control'&&error.details?.reason==='forbidden');checks.push('all-seven-native-owner-methods-refuse-globally-permitted-nonowners')
  assert.equal((await invoke('describe')).active,true)
  const input={scope,operationId:'native-source',input:{kind:'source',rootMessageId:'42',resourceId:'root'}},request=id=>({scope,actorId:'90000002',operationId:'native-delivery',preparedId:id})
  if(config.phase==='prepare'){
   let once=false;ctx.effect(()=>ctx.im.subscribe(async(message,abort)=>{if(once||message.messageId!=='42')return;once=true
    try{
     const read=await ctx.imForward.read({scope,rootMessageId:'42',resourceId:'root'},abort);assert.equal(read.complete,true);assert.equal(read.resources.length,2);assert.equal(read.messages.length,1);checks.push('native-protocol-nested-resources-and-cached-quote-resolve-without-global-message-lookup')
     const prepared=await ctx.imForward.prepare(input,abort),task=await ctx.imForwardJobs.submit(request(prepared.id),abort);await ctx.jobDelivery.wait(scope,task.id,abort);assert.equal(ctx.jobDelivery.inspect(scope,task.id).outputs[0].state,'accepted');assert.equal(acquired,1);assert.equal(ctx.qqOnebot.status().storedMediaBytes,0);checks.push('admitted-original-http-bytes-native-storage-native-jobs-and-forward-dispatch-compose')
     const detail=await invoke('inspect',{request:{scope,id:prepared.id}});assert.equal(detail.originals.length,1);assert.equal(detail.originals[0].mime,'image/png');assert.equal((await invoke('list',{request:{scope,offset:0}})).total,1);await assert.rejects(invoke('inspect',{request:{scope:other,id:prepared.id}}),error=>error.details?.reason==='not-found');assert.ok(!JSON.stringify(await invoke('describe')).includes(config.originalOrigin));checks.push('native-owner-preview-and-metadata-keep-exact-scope-without-source-locations')
     await record(config.resultPath,{passed:true,phase:config.phase,checks,preparedId:prepared.id,original:detail.originals[0],acquired,realModelCalls:0,qqMessages:0})
    }catch(error){await record(config.resultPath,{passed:false,phase:config.phase,error:{message:error.message,stack:error.stack}})}
   },()=>true));await record(config.readyPath,{ready:true})
  }else{
   const prepared=await ctx.imForward.prepare(input,signal);assert.equal(prepared.replayed,true);const task=await ctx.imForwardJobs.submit(request(prepared.id),signal);assert.equal(task.replayed,true);await ctx.jobDelivery.wait(scope,task.id,signal);assert.equal(acquired,0);assert.equal(ctx.jobDelivery.inspect(scope,task.id).outputs[0].state,'accepted');checks.push('second-sdk-process-recovers-retained-output-and-accepted-receipt-without-source-or-send-replay')
   const detail=await invoke('inspect',{request:{scope,id:prepared.id}}),bytes=(await ctx.imForward.readOriginal(scope,prepared.id,detail.originals[0].id,signal)).copyBytes();assert.equal(bytes.byteLength,detail.originals[0].bytes);checks.push('original-remains-readable-after-protocol-source-cache-is-gone')
   await record(config.resultPath,{passed:true,phase:config.phase,checks,preparedId:prepared.id,acquired,realModelCalls:0,qqMessages:0})
  }
 }catch(error){await record(config.resultPath,{passed:false,phase:config.phase,error:{message:error.message,stack:error.stack}})}
}
