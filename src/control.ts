/** Native owner control preserves retained graphs and originals through idle configuration reloads. */
import type {Context} from '@deepseek-ai/cordis'
import type {Entry} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import {Remote,RemoteError,TypertRemoteService,principalOf} from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from './index.ts'
import {Config as RuntimeConfig,validateConfig,type Config as RuntimeSettings} from './config.ts'
import {FIELDS} from './fields.ts'
import {fingerprint} from './wire.ts'
import {ForwardRuntime} from './runtime.ts'
import {PreparedStore} from './store.ts'
import {ForwardError} from './errors.ts'
import {renderPreview} from './render.ts'
import {saveSchema,revisionSchema,listSchema,selectionSchema,originalSchema,originalsSchema} from './control-codecs.ts'
import type {Snapshot,Catalog,RecordPage,Detail,Failure,OriginalPage} from './control-types.ts'

/** Owner-page capacities never truncate the retained originals. */
export interface ControlConfig{targetEntryId:string;statusRefreshMs:number;pageSize:number;maxScopeOptions:number;previewChars:number;previewMedia:number}
/** Controller lifetime is independent of runtime activation. */
export const Config:z<ControlConfig>=z.object({targetEntryId:z.string().default('qq-forward'),statusRefreshMs:z.number().min(250).max(60000).step(1).default(3000),pageSize:z.number().min(1).max(500).step(1).default(50),maxScopeOptions:z.number().min(1).max(100000).step(1).default(1000),previewChars:z.number().min(1).max(32768).step(1).default(4096),previewMedia:z.number().min(1).max(512).step(1).default(20)})
const fail=(reason:Failure)=>new RemoteError('qq-forward/control','Forward management operation could not complete',{reason})
function parsed(value:unknown):RuntimeSettings{try{if(typeof value!=='object'||!value||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(FIELDS,key)))throw fail('invalid');return validateConfig(z.resolve(value,RuntimeConfig,{})[0])}catch(error){throw fail('invalid')}}
function decode<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch(error){throw fail('invalid')}}
function safe(error:unknown):never{if(error instanceof RemoteError){if(error.code==='qq-forward/control')throw fail(error.details.reason);throw fail('unavailable')};if(error instanceof ForwardError){const code=error.code;throw fail(code==='capacity'||code==='storage'||code==='conflict'||code==='busy'||code==='invalid'||code==='not-found'||code==='cancelled'?code:'unavailable')}throw fail('unavailable')}
declare module '@deepseek-ai/cordis'{interface Context{readonly imForwardControl:ForwardControl}}

/** Owner methods never accept native receipts, paths or live destination sends. */
export class ForwardControl extends TypertRemoteService{
 static inject=['configEditor','storageDomain']
 static Config=Config
 private readonly lifetime=new AbortController()
 private tail:Promise<void>=Promise.resolve()
 private downloads=false
 constructor(ctx:Context,private readonly config:ControlConfig){
  super(ctx,'imForwardControl');if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(config.targetEntryId))throw new Error('Invalid forward entry')
  ctx.effect(()=>async()=>{this.lifetime.abort();await this.tail})
  ctx.inject(['connection'],child=>{child.effect(()=>{const lifetime=new AbortController(),release=child.connection.fetch.register({path:'/api/qq-forward-original',methods:['GET'],requestBody:'buffered',fetch:request=>this.download(request,lifetime.signal)});return async()=>{lifetime.abort();await release()}});child.effect(()=>{this.downloads=true;return()=>{this.downloads=false}})})
 }
 private owner():AbortSignal|undefined{if(principalOf(this.ctx.invocation))throw fail('forbidden');const signal=this.ctx.invocation?.signal;if(this.lifetime.signal.aborted||signal?.aborted)throw fail('cancelled');return signal}
 private serial<T>(operation:()=>Promise<T>):Promise<T>{const signal=this.owner(),done=this.tail.then(async()=>{if(this.lifetime.signal.aborted||signal?.aborted)throw fail('cancelled');try{return await operation()}catch(error){safe(error)}});this.tail=done.then(()=>{},()=>{});return done}
 private target():Entry{const entries=this.ctx.configEditor.entries(),entry=entries.find(value=>value.options.id===this.config.targetEntryId);if(!entry||entry.options.name!=='dsh-qq-forward'||entries.some(value=>value!==entry&&value.options.name==='dsh-qq-forward'))throw fail('unavailable');return entry}
 private runtime():ForwardRuntime{const entry=this.target(),config=parsed(entry.fiber?.effectiveConfig??entry.options.config),runtime=this.ctx.get('imForward');if(!(runtime instanceof ForwardRuntime)||entry.disabled||!config.enabled||entry.fiber?.state!==2||runtime.configRevision!==fingerprint(config)||runtime.status().closed)throw fail('unavailable');return runtime}
 private snapshot():Snapshot{const entry=this.target(),config=parsed(entry.fiber?.effectiveConfig??entry.options.config),runtime=this.ctx.get('imForward'),selected=runtime instanceof ForwardRuntime?runtime:undefined,status=selected?.status()??null,revision=fingerprint(config);return{config,revision,appliedRevision:selected?.configRevision??null,active:config.enabled&&!entry.disabled&&entry.fiber?.state===2&&selected?.configRevision===revision&&!status?.closed,entryDisabled:entry.disabled,refreshMs:this.config.statusRefreshMs,downloads:this.downloads,status}}
 /** @returns saved settings and independent body-free runtime state. */
 @Remote
 describe():Promise<Snapshot>{return this.serial(async()=>this.snapshot())}
 private async replace(revision:string,patch:Partial<RuntimeSettings>,restart:boolean):Promise<Snapshot>{
  const entry=this.target(),current=parsed(entry.fiber?.effectiveConfig??entry.options.config);if(fingerprint(current)!==revision)throw fail('conflict');const next=parsed({...current,...patch}),value=this.ctx.get('imForward'),runtime=value instanceof ForwardRuntime?value:undefined,release=runtime?.acquireMaintenance();let conflict=false
  try{
   if(runtime)runtime.validateReplacement(next);else{const store=await PreparedStore.open(current,this.ctx.storageDomain);try{store.validateReplacement(next)}finally{await store.close()}}
   if(restart){if(this.target()!==entry||fingerprint(parsed(entry.fiber?.effectiveConfig??entry.options.config))!==revision)throw fail('conflict');if(!entry.fiber)throw fail('unavailable');await entry.fiber.restart()}
   else await this.ctx.configEditor.edit(entry,raw=>{if(fingerprint(parsed(entry.fiber?.effectiveConfig??entry.options.config))!==revision){conflict=true;throw fail('conflict')}return{...raw,...patch}})
  }catch(error){if(error instanceof ForwardError||error instanceof RemoteError&&error.code==='qq-forward/control')throw error;throw fail(conflict?'conflict':'apply-failed')}finally{release?.()}
  return this.snapshot()
 }
 /** @param request - declared settings patch and observed revision. @returns saved and applied state; active IO refuses reload. */
 @Remote
 save(request:unknown):Promise<Snapshot>{this.owner();const decoded=decode(saveSchema,request);return this.serial(()=>this.replace(decoded.revision,decoded.patch,false))}
 /** @param request - observed revision. @returns state after an explicit idle restart, without replay or data deletion. */
 @Remote
 restart(request:unknown):Promise<Snapshot>{this.owner();const decoded=decode(revisionSchema,request);return this.serial(()=>this.replace(decoded.revision,{},true))}
 /** @returns retained exact scopes and an explicit omitted count. */
 @Remote
 scopes():Promise<Catalog>{return this.serial(async()=>{const all=this.runtime().scopes();return{scopes:all.slice(0,this.config.maxScopeOptions),omitted:Math.max(0,all.length-this.config.maxScopeOptions)}})}
 /** @param request - exact conversation and offset. @returns bounded metadata without message bodies or native receipts. */
 @Remote
 list(request:unknown):Promise<RecordPage>{this.owner();const decoded=decode(listSchema,request);return this.serial(async()=>{const all=[...this.runtime().list(decoded.scope)].reverse(),end=decoded.offset+this.config.pageSize;return{records:all.slice(decoded.offset,end),total:all.length,offset:decoded.offset,nextOffset:end<all.length?end:null}})}
 /** @param request - retained ID and exact scope. @returns bounded preview plus original export metadata; text is never executed. */
 @Remote
 inspect(request:unknown):Promise<Detail>{this.owner();const decoded=decode(selectionSchema,request);return this.serial(async()=>{const runtime=this.runtime(),record=runtime.inspect(decoded.scope,decoded.id),view=runtime.list(decoded.scope).find(value=>value.id===decoded.id);if(!view)throw fail('not-found');return{record:view,preview:renderPreview(record.document,{maxChars:this.config.previewChars,maxMedia:this.config.previewMedia}),originals:record.assets.slice(0,this.config.previewMedia).map(asset=>{const d=asset.stored.descriptor;return{id:asset.originalId,name:d.fileName,mime:d.mime,bytes:d.byteLength,sha256:d.sha256,...d.image?{width:d.image.width,height:d.image.height}:{}}}),omittedOriginals:Math.max(0,record.assets.length-this.config.previewMedia)}})}
 /** @param request - exact record and offset. @returns bounded original metadata; downloads remain byte-complete. */
 @Remote
 originals(request:unknown):Promise<OriginalPage>{this.owner();const decoded=decode(originalsSchema,request);return this.serial(async()=>{const assets=this.runtime().inspect(decoded.scope,decoded.id).assets,end=decoded.offset+this.config.previewMedia;return{originals:assets.slice(decoded.offset,end).map(asset=>{const d=asset.stored.descriptor;return{id:asset.originalId,name:d.fileName,mime:d.mime,bytes:d.byteLength,sha256:d.sha256,...d.image?{width:d.image.width,height:d.image.height}:{}}}),total:assets.length,nextOffset:end<assets.length?end:null}})}
 private async download(request:Request,lifetime:AbortSignal):Promise<Response>{
  try{
   this.owner();const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['scope','id','attachment'].includes(key))||query.getAll('scope').length!==1||query.getAll('id').length!==1||query.getAll('attachment').length!==1||(query.get('scope')?.length??0)>4096)return new Response(null,{status:400})
   let scope:unknown;try{scope=JSON.parse(query.get('scope')??'')}catch(error){return new Response(null,{status:400})}
   const selected=decode(originalSchema,{scope,id:query.get('id'),attachment:query.get('attachment')}),original=await this.runtime().readOriginal(selected.scope,selected.id,selected.attachment,AbortSignal.any([request.signal,this.lifetime.signal,lifetime])),d=original.descriptor,name=encodeURIComponent(d.fileName).replace(/['()*]/g,value=>'%'+value.charCodeAt(0).toString(16).toUpperCase()),inline=/^(?:image\/(?:png|jpeg|gif|webp)|audio\/|video\/)/.test(d.mime)
   return new Response(original.copyBytes(),{headers:{'Content-Type':d.mime,'Content-Length':String(d.byteLength),'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${name}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})
  }catch(error){return new Response(null,{status:error instanceof ForwardError&&error.code==='busy'?409:error instanceof RemoteError&&error.code==='qq-forward/control'&&error.details.reason==='forbidden'?403:404})}
 }
}
export default ForwardControl
