/** Complete retained graphs become bounded display trees without dropping quoted or nested content. */
import type {MessageId} from 'dsh-im-kit'
import type {Config} from './config.ts'
import {completeMedia} from './document.ts'
import {ForwardError} from './errors.ts'
import {graphKey} from './graph.ts'
import type {ForwardDocument,ForwardNode,ForwardPart} from './types.ts'

/**
 * Resolve resource and quote edges for a transport that accepts inline nodes.
 * @param document - unchanged complete graph with original media references.
 * @param config - maxNodes and maxInlineDepth also bound repeated display expansion.
 * @returns detached nodes preserving original part order; unsupported ordinary parts stay explicit for the sender to refuse.
 */
export function materialize(document:ForwardDocument,config:Config):readonly ForwardNode[]{
 completeMedia(document,config)
 const resources=new Map(document.resources.map(value=>[graphKey('resource',value.rootMessageId,value.id),value])),messages=new Map(document.messages.map(value=>[graphKey('message',value.rootMessageId,value.id),value])),result:ForwardNode[]=[]
 type Append=(node:ForwardNode)=>void
 type Work={kind:'edge';type:'resource'|'message';root:MessageId;id:string;depth:number;append:Append}|{kind:'node';root:MessageId;node:ForwardNode;depth:number;append:Append}|{kind:'part';root:MessageId;part:ForwardPart;depth:number;parts:ForwardPart[]}
 const pending:Work[]=[{kind:'edge',type:'resource',root:document.rootMessageId,id:document.resourceId,depth:1,append:node=>result.push(node)}];let count=0
 while(pending.length){
  const work=pending.pop()!
  if(work.kind==='edge'){
   const key=graphKey(work.type,work.root,work.id)
   if(work.type==='resource'){const source=resources.get(key);if(!source)throw new ForwardError('incomplete');for(const node of [...source.nodes].reverse())pending.push({kind:'node',root:work.root,node,depth:work.depth,append:work.append})}
   else{const source=messages.get(key);if(!source?.node||!source.originRootMessageId)throw new ForwardError('incomplete');pending.push({kind:'node',root:source.originRootMessageId,node:source.node,depth:work.depth,append:work.append})}
   continue
  }
  if(work.kind==='part'){
   const {part,parts,root,depth}=work,push=(part:ForwardPart)=>{if(parts.length>=config.maxPartsPerNode)throw new ForwardError('capacity');parts.push(part)},append:Append=node=>push({type:'inline-forward',node})
   if(part.type==='inline-forward')pending.push({kind:'node',root,node:part.node,depth,append})
   else if(part.type==='forward')pending.push({kind:'edge',type:'resource',root,id:part.resourceId,depth,append})
   else if(part.type==='reply')pending.push({kind:'edge',type:'message',root,id:part.messageId,depth,append})
   else push(structuredClone(part))
   continue
  }
  if(work.depth>config.maxInlineDepth||++count>config.maxNodes)throw new ForwardError('capacity')
  if(work.node.referenceMessageId!==undefined){if(work.node.parts.length)throw new ForwardError('invalid');pending.push({kind:'edge',type:'message',root:work.root,id:work.node.referenceMessageId,depth:work.depth,append:work.append});continue}
  const parts:ForwardPart[]=[],{referenceMessageId,...metadata}=work.node,node:ForwardNode={...structuredClone(metadata),parts};work.append(node)
  for(const part of [...work.node.parts].reverse())pending.push({kind:'part',root:work.root,part,depth:work.depth+1,parts})
 }
 return result
}
