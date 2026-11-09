/** Optional durable queue adapter carries retained forward IDs without copying source bodies. */
import type {Context} from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {z as json} from 'zod'
import {identifier} from 'dsh-im-kit'
import {providerId,outputId,type JobDeliveryService,type TaskId,type TaskProducer} from 'dsh-job-delivery'
import type {ForwardRuntime} from './runtime.ts'
import {scopeSchema,preparedIdSchema} from './wire.ts'
import {ForwardError} from './errors.ts'
import type {} from './index.ts'

/** Explicit producer identity and capacity; no queue or sender is created by this adapter. */
export const Config=z.object({enabled:z.boolean().default(false),provider:z.string().default('qq-forward-prepared'),maxConcurrent:z.number().min(1).max(128).step(1).default(8)})
/** Resolved optional adapter settings. */
export type Config=ReturnType<typeof Config>
const requestSchema=json.strictObject({scope:scopeSchema,actorId:json.string().min(1).max(256).transform(value=>identifier('im.user',value)),operationId:json.string().min(1).max(256).transform(value=>identifier('im.operation',value)),preparedId:preparedIdSchema})
const payloadSchema=json.strictObject({preparedId:preparedIdSchema})
/** Authenticated Host consumers submit an already retained artifact to the shared queue. */
export class PreparedForwardJobs{
 /** @param core - selected retained-document owner. @param queue - existing durable delivery service. @param config - declared producer identity and capacity. */
 constructor(private readonly core:ForwardRuntime,private readonly queue:JobDeliveryService,private readonly config:Config){providerId(config.provider)}
 /** @returns a producer that checkpoints one stable forward output before completing. */
 producer():TaskProducer{return{id:providerId(this.config.provider),maxConcurrent:this.config.maxConcurrent,run:async(request,context)=>{let payload;try{payload=payloadSchema.parse(request.payload)}catch(error){throw new ForwardError('invalid')}this.core.inspect(request.scope,payload.preparedId);if(context.signal.aborted)throw new ForwardError('cancelled');await context.checkpoint(outputId('prepared'),[{type:'forward',resourceId:identifier('im.forward',payload.preparedId)}])}}}
 /** @param value - exact scope, actor, stable operation and prepared ID. @param signal - admission lifetime only. @returns durable task identity and replay status; unknown send outcomes are not automatically retried. */
 async submit(value:unknown,signal:AbortSignal):Promise<{readonly id:TaskId;readonly replayed:boolean}>{let request;try{request=requestSchema.parse(value)}catch(error){throw new ForwardError('invalid')}this.core.inspect(request.scope,request.preparedId);return this.queue.submit({scope:request.scope,actorId:request.actorId,operationId:request.operationId,provider:providerId(this.config.provider),payload:{preparedId:request.preparedId}},signal)}
}
/** Native optional adapter identity. */
export const name='qq-forward-job-delivery'
/** Explicit capabilities are required only when this entry is selected. */
export const inject=['imForward','jobDelivery']
declare module '@deepseek-ai/cordis'{interface Context{readonly imForwardJobs:PreparedForwardJobs}}
/** @param ctx - profile's retained forward and durable queue services. @param config - disabled-by-default producer settings. */
export function apply(ctx:Context,config:Config):void{providerId(config.provider);if(!config.enabled)return;const service=new PreparedForwardJobs(ctx.imForward,ctx.jobDelivery,config);ctx.effect(()=>ctx.jobDelivery.register(service.producer()));ctx.effect(()=>ctx.provide('imForwardJobs',service));ctx.on('qq-forward/capacity',scope=>ctx.jobDelivery.wake(scope))}
