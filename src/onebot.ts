/** Optional OneBot bridge uses admitted source grants and releases every temporary outbound byte reference. */
import type {Context} from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {AttachmentId,DeliveryReceipt} from 'dsh-im-kit'
import type {OneBotTransport,OneBotForwardNode,OneBotForwardPart} from 'dsh-qq-onebot'
import {materialize} from './materialize.ts'
import {sourceNodes} from './graph.ts'
import {ForwardError} from './errors.ts'
import type {Config as RuntimeConfig} from './config.ts'
import type {ForwardProvider,ForwardNode} from './types.ts'
import type {} from './index.ts'

/** Disabled until selected explicitly; capacities belong to the core and transport Config fields. */
export const Config=z.object({enabled:z.boolean().default(false)})
/** Optional bridge settings. */
export type Config=ReturnType<typeof Config>

/**
 * Build a Host-only adapter without starting or owning the protocol connection.
 * @param transport - installed OneBot 0.4 account, source cache and single-attempt sender.
 * @param config - resolved document and expansion capacities.
 * @returns an account provider; disposal never closes the separately owned transport.
 */
export function oneBotProvider(transport:OneBotTransport,config:RuntimeConfig):ForwardProvider{
 return{
  account:transport.account,
  async read(request,signal){const result=await transport.readForward(request.scope,request.rootMessageId,request.resourceId,signal);return result.status==='resolved'?{status:'resolved',nodes:result.nodes,raw:result.raw}:result},
  async message(scope,id,signal){if(signal.aborted)throw new ForwardError('cancelled');const original=transport.messageSnapshot(scope,id);return original?{claimedSender:{id:original.senderId},sentAt:original.sentAt,sourceMessageId:original.messageId,parts:original.parts}:null},
  async send(scope,document,originals,signal):Promise<DeliveryReceipt>{
   if(signal.aborted)return{status:'failed',code:'cancelled'}
   let nodes:readonly ForwardNode[]
   try{nodes=materialize(document,config)}catch(error){return{status:'failed',code:error instanceof ForwardError&&error.code==='capacity'?'unavailable':'rejected'}}
   const all=sourceNodes(nodes,config)
   if(all.some(node=>node.parts.some(part=>part.type==='file'||part.type==='unsupported'||part.type==='forward'||part.type==='reply')))return{status:'failed',code:'rejected'}
   const sources=new Map(originals.map(value=>[value.originalId,value.original])),references=new Map<string,AttachmentId>(),owned:AttachmentId[]=[];let senderInvoked=false
   try{
    const convert=(node:ForwardNode):OneBotForwardNode=>{
     const parts:OneBotForwardPart[]=node.parts.map(part=>{
      if(part.type==='inline-forward')return{type:'inline-forward',node:convert(part.node)}
      if(part.type!=='image'&&part.type!=='audio'&&part.type!=='video')return part
      const key=JSON.stringify([part.attachmentId,part.type]);let attachmentId=references.get(key)
      if(!attachmentId){const original=sources.get(part.attachmentId);if(!original)throw new ForwardError('media-unavailable');attachmentId=transport.registerMedia(scope,part.type,original.copyBytes());references.set(key,attachmentId);owned.push(attachmentId)}
      return{type:part.type,attachmentId}
     })
     return{...node,parts}
    }
    const output=nodes.map(convert)
    if(signal.aborted)return{status:'failed',code:'cancelled'}
    senderInvoked=true;return await transport.sendForwardNodes(scope,output,signal)
   }catch(error){return senderInvoked?{status:'uncertain',code:'provider-error'}:{status:'failed',code:signal.aborted?'cancelled':'unavailable'}}
   finally{for(const id of owned)transport.releaseMedia(scope,id)}
  },
  async dispose(){/* The bridge owns no connection; all request-local media are released by send. */},
 }
}
/** Native optional protocol adapter identity. */
export const name='qq-forward-onebot'
/** The selected core and OneBot provider must already be installed. */
export const inject=['imForward','qqOnebot']
/** @param ctx - profile's retained-document and protocol capabilities. @param config - explicit adapter activation. */
export function apply(ctx:Context,config:Config):void{if(!config.enabled)return;ctx.effect(()=>ctx.imForward.register(oneBotProvider(ctx.qqOnebot,ctx.imForward.config)));ctx.effect(()=>ctx.qqOnebot.registerForwardDispatcher({send:(scope,id,signal)=>ctx.imForward.sendRetained(scope,id,signal)}))}
