/** Independently mounted forward service; protocol and media providers remain explicit capabilities. */
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from 'dsh-media-kit/im-cordis'
import {Config,validateConfig} from './config.ts'
import {ForwardRuntime} from './runtime.ts'
export {Config,validateConfig,ForwardRuntime}
export {ForwardError} from './errors.ts'
export {renderPreview} from './render.ts'
export {materialize} from './materialize.ts'
export type * from './types.ts'
/** Native runtime identity. */
export const name='qq-forward'
/** Persistence and exact-byte attachments are native Host services. */
export const inject=['storageDomain','attachments']
declare module '@deepseek-ai/cordis'{interface Context{readonly imForward:ForwardRuntime}interface Events{/** @mode emit @param scope - destination with released capacity, or omitted after a provider becomes available. */'qq-forward/capacity'(scope?:import('dsh-im-kit').ConversationScope):void}}
/** @param ctx - dedicated profile capabilities. @param config - explicit capacities, disabled by default. @returns installation after native record recovery, without network or message replay. */
export async function apply(ctx:Context,config:Config):Promise<void>{validateConfig(config);if(!config.enabled)return;const runtime=await ForwardRuntime.open(config,{storage:ctx.storageDomain,attachments:ctx.attachments,media:()=>ctx.get('imMedia'),capacity:scope=>ctx.emit('qq-forward/capacity',scope)});ctx.effect(()=>()=>runtime.close());ctx.effect(()=>ctx.provide('imForward',runtime))}
