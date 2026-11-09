/** Published OneBot provider talks only to an atomically bound synthetic loopback peer. */
import {once,EventEmitter} from 'node:events'
import {WebSocketServer} from 'ws'
import {Config,resolveConfig,OneBotTransport} from 'dsh-qq-onebot'
import {identifier,ImRuntime} from 'dsh-im-kit'
import * as Delivery from 'dsh-job-delivery'
import NativeJobs from '@deepseek-ai/dsh-jobs-local'
import {PreparedForwardJobs,Config as AdapterConfig} from '../dist/job-delivery.js'
import {oneBotProvider} from '../dist/onebot.js'
import {setup,deferred} from './helpers.mjs'

export const reply=(peer,request,data)=>peer.send(JSON.stringify({status:'ok',retcode:0,data,echo:request.echo}))
export async function protocol(t,{intercept,patch={}}={}){
 const base=await setup(t),server=new WebSocketServer({host:'127.0.0.1',port:0}),bus=new EventEmitter(),requests=[],messages=[],connected=deferred();let peer,online=false
 base.cleanup(()=>new Promise(resolve=>{for(const socket of server.clients)socket.terminate();server.close(resolve)}));await once(server,'listening')
 server.on('connection',socket=>{peer=socket;connected.resolve();socket.on('message',raw=>{const request=JSON.parse(raw.toString());requests.push(request);bus.emit('request',request);if(intercept?.(socket,request))return;const data=request.action==='get_login_info'?{user_id:90000001}:request.action==='get_status'?{online:true,good:true}:request.action==='get_group_member_info'?{user_id:90000001,role:'member',shut_up_timestamp:0}:{message_id:1000+requests.length};reply(socket,request,data)})})
 const config=resolveConfig(Config({enabled:true,tenantId:'synthetic',accountId:'90000001',allowedGroups:['90000100','90000101'],allowPrivate:true,forwardUrl:'ws://127.0.0.1:'+server.address().port,connectTimeoutMs:1000,actionTimeoutMs:2000,healthIntervalMs:60000,healthTimeoutMs:2000,...patch}),{ONEBOT_ACCESS_TOKEN:'synthetic-only'})
 const transport=new OneBotTransport(config,{async message(value){messages.push(value);bus.emit('message',value)},status(value){if(value.online){online=true;bus.emit('online')}}});base.cleanup(()=>transport.dispose());await transport.start();await connected.promise;if(!online)await once(bus,'online')
 function wait(event,predicate,values){const current=values.find(predicate);if(current)return Promise.resolve(current);return new Promise((resolve,reject)=>{const listener=value=>{if(predicate(value)){clean();resolve(value)}},abort=()=>{clean();reject(t.signal.reason)},clean=()=>{bus.off(event,listener);t.signal.removeEventListener('abort',abort)};bus.on(event,listener);t.signal.addEventListener('abort',abort,{once:true})})}
 const scope=(peer='90000100',kind='group')=>({account:transport.account,kind,peerId:identifier('im.peer',peer)})
 const f={...base,transport,requests,messages,scope,get peer(){return peer},message:predicate=>wait('message',predicate,messages),request:predicate=>wait('request',predicate,requests),get runtime(){return base.runtime},reopen:()=>base.reopen()}
 base.cleanup(base.runtime.register(oneBotProvider(transport,base.config)));base.cleanup(transport.registerForwardDispatcher({send:(scope,id,signal)=>base.runtime.sendRetained(scope,id,signal)}))
 return f
}

export async function delivery(f){
 const im=new ImRuntime();f.cleanup(()=>im.close());im.register(f.transport);f.ctx.provide('im',im);f.ctx.provide('storageDomain',f.domains);const nativeJobs=f.ctx.plugin(NativeJobs,{});f.cleanup(()=>nativeJobs.dispose());await nativeJobs.await()
 const config=Delivery.Config({enabled:true,namespace:'synthetic_forward_delivery',maxConcurrentExecutions:4,maxConcurrentDeliveries:4,maxExecutionsPerScope:1,maxDeliveriesPerScope:1}),start=async()=>{const fiber=f.ctx.plugin(Delivery,config);await fiber.await();return fiber}
 let fiber=await start();f.cleanup(()=>fiber.dispose());const adapter=()=>new PreparedForwardJobs(f.runtime,f.ctx.jobDelivery,AdapterConfig({enabled:true,provider:'synthetic-forward'}));let service=adapter(),release=f.ctx.jobDelivery.register(service.producer());f.cleanup(()=>release());const off=f.ctx.on('qq-forward/capacity',scope=>f.ctx.jobDelivery.wake(scope));f.cleanup(off)
 return{im,get queue(){return f.ctx.jobDelivery},get service(){return service},async reopen(){await release();await fiber.dispose();fiber=await start();service=adapter();release=f.ctx.jobDelivery.register(service.producer())}}
}
