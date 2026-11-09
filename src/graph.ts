/** Bounded resource and cached-message traversal preserves source envelopes and explicit incomplete outcomes. */
import type {MessageId,ForwardId} from 'dsh-im-kit'
import {isDeepStrictEqual} from 'node:util'
import type {Config} from './config.ts'
import {ForwardError} from './errors.ts'
import type {ForwardDocument,ForwardNode,ForwardProvider,ReadRequest,ForwardResource,ForwardMessage,ForwardProblem,ForwardFailure,ResourceResult} from './types.ts'
/** Scoped resource/message graph identity; IDs from another outer grant never alias it. */
export function graphKey(kind:'resource'|'message',root:MessageId,id:string):string{return JSON.stringify([kind,root,id])}
/** @param nodes - unchanged source nodes. @param config - node, segment and inline bounds. @returns every inline node in encounter order, without truncation. */
export function sourceNodes(nodes:readonly ForwardNode[],config:Config):readonly ForwardNode[]{
 const result:ForwardNode[]=[],queue=nodes.map(node=>({node,depth:1}));let index=0
 while(index<queue.length){const {node,depth}=queue[index++]!;if(depth>config.maxInlineDepth||result.length>=config.maxNodes||node.parts.length>config.maxPartsPerNode)throw new ForwardError('capacity');result.push(node);for(const part of node.parts)if(part.type==='inline-forward')queue.push({node:part.node,depth:depth+1})}
 return result
}
type Task={readonly kind:'resource';readonly root:MessageId;readonly id:ForwardId;readonly depth:number}|{readonly kind:'message';readonly root:MessageId;readonly id:MessageId;readonly depth:number}
type ReadOutcome={readonly kind:'resource';readonly task:Extract<Task,{kind:'resource'}>;readonly result:ResourceResult}|{readonly kind:'message';readonly task:Extract<Task,{kind:'message'}>;readonly node:ForwardNode|null;readonly source:'document'|'outer-cache'|null;readonly origin:MessageId|null;readonly failure:ForwardFailure|null}
/** Provider calls are limited independently; a limited callback must not recursively acquire that same limiter. */
export type ProviderCall=<T>(run:()=>Promise<T>)=>Promise<T>
/** @param request - authenticated outer envelope. @param provider - exact-account source adapter. @param config - traversal limits. @param call - shared provider-call limiter. @param signal - read and provider lifetime. @returns a detached source graph; missing, cyclic and limited edges remain explicit. */
export async function readGraph(request:ReadRequest,provider:ForwardProvider,config:Config,call:ProviderCall,signal:AbortSignal):Promise<ForwardDocument>{
 const resources=new Map<string,ForwardResource>(),messages=new Map<string,ForwardMessage>(),problems=new Map<string,ForwardProblem>(),planned=new Map<string,Task>(),pending:Task[]=[],internal=new Map<string,ForwardNode[]>();let resourceCount=0,messageCount=0,nodeCount=0
 const issue=(task:Task,code:ForwardFailure)=>{problems.set(graphKey(task.kind,task.root,task.id),{rootMessageId:task.root,kind:task.kind,id:task.id,code})}
 const schedule=(task:Task)=>{const key=graphKey(task.kind,task.root,task.id),existing=planned.get(key);if(existing&&existing.depth<=task.depth)return;if(task.depth>config.maxTraversalDepth){if(!existing)issue(task,'depth');return}if(!existing&&(task.kind==='resource'?resourceCount>=config.maxResources:messageCount>=config.maxMessages)){issue(task,'capacity');return}if(problems.get(key)?.code==='depth')problems.delete(key);planned.set(key,task);pending.push(task);if(!existing){if(task.kind==='resource')resourceCount++;else messageCount++}}
 const inspect=(nodes:readonly ForwardNode[],root:MessageId,depth:number,first:boolean)=>{
  const all=sourceNodes(nodes,config);if(first){nodeCount+=all.length;if(nodeCount>config.maxNodes)throw new ForwardError('capacity')}
  for(const node of all){if(first&&node.sourceMessageId!==undefined){const key=graphKey('message',root,node.sourceMessageId),list=internal.get(key)??[];list.push(node);internal.set(key,list)}if(node.referenceMessageId!==undefined)schedule({kind:'message',root,id:node.referenceMessageId,depth:depth+1});for(const part of node.parts){if(part.type==='forward')schedule({kind:'resource',root,id:part.resourceId,depth:depth+1});if(part.type==='reply')schedule({kind:'message',root,id:part.messageId,depth:depth+1})}}
 }
 schedule({kind:'resource',root:request.rootMessageId,id:request.resourceId,depth:1})
 while(pending.length){
  if(signal.aborted)throw new ForwardError('cancelled')
  for(let index=pending.length-1;index>=0;index--){const task=pending[index]!;if(planned.get(graphKey(task.kind,task.root,task.id))!==task)pending.splice(index,1)}
  if(pending.length===0)break
  const resourceLevel=pending.some(task=>task.kind==='resource'),kind=resourceLevel?'resource':'message',depth=Math.min(...pending.filter(task=>task.kind===kind).map(task=>task.depth)),batch:Task[]=[]
  for(let index=pending.length-1;index>=0;index--)if(pending[index]!.kind===kind&&pending[index]!.depth===depth)batch.unshift(...pending.splice(index,1))
  const settled=await Promise.allSettled(batch.map(task=>call(async():Promise<ReadOutcome>=>{
   if(signal.aborted)throw new ForwardError('cancelled')
   if(task.kind==='resource'){
    const id=task.id
    const cached=resources.get(graphKey('resource',task.root,id));if(cached)return{kind:'resource',task,result:cached.status==='resolved'?{status:'resolved',nodes:cached.nodes,...cached.raw===undefined?{}:{raw:cached.raw}}:{status:'failed',code:cached.failure??'unavailable'}}
    let result;try{result=await provider.read({...request,rootMessageId:task.root,resourceId:id},signal)}catch(error){result={status:'failed' as const,code:'unavailable' as const}}
    if(signal.aborted)throw new ForwardError('cancelled')
    return{kind:'resource',task,result}
   }
   const id=task.id,local=internal.get(graphKey('message',task.root,id))
   if(local?.length===1)return{kind:'message',task,node:local[0]!,source:'document',origin:task.root,failure:null}
   if(local&&local.length>1)return{kind:'message',task,node:null,source:null,origin:null,failure:'ambiguous'}
   const cached=messages.get(graphKey('message',task.root,id));if(cached)return{kind:'message',task,node:cached.node,source:cached.source,origin:cached.originRootMessageId,failure:cached.failure}
   let node:ForwardNode|null=null;try{node=await provider.message?.(request.scope,id,signal)??null}catch(error){return{kind:'message',task,node:null,source:null,origin:null,failure:'unavailable'}}
   if(signal.aborted)throw new ForwardError('cancelled')
   return{kind:'message',task,node,source:node?'outer-cache':null,origin:node?id:null,failure:node?null:'not-found'}
  })))
  for(const outcome of settled){
   if(outcome.status==='rejected'){if(signal.aborted)throw new ForwardError('cancelled');throw outcome.reason instanceof ForwardError?outcome.reason:new ForwardError('unavailable')}
   const value=outcome.value,task=value.task,key=graphKey(task.kind,task.root,task.id)
   if(value.kind==='resource'){const result=value.result;if(result.status==='failed'){resources.set(key,{rootMessageId:task.root,id:value.task.id,status:'failed',nodes:[],failure:result.code});issue(task,result.code)}else{const nodes=structuredClone(result.nodes);inspect(nodes,task.root,task.depth,!resources.has(key));resources.set(key,{rootMessageId:task.root,id:value.task.id,status:'resolved',nodes,failure:null,...result.raw===undefined?{}:{raw:structuredClone(result.raw)}})}}
   else if(value.kind==='message'){const node=value.node?structuredClone(value.node):null,failure=value.failure,first=!messages.has(key);messages.set(key,{rootMessageId:task.root,id:value.task.id,originRootMessageId:value.origin,status:node?'resolved':'failed',node,failure,source:value.source});if(node)inspect([node],value.origin!,task.depth,first&&value.source==='outer-cache');if(!node)issue(task,failure??'not-found')}
   else{const unreachable:never=value;throw new Error(String(unreachable))}
  }
  if(Buffer.byteLength(JSON.stringify([...resources.values()]))+Buffer.byteLength(JSON.stringify([...messages.values()]))>config.maxDocumentBytes)throw new ForwardError('capacity')
 }
 for(const [key,message]of messages){const local=internal.get(key);if(message.node&&local&&(local.length!==1||!isDeepStrictEqual(local[0],message.node))){messages.set(key,{...message,status:'failed',node:null,failure:'ambiguous',source:null,originRootMessageId:null});const task=planned.get(key);if(task)issue(task,'ambiguous')}}
 const adjacency=new Map<string,readonly string[]>()
 const edges=(nodes:readonly ForwardNode[],root:MessageId)=>sourceNodes(nodes,config).flatMap(node=>[...node.referenceMessageId===undefined?[]:[graphKey('message',root,node.referenceMessageId)],...node.parts.flatMap(part=>part.type==='forward'?[graphKey('resource',root,part.resourceId)]:part.type==='reply'?[graphKey('message',root,part.messageId)]:[])])
 for(const [key,resource]of resources)adjacency.set(key,edges(resource.nodes,resource.rootMessageId))
 for(const [key,message]of messages)adjacency.set(key,message.node&&message.originRootMessageId?edges([message.node],message.originRootMessageId):[])
 const visiting=new Set<string>(),visited=new Set<string>(),stack=[{key:graphKey('resource',request.rootMessageId,request.resourceId),index:0}]
 while(stack.length){const frame=stack.at(-1)!;visiting.add(frame.key);const children=adjacency.get(frame.key)??[];if(frame.index===children.length){visiting.delete(frame.key);visited.add(frame.key);stack.pop();continue}const child=children[frame.index++]!;if(visiting.has(child)){const task=planned.get(child);if(task)issue(task,'cycle')}else if(!visited.has(child))stack.push({key:child,index:0})}
 const document:ForwardDocument={...request,resources:[...resources.values()],messages:[...messages.values()],problems:[...problems.values()],complete:problems.size===0,nodeCount}
 if(Buffer.byteLength(JSON.stringify(document))>config.maxDocumentBytes)throw new ForwardError('capacity')
 return document
}
