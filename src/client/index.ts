/** Native bundle page, exact original exports and shell-owned operation feedback. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store'
import type {RemoteResult} from '@deepseek-ai/dsh-typert-protocol/types'
import {remote} from './remote.ts'
import {en,zh,type LocaleKey} from './locales.ts'
import {Page,NoticeHost,PageProblem,type Notice,type NoticeFace,type PageFace} from './page.tsx'
import styles from './style.css'
declare module '@deepseek-ai/dsh-client-ui-slots'{interface LocaleNamespaceMap{/** Retained forward settings and source previews. */qqForward:LocaleKey}}
/** Native Client services own transport, locale and page slots. */
export const inject=['remote','locale','slots']
function unwrap<T>(value:RemoteResult<T>):T{if(value.ok)return value.value;throw new PageProblem(value.error.code==='qq-forward/control'?value.error.details.reason:'unavailable')}
/** @param ctx - native Client scope. @returns completion after strict owner namespace registration. */
export async function apply(ctx:Context):Promise<void>{
 await ctx.remote.$mount(remote);ctx.effect(()=>ctx.locale.register('qqForward',{en,zh}));ctx.effect(()=>{const style=document.createElement('style');style.dataset['qqForward']='true';style.textContent=styles;document.head.append(style);return()=>style.remove()})
 const notice=createSnapshotStore<Notice|null>(null);let serial=0
 ctx.inject(['remote.imForwardControl'],child=>{const api=child.remote.imForwardControl,face:PageFace={read:async()=>unwrap(await api.describe()),save:async request=>unwrap(await api.save(request)),restart:async request=>unwrap(await api.restart(request)),scopes:async()=>unwrap(await api.scopes()),list:async request=>unwrap(await api.list(request)),inspect:async request=>unwrap(await api.inspect(request)),originals:async request=>unwrap(await api.originals(request)),notify:(text,success)=>notice.set({id:++serial,text,success})};child.slots.inject('plugins.bundle.config',()=>child.slots.register({name:'plugins.bundle.config',key:'dsh-qq-forward',locale:'qqForward',inject:()=>face},Page))})
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'qq-forward.notice',inject:():NoticeFace=>({hooks:{notice},dismiss:id=>{if(notice.getSnapshot()?.id===id)notice.set(null)}})},NoticeHost))
}
