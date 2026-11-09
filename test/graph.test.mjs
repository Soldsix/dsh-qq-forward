/** Resource traversal preserves envelopes, exact root grants and explicit incomplete outcomes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {Config,renderPreview,materialize} from '../dist/index.js'
import {readGraph} from '../dist/graph.js'
import {completeMedia} from '../dist/document.js'
import {node,request,scope,signal,mid,fid,aid} from './helpers.mjs'
async function read(resources,{messages={},config={},root=request()}={}){
 const reads=[],lookups=[],provider={account:root.scope.account,async read(value){reads.push([value.rootMessageId,value.resourceId]);const found=resources[value.rootMessageId+'/'+value.resourceId]??resources[value.resourceId];return found?{status:'resolved',nodes:found}:{status:'failed',code:'not-found'}},async message(destination,id){lookups.push(id);assert.deepEqual(destination,root.scope);return messages[id]??null},async dispose(){}}
 const document=await readGraph(root,provider,Config(config),work=>work(),signal());return{document,reads,lookups}
}

test('nested forwards, inline nodes and local quotes retain full source order without republishing',async()=>{
 const original=node([{type:'text',text:'first 😀\nsecond line'},{type:'image',attachmentId:aid('image-a')}],{sourceMessageId:mid('inner-a')}),rootNodes=[original,node([{type:'reply',messageId:mid('inner-a')},{type:'forward',resourceId:fid('child')},{type:'inline-forward',node:node([{type:'audio',attachmentId:aid('audio-a')}])}])]
 const {document,reads,lookups}=await read({root:rootNodes,child:[node([{type:'text',text:'child unchanged'}])]})
 assert.equal(document.complete,true);assert.equal(document.nodeCount,4);assert.deepEqual(document.resources[0].nodes,rootNodes);assert.deepEqual(reads,[['outer','root'],['outer','child']]);assert.deepEqual(lookups,[]);assert.equal(document.messages[0].source,'document');assert.equal(document.messages[0].originRootMessageId,'outer');assert.deepEqual([...completeMedia(document,Config({}))],['image-a','audio-a'])
 const preview=renderPreview(document,{maxChars:4096,maxMedia:8});assert.match(preview.text,/first 😀\nsecond line/);assert.match(preview.text,/child unchanged/);assert.deepEqual(preview.media.map(value=>value.attachmentId),['image-a','audio-a']);assert.equal(preview.truncated,false);preview.media[0].attachmentId='mutated';assert.equal(document.resources[0].nodes[0].parts[1].attachmentId,'image-a')
})

test('a quoted outer message grants its child resources under that message root only',async()=>{
 const {document,reads,lookups}=await read({'outer/root':[node([{type:'forward',resourceId:fid('same')},{type:'reply',messageId:mid('quoted')}])],'outer/same':[node([{type:'text',text:'outer result'}])],'quoted/same':[node([{type:'text',text:'quoted result'}])]}, {messages:{quoted:node([{type:'forward',resourceId:fid('same')}],{sourceMessageId:mid('quoted')})}})
 assert.equal(document.complete,true);assert.deepEqual(new Set(reads.map(value=>value.join('/'))),new Set(['outer/root','outer/same','quoted/same']));assert.deepEqual(lookups,['quoted']);assert.equal(document.messages[0].originRootMessageId,'quoted');assert.equal(completeMedia(document,Config({})).size,0);assert.match(renderPreview(document,{maxChars:4096,maxMedia:4}).text,/quoted result/)
})

test('missing resources and unresolved quotes stay explicit and cannot become complete retained output',async()=>{
 const {document}=await read({root:[node([{type:'forward',resourceId:fid('missing')},{type:'reply',messageId:mid('unknown')}])]})
 assert.equal(document.complete,false);assert.deepEqual(new Set(document.problems.map(value=>value.kind)),new Set(['resource','message']));assert.throws(()=>completeMedia(document,Config({})));assert.match(renderPreview(document,{maxChars:4096,maxMedia:4}).text,/unresolved not-found/)
})

test('resource and quote cycles do not recurse or repeat upstream reads',async()=>{
 for(const resources of[{root:[node([{type:'forward',resourceId:fid('child')}])],child:[node([{type:'forward',resourceId:fid('root')}])]},{root:[node([{type:'reply',messageId:mid('self')}],{sourceMessageId:mid('self')})]}]){
  const {document,reads}=await read(resources);assert.equal(document.complete,false);assert.ok(document.problems.some(value=>value.code==='cycle'));assert.equal(new Set(reads.map(value=>value.join('/'))).size,reads.length);assert.match(renderPreview(document,{maxChars:4096,maxMedia:4}).text,/cycle/)
 }
})

test('ambiguous source message IDs never silently select one quoted body',async()=>{
 const {document,lookups}=await read({root:[node([{type:'text',text:'A'}],{sourceMessageId:mid('duplicate')}),node([{type:'text',text:'B'}],{sourceMessageId:mid('duplicate')}),node([{type:'reply',messageId:mid('duplicate')}])]})
 assert.equal(document.complete,false);assert.ok(document.problems.some(value=>value.code==='ambiguous'));assert.equal(lookups.length,0)
})

test('depth and resource budgets do not fetch the refused edges or truncate a resolved body',async()=>{
 const input={root:[node([{type:'text',text:'keep exact text'},{type:'forward',resourceId:fid('child')}])],child:[node()]}
 for(const config of[{maxTraversalDepth:1},{maxResources:1}]){const {document,reads}=await read(input,{config});assert.equal(document.complete,false);assert.deepEqual(reads,[['outer','root']]);assert.equal(document.resources[0].nodes[0].parts[0].text,'keep exact text')}
 await assert.rejects(read({root:[node(),node()]},{config:{maxNodes:1}}),error=>error.code==='capacity')
})

test('the same resource ID under a cached quote retains an independent root grant and its own depth result',async()=>{
 const {document,reads}=await read({root:[node([{type:'forward',resourceId:fid('long-a')},{type:'reply',messageId:mid('short')}])],'long-a':[node([{type:'forward',resourceId:fid('long-b')}])],'long-b':[node([{type:'forward',resourceId:fid('long-c')}])],'long-c':[node([{type:'forward',resourceId:fid('shared')}])],'short/shared':[node([{type:'text',text:'independent quote-root result'}])]}, {config:{maxTraversalDepth:4},messages:{short:node([{type:'forward',resourceId:fid('shared')}])}})
 // The two roots are distinct grants: resolving the quote must not hide the refused original-root edge.
 assert.equal(document.complete,false);assert.ok(document.problems.some(value=>value.rootMessageId==='outer'&&value.id==='shared'&&value.code==='depth'));assert.ok(reads.some(value=>value[0]==='short'&&value[1]==='shared'));assert.equal(new Set(reads.map(value=>value.join('/'))).size,reads.length)
})

test('an internal quote gives a shorter path to descendants without duplicating resource reads',async()=>{
 const {document,reads}=await read({root:[node([{type:'forward',resourceId:fid('long-a')},{type:'reply',messageId:mid('local-short')}])],'long-a':[node([{type:'forward',resourceId:fid('long-b')}])],'long-b':[node([{type:'forward',resourceId:fid('shared')}],{sourceMessageId:mid('local-short')})],shared:[node([{type:'forward',resourceId:fid('leaf')}])],leaf:[node([{type:'text',text:'complete leaf'}])]}, {config:{maxTraversalDepth:4}})
 assert.equal(document.complete,true);assert.equal(completeMedia(document,Config({maxTraversalDepth:4})).size,0);assert.equal(new Set(reads.map(value=>value.join('/'))).size,reads.length);assert.equal(reads.filter(value=>value[1]==='shared').length,1);assert.equal(reads.filter(value=>value[1]==='leaf').length,1)
})

test('preview limits count Unicode code points and mark omission without modifying original content',async()=>{
 const {document}=await read({root:[node([{type:'text',text:'😀'.repeat(30)},{type:'image',attachmentId:aid('first')},{type:'image',attachmentId:aid('second')}])]});const before=structuredClone(document),preview=renderPreview(document,{maxChars:60,maxMedia:1})
 assert.ok(Array.from(preview.text).length<=60);assert.equal(preview.truncated,true);assert.deepEqual(document,before);assert.equal(renderPreview(document,{maxChars:4096,maxMedia:1}).media[0].attachmentId,'first');assert.throws(()=>renderPreview(document,{maxChars:0,maxMedia:1}))
})

test('retained document validation rejects missing, duplicate, unreachable and forged quote nodes',async()=>{
 const {document}=await read({root:[node([{type:'reply',messageId:mid('local')}]),node([{type:'text',text:'source'}],{sourceMessageId:mid('local')})]});assert.equal(completeMedia(document,Config({})).size,0)
 for(const change of[value=>{value.resources=[]},value=>{value.resources.push(value.resources[0])},value=>{value.resources.push({...value.resources[0],id:'unreachable'})},value=>{value.nodeCount++},value=>{value.messages[0].node.parts=[{type:'text',text:'forged quote'}]},value=>{value.messages[0].originRootMessageId='foreign'}]){const edited=structuredClone(document);change(edited);assert.throws(()=>completeMedia(edited,Config({})))}
})

test('transport materialization retains nested resource and quoted body positions while leaving sources unchanged',async()=>{
 const {document}=await read({root:[node([{type:'text',text:'before'},{type:'reply',messageId:mid('quoted')},{type:'text',text:'middle'},{type:'forward',resourceId:fid('child')},{type:'text',text:'after'}])],child:[node([{type:'image',attachmentId:aid('one')}]),node([{type:'text',text:'second child'}])]}, {messages:{quoted:node([{type:'text',text:'exact quote'}])}}),before=structuredClone(document),output=materialize(document,Config({}))
 assert.deepEqual(output[0].parts.map(value=>value.type),['text','inline-forward','text','inline-forward','inline-forward','text']);assert.equal(output[0].parts[1].node.parts[0].text,'exact quote');assert.equal(output[0].parts[3].node.parts[0].attachmentId,'one');assert.equal(output[0].parts[4].node.parts[0].text,'second child');output[0].parts[0].text='caller edit';assert.deepEqual(document,before)
})

test('repeated graph references are bounded during display expansion rather than silently discarded',async()=>{
 const {document}=await read({root:[node([{type:'forward',resourceId:fid('child')},{type:'forward',resourceId:fid('child')}])],child:[node(),node()]});assert.equal(document.nodeCount,3);assert.throws(()=>materialize(document,Config({maxNodes:4})),error=>error.code==='capacity');assert.equal(materialize(document,Config({}))[0].parts.length,4)
})
