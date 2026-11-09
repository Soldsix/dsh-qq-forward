/** Synthetic retained graphs populate the real native owner page without live destinations or models. */
import {writeFile,rename} from 'node:fs/promises'
import {identifier,sameScope} from 'dsh-im-kit'
import {ImMediaRuntime} from 'dsh-media-kit/im'
import {inspectOriginal,resolveInspection,mediaProvider,mediaSource} from 'dsh-media-kit'
export const name='synthetic-forward-web-fixture'
export const inject=['imForward']
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1UAAAAASUVORK5CYII=','base64'),gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'),html=Buffer.from('<!doctype html><h1>complete synthetic original</h1>')
export async function apply(ctx,config){
 const scope={account:{tenantId:identifier('im.tenant','synthetic-web'),networkId:identifier('im.network','fixture'),accountId:identifier('im.account','90000001')},kind:'group',peerId:identifier('im.peer','web-room')},media=new ImMediaRuntime({maxProviders:1,maxPendingPerProvider:4}),signal=new AbortController().signal,originals=new Map()
 for(const[id,bytes,name,mime]of[['web-png',png,'unmodified.png',undefined],['web-gif',gif,'unmodified.gif',undefined],['web-html',html,'unmodified.html','text/html']])originals.set(identifier('im.attachment',id),await inspectOriginal(resolveInspection({maxBytes:1048576,maxDetectorBuffer:1048576,maxWidth:8192,maxHeight:8192,maxPixels:16777216,allowedMimeTypes:['image/png','image/gif','text/html']}),{bytes,fileName:name,source:{provider:mediaProvider('web-fixture'),id:mediaSource(id),kind:'fixture'},...mime?{textMime:mime}:{}},signal))
 ctx.effect(()=>()=>media.close());ctx.effect(()=>ctx.provide('imMedia',media));ctx.effect(()=>media.register({account:scope.account,async read(target,id){if(!sameScope(scope,target)||!originals.has(id))throw Error('Synthetic source denied');return originals.get(id)},async store(){throw Error('No fixture write')},async dispose(){}}))
 ctx.plugin({name:'synthetic-forward-web-seed',inject:['imForward','imMedia'],async apply(child){
  const sender={id:identifier('im.user','90000002'),name:'Synthetic source'},first=await child.imForward.prepare({scope,operationId:'ui-visual',input:{kind:'generated',nodes:[{claimedSender:sender,sourceMessageId:'web-message',parts:[{type:'text',text:'EXACT_SOURCE <script>not executable</script>'},{type:'image',attachmentId:'web-png'}]},{claimedSender:sender,parts:[{type:'reply',messageId:'web-message'},{type:'inline-forward',node:{claimedSender:sender,parts:[{type:'image',attachmentId:'web-gif'},{type:'file',attachmentId:'web-html',name:'unmodified.html'}]}}]}]}},signal)
  await child.imForward.prepare({scope,operationId:'ui-latest',input:{kind:'generated',nodes:[{claimedSender:sender,parts:[{type:'text',text:'SECOND_RECORD'}]}]}},signal);await child.imForward.prepare({scope:{...scope,peerId:'web-other-room'},operationId:'ui-other',input:{kind:'generated',nodes:[{claimedSender:sender,parts:[{type:'text',text:'OTHER_CONVERSATION_SOURCE'}]}]}},signal)
  const record={scope,id:first.id,originals:[...originals].map(([id,value])=>({id,sha256:value.descriptor.sha256,bytes:value.descriptor.byteLength,mime:value.descriptor.mime})),replayed:first.replayed};await writeFile(config.resultPath+'.tmp',JSON.stringify(record,null,2)+'\n');await rename(config.resultPath+'.tmp',config.resultPath)
 }})
}
