/** Bounded readable previews retain explicit graph boundaries and never alter the original document. */
import type {MessageId,AttachmentId} from 'dsh-im-kit'
import type {ForwardDocument,ForwardPreview,ForwardNode} from './types.ts'
import {graphKey} from './graph.ts'
import {ForwardError} from './errors.ts'
/** @param document - retained unchanged source graph. @param limits - explicit code-point and media-list limits. @returns a marked preview plus scoped media handles; no network calls occur. */
export function renderPreview(document:ForwardDocument,limits:{readonly maxChars:number;readonly maxMedia:number}):ForwardPreview{
 if(!Number.isSafeInteger(limits.maxChars)||limits.maxChars<1||!Number.isSafeInteger(limits.maxMedia)||limits.maxMedia<1)throw new ForwardError('invalid')
 const resources=new Map(document.resources.map(value=>[graphKey('resource',value.rootMessageId,value.id),value])),messages=new Map(document.messages.map(value=>[graphKey('message',value.rootMessageId,value.id),value])),media=new Map<AttachmentId,{kind:string;attachmentId:AttachmentId}>()
 type Token={kind:'text';text:string}|{kind:'media';type:string;attachmentId:AttachmentId}|{kind:'node';node:ForwardNode;root:MessageId;path:ReadonlySet<string>}|{kind:'edge';type:'resource'|'message';id:string;root:MessageId;path:ReadonlySet<string>}
 const work:Token[]=[{kind:'edge',type:'resource',id:document.resourceId,root:document.rootMessageId,path:new Set()}];let text='',count=0,truncated=false
 const append=(value:string)=>{const chars=Array.from(value),remaining=limits.maxChars-count;text+=chars.slice(0,remaining).join('');count+=Math.min(chars.length,remaining);if(chars.length>remaining)truncated=true}
 while(work.length&&count<limits.maxChars){const token=work.pop()!;if(token.kind==='text'){append(token.text);continue}if(token.kind==='media'){if(media.size<limits.maxMedia||media.has(token.attachmentId))media.set(token.attachmentId,{kind:token.type,attachmentId:token.attachmentId});else truncated=true;append('['+token.type+' '+token.attachmentId+']\n');continue}
  if(token.kind==='edge'){const key=graphKey(token.type,token.root,token.id);if(token.path.has(key)){append('[cycle]\n');continue}const path=new Set([...token.path,key]);if(token.type==='resource'){const source=resources.get(key);append('[forward '+token.id+']\n');if(source?.status==='resolved')for(const node of [...source.nodes].reverse())work.push({kind:'node',node,root:token.root,path});else append('[unresolved '+(source?.failure??'not-found')+']\n')}else{const source=messages.get(key);append('[reply '+token.id+']\n');if(source?.node&&source.originRootMessageId)work.push({kind:'node',node:source.node,root:source.originRootMessageId,path});else append('[unresolved '+(source?.failure??'not-found')+']\n')}continue}
  const {node,root,path}=token;append('[claimed '+(node.claimedSender.name??node.claimedSender.id??'unknown')+']\n')
  if(node.referenceMessageId!==undefined)work.push({kind:'edge',type:'message',id:node.referenceMessageId,root,path})
  for(const part of [...node.parts].reverse())switch(part.type){
   case'text':work.push({kind:'text',text:part.text+'\n'});break
   case'inline-forward':work.push({kind:'node',node:part.node,root,path});break
   case'forward':work.push({kind:'edge',type:'resource',id:part.resourceId,root,path});break
   case'reply':work.push({kind:'edge',type:'message',id:part.messageId,root,path});break
   case'image':case'audio':case'video':case'file':work.push({kind:'media',type:part.type,attachmentId:part.attachmentId});break
   case'mention':work.push({kind:'text',text:'[mention '+part.userId+']\n'});break
   case'card':work.push({kind:'text',text:'['+part.format+'] '+part.content+'\n'});break
   case'unsupported':work.push({kind:'text',text:'[unsupported '+part.segmentType+']\n'});break
   default:{const unreachable:never=part;throw new Error(String(unreachable))}
  }
 }
 return{text,truncated:truncated||work.length>0,media:[...media.values()],complete:document.complete}
}
