/** Scoped traversal and durable prepared originals compose with existing IM delivery queues. */
import pLimit from 'p-limit'
import {randomUUID} from 'node:crypto'
import {accountKey,scopeKey,sameScope,identifier,type AccountKey,type ConversationScope,type AttachmentId,type DeliveryReceipt} from 'dsh-im-kit'
import type {DomainFacility} from '@deepseek-ai/dsh-storage-domain'
import type {ImMediaRuntime} from 'dsh-media-kit/im'
import {MediaError,type OriginalMedia} from 'dsh-media-kit'
import {saveNativeOriginal,readNativeOriginal,type VerbatimAttachmentStore} from 'dsh-media-kit/dsh-attachments'
import {z} from 'zod'
import {validateConfig,mediaStorage,type Config} from './config.ts'
import {PreparedStore} from './store.ts'
import {Flights} from './flights.ts'
import {ForwardError} from './errors.ts'
import {readGraph,sourceNodes} from './graph.ts'
import {scopeSchema,readSchema,preparedIdSchema,preparedIdentity,fingerprint,parseNodes} from './wire.ts'
import type {ForwardProvider,ForwardDocument,PreparedForward,PreparedId,ForwardAsset,ForwardNode,PreparedView,RuntimeStatus} from './types.ts'
interface Registration{readonly provider:ForwardProvider;readonly owner:string;readonly lifetime:AbortController;readonly pending:Set<Promise<DeliveryReceipt>>;closing?:Promise<void>}
/** Required native bytes and optional protocol-neutral inbound original service. */
export interface ForwardServices{readonly storage:DomainFacility;readonly attachments:VerbatimAttachmentStore;readonly media?:()=>ImMediaRuntime|undefined;readonly capacity?:(scope?:ConversationScope)=>void}
const prepareSchema=z.strictObject({scope:scopeSchema,operationId:z.string().min(1).max(256),input:z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('source'),rootMessageId:z.string().min(1).max(256).transform(v=>identifier('im.message',v)),resourceId:z.string().min(1).max(256).transform(v=>identifier('im.forward',v))}),z.strictObject({kind:z.literal('generated'),nodes:z.unknown()})])})
/** One independent forward service creates no model client, live protocol or automatic reply. */
export class ForwardRuntime{
 private readonly providers=new Map<AccountKey,Registration>()
 private readonly lifetime=new AbortController()
 private readonly reads:Flights<ForwardDocument>
 private readonly prepares:Flights<{readonly id:PreparedId;readonly replayed:boolean}>
 private readonly calls:ReturnType<typeof pLimit>
 private maintenance=false
 private sending=0
 private readonly exports=new Set<Promise<OriginalMedia>>()
 private stopping:Promise<void>|undefined
 private constructor(readonly config:Config,private readonly store:PreparedStore,private readonly services:ForwardServices){this.reads=new Flights(config.maxConcurrentReads);this.prepares=new Flights(config.maxConcurrentPrepares);this.calls=pLimit(config.maxProviderCalls)}
 /** @param config - resolved deployment settings. @param services - native persistence/attachments and optional original-media service. @returns recovered prepared records without replaying sends or provider calls. */
 static async open(config:Config,services:ForwardServices):Promise<ForwardRuntime>{const resolved=Object.freeze({...validateConfig(config)});return new ForwardRuntime(resolved,await PreparedStore.open(resolved,services.storage),services)}
 /** Applied settings fingerprint contains no runtime source data. */
 get configRevision():string{return fingerprint(this.config)}
 private assertMutable():void{if(this.lifetime.signal.aborted)throw new ForwardError('closed');if(this.maintenance)throw new ForwardError('busy')}
 /** @returns an idempotent idle maintenance release; new work is refused until release or disposal. */
 acquireMaintenance():()=>void{this.assertMutable();if(this.reads.size||this.prepares.size||this.sending||this.exports.size)throw new ForwardError('busy');this.maintenance=true;let released=false;return()=>{if(!released){released=true;this.maintenance=false;this.notify()}}}
 /** @param next - prospective parsed capacities. @returns compatibility with all retained data without altering it. */
 validateReplacement(next:Config):void{validateConfig(next);this.store.validateReplacement(next)}
 /** @returns retained conversation identities for trusted Host owner controls. */
 scopes():readonly ConversationScope[]{return this.store.scopes()}
 /** @param scope - exact authorized conversation. @returns scalar record summaries, never source parts or native receipts. */
 list(scope:ConversationScope):readonly PreparedView[]{return this.store.list(scope)}
 /** @param provider - installed exact-account source/sender. @returns cancellation and joined disposal without removing prepared records. */
 register(provider:ForwardProvider):()=>Promise<void>{
  this.assertMutable();const key=accountKey(provider.account);if(this.providers.has(key))throw new ForwardError('conflict')
  const registration:Registration={provider,owner:randomUUID(),lifetime:new AbortController(),pending:new Set()};this.providers.set(key,registration);this.notify()
  return()=>this.stop(key,registration)
 }
 private notify(scope?:ConversationScope):void{try{this.services.capacity?.(scope)}catch(error){/* Invalidation cannot replace a completed registration or send receipt. */}}
 private stop(key:AccountKey,registration:Registration):Promise<void>{if(registration.closing)return registration.closing;registration.lifetime.abort();return registration.closing=(async()=>{const settled=await Promise.allSettled([this.reads.closeOwner(registration.owner),this.prepares.closeOwner(registration.owner),...registration.pending,Promise.resolve().then(()=>registration.provider.dispose())]);if(this.providers.get(key)===registration)this.providers.delete(key);if(settled.some(value=>value.status==='rejected'))throw new ForwardError('unavailable')})()}
 /** @returns body-free runtime facts suitable for the owner page. */
 status():RuntimeStatus{const stored=this.store.status();return{providers:this.providers.size,reading:this.reads.size,preparing:this.prepares.size,sending:this.sending,exporting:this.exports.size,retained:stored.retained,storageFault:stored.fault,maintenance:this.maintenance,closed:this.lifetime.signal.aborted}}
 /** @param value - authenticated scope and root/resource IDs. @param signal - one reader's lifetime. @returns a graph whose source parts are unchanged; missing edges are explicit. */
 async read(value:unknown,signal:AbortSignal):Promise<ForwardDocument>{
  this.assertMutable();let request;try{request=readSchema.parse(value)}catch(error){throw new ForwardError('invalid')}
  const registration=this.providers.get(accountKey(request.scope.account));if(!registration||registration.lifetime.signal.aborted)throw new ForwardError('unavailable')
  const key=fingerprint(request),result=await this.reads.run(key,key,registration.owner,signal,async abort=>{const deadline=AbortSignal.timeout(this.config.readTimeoutMs),combined=AbortSignal.any([abort,deadline,registration.lifetime.signal]);try{const document=await readGraph(request,registration.provider,this.config,work=>this.calls(work),combined);if(combined.aborted)throw new ForwardError(deadline.aborted?'timeout':'cancelled');return document}catch(error){if(combined.aborted)throw new ForwardError(deadline.aborted?'timeout':'cancelled');throw error instanceof ForwardError?error:new ForwardError('unavailable')}})
  return structuredClone(result)
 }
 /** @param scope - exact authorized destination. @param id - opaque prepared identity. @returns an independent retained document and native receipts, for trusted Host consumers only. */
 inspect(scope:ConversationScope,id:PreparedId):PreparedForward{const record=this.store.get(id);if(!record||!sameScope(record.scope,scope))throw new ForwardError('not-found');return structuredClone(record)}
 /** @param scope - exact authorized conversation. @param id - retained output. @param attachment - original handle inside that retained output. @param signal - export lifetime. @returns verified original bytes; no transport source or user-selected location is opened. */
 async readOriginal(scope:ConversationScope,id:PreparedId,attachment:AttachmentId,signal:AbortSignal):Promise<OriginalMedia>{
  this.assertMutable();if(signal.aborted)throw new ForwardError('cancelled');if(this.exports.size>=this.config.maxConcurrentReads)throw new ForwardError('capacity')
  const record=this.inspect(scope,id),asset=record.assets.find(value=>value.originalId===attachment);if(!asset)throw new ForwardError('not-found')
  const combined=AbortSignal.any([signal,this.lifetime.signal]),operation=readNativeOriginal(this.services.attachments,asset.stored,mediaStorage(this.config),combined);this.exports.add(operation)
  try{return await operation}catch(error){throw new ForwardError(combined.aborted?'cancelled':'media-failed')}finally{this.exports.delete(operation)}
 }
 /** @param value - source request or generated nodes; native receipt injection is not accepted. @param signal - one preparation caller. @returns a durable output identity; identical operations replay without new reads or media imports. */
 async prepare(value:unknown,signal:AbortSignal):Promise<{readonly id:PreparedId;readonly replayed:boolean}>{
  this.assertMutable();if(signal.aborted)throw new ForwardError('cancelled')
  let request;try{request=prepareSchema.parse(value)}catch(error){throw new ForwardError('invalid')}
  const nodes=request.input.kind==='generated'?parseNodes(request.input.nodes,this.config):undefined,normalized={...request,input:request.input.kind==='generated'?{kind:'generated' as const,nodes}:request.input},requestFingerprint=fingerprint(normalized),id=preparedIdentity(request.scope,request.operationId),existing=this.store.get(id)
  if(existing){if(existing.requestFingerprint!==requestFingerprint)throw new ForwardError('conflict');return{id,replayed:true}}
  this.store.requireCapacity()
  const registration=this.providers.get(accountKey(request.scope.account))
  return this.prepares.run(id,requestFingerprint,registration?.owner??'prepare',signal,async abort=>{
   const deadline=AbortSignal.timeout(this.config.prepareTimeoutMs),combined=AbortSignal.any([abort,deadline,this.lifetime.signal,...registration?[registration.lifetime.signal]:[]]);try{const again=this.store.get(id);if(again){if(again.requestFingerprint!==requestFingerprint)throw new ForwardError('conflict');return{id,replayed:true}}
   let document:ForwardDocument
   if(request.input.kind==='source')document=await this.read({scope:request.scope,rootMessageId:request.input.rootMessageId,resourceId:request.input.resourceId},combined)
   else{const rootMessageId=identifier('im.message','generated/'+id),resourceId=identifier('im.forward','generated/'+id),localCalls=pLimit(this.config.maxProviderCalls);const fixture:ForwardProvider={account:request.scope.account,async read(input,signal){if(input.rootMessageId===rootMessageId&&input.resourceId===resourceId)return{status:'resolved',nodes:nodes!};return{status:'failed',code:'not-found'}},...registration?.provider.message?{message:registration.provider.message.bind(registration.provider)}:{},async dispose(){}};document=await readGraph({scope:request.scope,rootMessageId,resourceId},fixture,this.config,work=>localCalls(work),combined)}
   if(!document.complete)throw new ForwardError('incomplete')
   const assets=await this.retainAssets(document,combined);if(combined.aborted)throw new ForwardError('cancelled')
   const stored=await this.store.admit({version:1,id,scope:request.scope,operationId:request.operationId,requestFingerprint,fingerprint:fingerprint(document),document,assets,createdAt:Date.now()});return{id,replayed:stored.replayed}
   }catch(error){if(deadline.aborted)throw new ForwardError('timeout');if(combined.aborted)throw new ForwardError('cancelled');throw error}
  })
 }
 private mediaParts(document:ForwardDocument):Map<AttachmentId,Set<string>>{
  const wanted=new Map<AttachmentId,Set<string>>(),groups=[...document.resources.map(value=>value.nodes),...document.messages.flatMap(value=>value.node?[[value.node]]:[])]
  for(const nodes of groups)for(const node of sourceNodes(nodes,this.config))for(const part of node.parts)if(part.type==='image'||part.type==='audio'||part.type==='video'||part.type==='file'){const kinds=wanted.get(part.attachmentId)??new Set();kinds.add(part.type);wanted.set(part.attachmentId,kinds)}
  if(wanted.size>this.config.maxAssets)throw new ForwardError('capacity');return wanted
 }
 private async retainAssets(document:ForwardDocument,signal:AbortSignal):Promise<readonly ForwardAsset[]>{
  const wanted=this.mediaParts(document);if(wanted.size===0)return[];const media=this.services.media?.();if(!media)throw new ForwardError('media-unavailable')
  const lifetime=new AbortController(),combined=AbortSignal.any([signal,lifetime.signal]),storage=mediaStorage(this.config);let total=0,firstFailure:ForwardError|undefined
  const tasks=[...wanted].map(([originalId,kinds])=>this.calls(async()=>{try{if(combined.aborted)throw new ForwardError('cancelled');const original=await media.read(document.scope,originalId,combined);total+=original.descriptor.byteLength;if(original.descriptor.byteLength>this.config.maxMediaItemBytes||total>this.config.maxMediaBytes)throw new ForwardError('capacity');for(const kind of kinds)if(kind!=='file'&&original.descriptor.detectedBy!=='unclassified'&&!original.descriptor.mime.startsWith(kind+'/'))throw new ForwardError('media-failed');const stored=await saveNativeOriginal(this.services.attachments,original,storage,combined);return{originalId,stored}}catch(error){firstFailure??=error instanceof ForwardError?error:new ForwardError('media-failed');lifetime.abort();throw error}}))
  const settled=await Promise.allSettled(tasks);if(signal.aborted)throw new ForwardError('cancelled');if(firstFailure)throw firstFailure;return settled.flatMap(value=>value.status==='fulfilled'?[value.value]:[])
 }
 /** @param scope - exact authorized destination. @param value - a prepared resource reference. @param signal - delivery lifetime. @returns a classified receipt after reading exact originals; use the shared durable task queue for once-per-operation delivery. */
 async sendRetained(scope:ConversationScope,value:unknown,signal:AbortSignal):Promise<DeliveryReceipt>{
  if(signal.aborted||this.lifetime.signal.aborted)return{status:'failed',code:'cancelled'}
  if(this.maintenance)return{status:'failed',code:'unavailable'}
  let id:PreparedId;try{id=preparedIdSchema.parse(value)}catch(error){return{status:'failed',code:'rejected'}}
  let record:PreparedForward;try{record=this.inspect(scope,id)}catch(error){return{status:'failed',code:error instanceof ForwardError&&error.code==='not-found'?'permission-denied':'unavailable'}}
  const registration=this.providers.get(accountKey(scope.account));if(!registration?.provider.send||registration.lifetime.signal.aborted)return{status:'failed',code:'missing-transport'}
  if(this.sending>=this.config.maxConcurrentSends)return{status:'failed',code:'unavailable'}
  this.sending++;const combined=AbortSignal.any([signal,this.lifetime.signal,registration.lifetime.signal]),sender=registration.provider.send.bind(registration.provider)
  const operation=(async():Promise<DeliveryReceipt>=>{
   const originals:{originalId:AttachmentId;original:OriginalMedia}[]=[]
   try{for(const asset of record.assets){if(combined.aborted)return{status:'failed',code:'cancelled'};originals.push({originalId:asset.originalId,original:await readNativeOriginal(this.services.attachments,asset.stored,mediaStorage(this.config),combined)})}}catch(error){return{status:'failed',code:combined.aborted?'cancelled':error instanceof MediaError&&error.code==='storage-unavailable'?'unavailable':'rejected'}}
   if(combined.aborted)return{status:'failed',code:'cancelled'}
   try{return await sender(scope,record.document,originals,combined)}catch(error){return{status:'uncertain',code:'provider-error'}}
  })();registration.pending.add(operation)
  try{return await operation}finally{registration.pending.delete(operation);this.sending--;this.notify(scope)}
 }
 /** @returns completion after reader, prepare, sender and provider cleanup; durable prepared records remain. */
 close():Promise<void>{if(this.stopping)return this.stopping;this.lifetime.abort();return this.stopping=(async()=>{const settled=await Promise.allSettled([this.reads.close(),this.prepares.close(),...[...this.exports].map(value=>value.then(()=>{},()=>{})),...[...this.providers].map(([key,value])=>this.stop(key,value))]);await this.store.close();if(settled.some(value=>value.status==='rejected'))throw new ForwardError('unavailable')})()}
}
