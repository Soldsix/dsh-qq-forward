/** Full graph, native retention, shared durable queue and published protocol dispatch run without QQ. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {identifier} from 'dsh-im-kit'
import {oneBotProvider} from '../dist/onebot.js'
import {protocol,delivery,reply} from './onebot-fixture.mjs'
import {signal,original,png,mid,fid,mediaFixture,deferred} from './helpers.mjs'
const options={timeout:30000}
const writes=f=>f.requests.filter(value=>value.action==='send_group_forward_msg'||value.action==='send_private_forward_msg')
const source=(f,id,parts,scope=f.scope())=>f.peer.send(JSON.stringify({post_type:'message',message_type:scope.kind,time:1000,self_id:90000001,user_id:scope.kind==='private'?Number(scope.peerId):90000002,group_id:Number(scope.peerId),message_id:id,message:parts}))
const custom=(parts=[{type:'text',text:'synthetic exact original'}])=>({claimedSender:{id:identifier('im.user','90000002'),name:'Synthetic sender'},parts})

test('OneBot nested sources and quotes retain original images through prepare, queue and merged send',options,async t=>{
 const f=await protocol(t,{intercept(peer,request){if(request.action==='get_forward_msg'){reply(peer,request,{messages:[{sender:{user_id:90000003,nickname:'Displayed source'},time:1000,content:request.params.id==='root'?[{type:'text',data:{text:'original before'}},{type:'image',data:{url:'https://example.invalid/original.png'}},{type:'reply',data:{id:'41'}},{type:'forward',data:{id:'child'}}]:[{type:'text',data:{text:'nested exact original'}}]}]});return true}}})
 source(f,41,[{type:'text',data:{text:'exact quoted message'}}]);await f.message(value=>value.messageId==='41');source(f,42,[{type:'forward',data:{id:'root'}}]);await f.message(value=>value.messageId==='42')
 const document=await f.runtime.read({scope:f.scope(),rootMessageId:mid('42'),resourceId:fid('root')},signal());assert.equal(document.complete,true);const media=document.resources[0].nodes[0].parts.find(value=>value.type==='image');mediaFixture(f,new Map([[media.attachmentId,await original()]]),f.scope())
 const prepared=await f.runtime.prepare({scope:f.scope(),operationId:'prepare-source',input:{kind:'source',rootMessageId:'42',resourceId:'root'}},signal()),d=await delivery(f),request={scope:f.scope(),actorId:'90000002',operationId:'send-source',preparedId:prepared.id},task=await d.service.submit(request,signal());await d.queue.wait(f.scope(),task.id,signal());const record=d.queue.inspect(f.scope(),task.id)
 assert.equal(record.execution,'completed');assert.equal(record.outputs[0].state,'accepted');assert.equal(writes(f).length,1);const wire=writes(f)[0].params.messages[0].data.content;assert.equal(wire[0].data.text,'original before');assert.deepEqual(Buffer.from(wire[1].data.file.slice('base64://'.length),'base64'),png);assert.equal(wire[2].data.content[0].data.text,'exact quoted message');assert.equal(wire[3].data.content[0].data.text,'nested exact original');assert.equal(f.transport.status().storedMediaBytes,0);assert.equal(f.requests.some(value=>value.action==='get_msg'),false)
 assert.equal((await d.service.submit(request,signal())).replayed,true);await d.reopen();assert.equal((await d.service.submit(request,signal())).replayed,true);await d.queue.wait(f.scope(),task.id,signal());assert.equal(writes(f).length,1)
})

test('persisted forward bytes still send after core restart without an inbound media service',options,async t=>{
 const f=await protocol(t),attachment=identifier('im.attachment','synthetic-image');mediaFixture(f,new Map([[attachment,await original()]]),f.scope());const input={scope:f.scope(),operationId:'persistent-original',input:{kind:'generated',nodes:[custom([{type:'image',attachmentId:attachment}])]}}
 const prepared=await f.runtime.prepare(input,signal());await f.reopen();f.cleanup(f.runtime.register(oneBotProvider(f.transport,f.config)));f.setMedia(undefined)
 assert.equal((await f.runtime.prepare(input,signal())).replayed,true);assert.equal((await f.transport.send({scope:f.scope(),operationId:identifier('im.operation','retained-send'),parts:[{type:'forward',resourceId:identifier('im.forward',prepared.id)}]},signal())).status,'accepted');assert.deepEqual(Buffer.from(writes(f)[0].params.messages[0].data.content[0].data.file.slice('base64://'.length),'base64'),png);assert.equal(f.transport.status().storedMediaBytes,0)
})

test('a timeout remains uncertain across queue restart and never starts another merged send',options,async t=>{
 const f=await protocol(t,{patch:{actionTimeoutMs:30},intercept(peer,request){return request.action==='send_group_forward_msg'}}),prepared=await f.runtime.prepare({scope:f.scope(),operationId:'prepare-uncertain',input:{kind:'generated',nodes:[custom()]}},signal()),d=await delivery(f),request={scope:f.scope(),actorId:'90000002',operationId:'send-uncertain',preparedId:prepared.id},task=await d.service.submit(request,signal());await d.queue.wait(f.scope(),task.id,signal());assert.equal(d.queue.inspect(f.scope(),task.id).outputs[0].state,'uncertain');await d.reopen();assert.equal((await d.service.submit(request,signal())).replayed,true);await d.queue.wait(f.scope(),task.id,signal());assert.equal(writes(f).length,1);assert.equal(d.queue.inspect(f.scope(),task.id).outputs[0].attempts,1)
})

test('held forwards in two groups do not prevent an ordinary chat send or duplicate queue outputs',options,async t=>{
 const held=[],entered=deferred(),f=await protocol(t,{intercept(peer,request){if(request.action==='send_group_forward_msg'){held.push({peer,request});if(held.length===2)entered.resolve();return true}}}),d=await delivery(f),tasks=[]
 f.cleanup(()=>{for(const value of held)if(value.peer.readyState===1)reply(value.peer,value.request,{message_id:8800+held.indexOf(value)})})
 for(const peer of['90000100','90000101']){const scope=f.scope(peer),prepared=await f.runtime.prepare({scope,operationId:'prepare-multi',input:{kind:'generated',nodes:[custom()]}},signal());tasks.push({scope,...await d.service.submit({scope,actorId:'90000002',operationId:'send-multi',preparedId:prepared.id},signal())})}
 await entered.promise;assert.equal((await d.im.send({scope:f.scope(),operationId:identifier('im.operation','ordinary-during-forward'),parts:[{type:'text',text:'chat continues'}]},signal())).status,'accepted');assert.equal(writes(f).length,2);for(const value of held)reply(value.peer,value.request,{message_id:8800+held.indexOf(value)});for(const task of tasks){await d.queue.wait(task.scope,task.id,signal());assert.equal(d.queue.inspect(task.scope,task.id).outputs[0].state,'accepted')};assert.equal(writes(f).length,2)
})

test('file-bearing graphs refuse the complete send without dropping the file or issuing a partial write',options,async t=>{
 const f=await protocol(t),id=identifier('im.attachment','synthetic-html');mediaFixture(f,new Map([[id,await original(Buffer.from('<!doctype html><h1>complete file</h1>'),'full.html')]]),f.scope());const prepared=await f.runtime.prepare({scope:f.scope(),operationId:'file',input:{kind:'generated',nodes:[custom([{type:'text',text:'before file'},{type:'file',attachmentId:id,name:'full.html'}])]}},signal());assert.deepEqual(await f.runtime.sendRetained(f.scope(),prepared.id,signal()),{status:'failed',code:'rejected'});assert.equal(writes(f).length,0);assert.equal(f.runtime.inspect(f.scope(),prepared.id).assets.length,1);assert.equal(f.transport.status().storedMediaBytes,0)
})

test('an unexpected sender exception stays uncertain and temporary media are still released',options,async t=>{
 const f=await protocol(t),id=identifier('im.attachment','synthetic-image');mediaFixture(f,new Map([[id,await original()]]),f.scope());const prepared=await f.runtime.prepare({scope:f.scope(),operationId:'exception',input:{kind:'generated',nodes:[custom([{type:'image',attachmentId:id}])]}},signal());let calls=0
 f.transport.sendForwardNodes=async()=>{calls++;throw Error('Synthetic unknown dispatch result')};assert.deepEqual(await f.runtime.sendRetained(f.scope(),prepared.id,signal()),{status:'uncertain',code:'provider-error'});assert.equal(calls,1);assert.equal(f.transport.status().storedMediaBytes,0)
})
