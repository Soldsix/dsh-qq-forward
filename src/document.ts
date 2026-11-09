/** Retained documents must contain exactly their reachable, acyclic, scope-bound source graph. */
import {isDeepStrictEqual} from 'node:util'
import type {AttachmentId} from 'dsh-im-kit'
import type {Config} from './config.ts'
import {ForwardError} from './errors.ts'
import {graphKey,sourceNodes} from './graph.ts'
import type {ForwardDocument,ForwardNode} from './types.ts'

/** @param document - decoded retained graph. @param config - traversal budgets. @returns all referenced media IDs after complete graph validation. */
export function completeMedia(document:ForwardDocument,config:Config):ReadonlySet<AttachmentId>{
 const invalid=():never=>{throw new ForwardError('invalid')}
 if(!document.complete||document.problems.length)invalid()
 const entries=new Map<string,{nodes:readonly ForwardNode[];root:typeof document.rootMessageId}>(),sources=new Map<string,ForwardNode[]>(),media=new Set<AttachmentId>();let count=0
 const collect=(nodes:readonly ForwardNode[],root:typeof document.rootMessageId)=>{
  const all=sourceNodes(nodes,config);count+=all.length
  for(const node of all){
   if(node.sourceMessageId!==undefined){const key=graphKey('message',root,node.sourceMessageId),found=sources.get(key)??[];found.push(node);sources.set(key,found)}
   for(const part of node.parts)if(part.type==='image'||part.type==='audio'||part.type==='video'||part.type==='file')media.add(part.attachmentId)
  }
 }
 for(const resource of document.resources){
  const key=graphKey('resource',resource.rootMessageId,resource.id)
  if(entries.has(key)||resource.status!=='resolved'||resource.failure!==null)invalid()
  entries.set(key,{nodes:resource.nodes,root:resource.rootMessageId});collect(resource.nodes,resource.rootMessageId)
 }
 for(const message of document.messages){
  const key=graphKey('message',message.rootMessageId,message.id)
  if(entries.has(key)||message.status!=='resolved'||!message.node||!message.originRootMessageId||message.failure!==null||!message.source)invalid()
  entries.set(key,{nodes:[message.node!],root:message.originRootMessageId!})
  if(message.source==='outer-cache'){
   if(message.originRootMessageId!==message.id)invalid()
   collect([message.node!],message.originRootMessageId!)
  }else if(message.originRootMessageId!==message.rootMessageId)invalid()
 }
 for(const message of document.messages)if(message.source==='document'){
  const local=sources.get(graphKey('message',message.rootMessageId,message.id))
  if(local?.length!==1||!isDeepStrictEqual(local[0],message.node))invalid()
 }
 if(count!==document.nodeCount||count>config.maxNodes||media.size>config.maxAssets)invalid()
 const edges=new Map<string,readonly string[]>()
 for(const [key,entry]of entries){
  const children:string[]=[]
  for(const node of sourceNodes(entry.nodes,config)){
   if(node.referenceMessageId!==undefined)children.push(graphKey('message',entry.root,node.referenceMessageId))
   for(const part of node.parts)if(part.type==='forward')children.push(graphKey('resource',entry.root,part.resourceId));else if(part.type==='reply')children.push(graphKey('message',entry.root,part.messageId))
  }
  if(children.some(child=>!entries.has(child)))invalid()
  edges.set(key,children)
 }
 const root=graphKey('resource',document.rootMessageId,document.resourceId)
 if(!entries.has(root))invalid()
 const depths=new Map([[root,1]]),queue=[root]
 for(let index=0;index<queue.length;index++)for(const child of edges.get(queue[index]!)??[])if(!depths.has(child)){const depth=depths.get(queue[index]!)!+1;if(depth>config.maxTraversalDepth)invalid();depths.set(child,depth);queue.push(child)}
 if(depths.size!==entries.size)invalid()
 const visiting=new Set<string>(),visited=new Set<string>(),stack=[{key:root,index:0}]
 while(stack.length){const frame=stack.at(-1)!;visiting.add(frame.key);const children=edges.get(frame.key)??[];if(frame.index===children.length){visiting.delete(frame.key);visited.add(frame.key);stack.pop();continue}const child=children[frame.index++]!;if(visiting.has(child))invalid();if(!visited.has(child))stack.push({key:child,index:0})}
 if(Buffer.byteLength(JSON.stringify(document))>config.maxDocumentBytes)invalid()
 return media
}
