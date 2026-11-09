/** Owner configuration changes run outside the reloaded core's dependent fibers. */
import assert from 'node:assert/strict'
import {writeFile,rename} from 'node:fs/promises'
export const name='synthetic-forward-reload-probe'
export const inject=['im','configEditor','imForwardControl','typertGateway']
export async function apply(ctx,config){
 const signal=new AbortController().signal,peer={id:'reload-owner-fixture',ctx,principal:{kind:'owner'},signal,interactions:'none',async dispose(){}},invoke=(method,args={})=>ctx.typertGateway.invoke({namespace:'imForwardControl',method,args,peer,signal})
 let once=false
 ctx.effect(()=>ctx.im.subscribe(async message=>{
 if(once||message.messageId!=='43')return;once=true
 let result
 try{
  await ctx.configEditor.entries().find(entry=>entry.options.id==='qq-forward').fiber.await()
  const before=await invoke('describe'),catalog=await invoke('scopes'),scope=catalog.scopes.find(value=>value.peerId==='90000100');assert.ok(scope)
  const previous=await invoke('list',{request:{scope,offset:0}});assert.equal(previous.total,1)
  await invoke('save',{request:{revision:before.revision,patch:{maxConcurrentReads:7}}});assert.equal((await invoke('describe')).config.maxConcurrentReads,7);assert.equal((await invoke('list',{request:{scope,offset:0}})).records[0].id,previous.records[0].id)
  const saved=await invoke('describe');await invoke('restart',{request:{revision:saved.revision}});assert.equal((await invoke('describe')).active,true)
  result={passed:true,phase:'reload',checks:['independent-native-owner-control-applies-idle-config-and-restart-without-dependent-fiber-deadlock-or-data-loss'],realModelCalls:0,qqMessages:0}
 }catch(error){result={passed:false,phase:'reload',error:{message:error.message,stack:error.stack}}}
 await writeFile(config.resultPath+'.tmp',JSON.stringify(result,null,2)+'\n');await rename(config.resultPath+'.tmp',config.resultPath)
 },()=>true))
 await writeFile(config.readyPath+'.tmp',JSON.stringify({ready:true})+'\n');await rename(config.readyPath+'.tmp',config.readyPath)
}
