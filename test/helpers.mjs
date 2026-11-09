/** Synthetic identities and native storage are isolated beneath this repository. */
import {mkdtemp,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonBackend from '@deepseek-ai/dsh-storage-json'
import NativeAttachments from '@deepseek-ai/dsh-attachment-local'
import {DomainFacility} from '@deepseek-ai/dsh-storage-domain'
import {identifier,scopeKey} from 'dsh-im-kit'
import {ImMediaRuntime} from 'dsh-media-kit/im'
import {inspectOriginal,resolveInspection,mediaProvider,mediaSource} from 'dsh-media-kit'
import {Config,ForwardRuntime} from '../dist/index.js'
export const signal=()=>new AbortController().signal
export const mid=value=>identifier('im.message',value),fid=value=>identifier('im.forward',value),aid=value=>identifier('im.attachment',value)
export const scope=(peer='synthetic-group',kind='group',account='synthetic-bot')=>({account:{tenantId:identifier('im.tenant','synthetic'),networkId:identifier('im.network','fixture'),accountId:identifier('im.account',account)},kind,peerId:identifier('im.peer',peer)})
export const node=(parts=[{type:'text',text:'exact original\nsecond line'}],extra={})=>({claimedSender:{id:identifier('im.user','synthetic-member'),name:'Displayed claim'},parts,...extra})
export const request=(resource='root',root='outer',destination=scope())=>({scope:destination,rootMessageId:mid(root),resourceId:fid(resource)})
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1UAAAAASUVORK5CYII=','base64')
export const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')
export async function original(bytes=png,name='original.png'){
 return inspectOriginal(resolveInspection({maxBytes:1048576,maxDetectorBuffer:1048576,maxWidth:8192,maxHeight:8192,maxPixels:16777216,allowedMimeTypes:['image/png','image/gif','text/html']}),{bytes,fileName:name,source:{provider:mediaProvider('synthetic'),id:mediaSource(name),kind:'fixture'},...name.endsWith('.html')?{textMime:'text/html'}:{}},signal())
}
export async function setup(t,patch={}){
 const root=fileURLToPath(new URL('../.test-artifacts/unit/',import.meta.url));await mkdir(root,{recursive:true});const area=await mkdtemp(join(root,'case-')),ctx=new Context(),cleanups=[]
 t.after(async()=>{const failures=[];for(const close of cleanups.reverse())try{await close()}catch(error){failures.push(error)}if(failures.length)throw new AggregateError(failures)})
 const storage=ctx.plugin(Storage);cleanups.push(()=>storage.dispose());await storage.await()
 const backend=ctx.plugin(JsonBackend,{root:join(area,'storage')});cleanups.push(()=>backend.dispose());await backend.await()
 const domains=new DomainFacility(ctx,{backend:'json'});cleanups.push(()=>domains.closeAll())
 const attachments=ctx.plugin(NativeAttachments,NativeAttachments.Config({dshHome:join(area,'home')}));cleanups.push(()=>attachments.dispose());await attachments.await()
 const media=new ImMediaRuntime({maxProviders:8,maxPendingPerProvider:16});cleanups.push(()=>media.close())
 const config=Config({enabled:true,namespace:'fixture_forward',...patch}),capacity=[];let activeMedia=media,runtime=await ForwardRuntime.open(config,{storage:domains,attachments:ctx.attachments,media:()=>activeMedia,capacity:value=>capacity.push(value)})
 cleanups.push(()=>runtime.close())
 return{area,ctx,domains,media,config,capacity,cleanup(close){cleanups.push(close)},get runtime(){return runtime},setMedia(value){activeMedia=value},async reopen(){await runtime.close();runtime=await ForwardRuntime.open(config,{storage:domains,attachments:ctx.attachments,media:()=>activeMedia,capacity:value=>capacity.push(value)});return runtime}}
}
export function mediaFixture(f,entries,destination=scope()){
 let reads=0;const release=f.media.register({account:destination.account,async read(target,id){if(scopeKey(target)!==scopeKey(destination)||!entries.has(id))throw Error('Synthetic denied source');reads++;return entries.get(id)},async store(){throw Error('Not an inbound writer')},async dispose(){}})
 return{get reads(){return reads},release}
}
