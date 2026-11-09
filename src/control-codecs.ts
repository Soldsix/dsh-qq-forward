/** Strict JSON parsing protects both native Host methods and browser state. */
import * as z from 'zod/mini'
import type {ConversationScope,AttachmentId} from 'dsh-im-kit'
import type {Settings} from './fields.ts'
import type {PreparedId,PreparedView,RuntimeStatus,OriginalView} from './data.ts'
import type {Snapshot,SaveRequest,Catalog,ListRequest,RecordPage,Selection,Detail,OriginalRequest,OriginalsRequest,OriginalPage} from './control-types.ts'
const text=z.string().check(z.minLength(1),z.maxLength(256)),integer=z.int().check(z.minimum(0)),revision=z.string().check(z.regex(/^[a-f0-9]{64}$/)),id=z.pipe(z.string().check(z.regex(/^fw-[a-f0-9]{64}$/)),z.transform(value=>value as PreparedId)),attachment=z.pipe(text,z.transform(value=>value as AttachmentId))
const scope=z.pipe(z.strictObject({account:z.strictObject({tenantId:text,networkId:text,accountId:text}),kind:z.enum(['group','private']),peerId:text}),z.transform(value=>value as ConversationScope))
const config=z.strictObject({enabled:z.boolean(),namespace:z.string(),maxConcurrentReads:z.int(),maxProviderCalls:z.int(),readTimeoutMs:z.int(),prepareTimeoutMs:z.int(),maxTraversalDepth:z.int(),maxInlineDepth:z.int(),maxMessages:z.int(),maxResources:z.int(),maxNodes:z.int(),maxPartsPerNode:z.int(),maxTextChars:z.int(),maxDocumentBytes:z.int(),maxPrepared:z.int(),maxRecordBytes:z.int(),maxRetainedBytes:z.int(),maxPendingMutations:z.int(),maxConcurrentPrepares:z.int(),maxConcurrentSends:z.int(),maxAssets:z.int(),maxMediaItemBytes:z.int(),maxMediaBytes:z.int(),mediaChunkBytes:z.int(),maxMediaDimension:z.int(),maxMediaPixels:z.int(),allowedMediaMimeTypes:z.string()} satisfies {[K in keyof Settings]:z.ZodMiniType<Settings[K]>})
const status:z.ZodMiniType<RuntimeStatus>=z.strictObject({providers:integer,reading:integer,preparing:integer,sending:integer,exporting:integer,retained:z.nullable(integer),storageFault:z.boolean(),maintenance:z.boolean(),closed:z.boolean()})
const record:z.ZodMiniType<PreparedView>=z.strictObject({id,scope,operationId:text,createdAt:integer,nodes:integer,resources:integer,quotes:integer,media:integer,mediaBytes:integer})
const original:z.ZodMiniType<OriginalView>=z.pipe(z.strictObject({id:attachment,name:text,mime:text,bytes:integer,sha256:revision,width:z.optional(integer),height:z.optional(integer)}),z.transform(value=>({id:value.id,name:value.name,mime:value.mime,bytes:value.bytes,sha256:value.sha256,...value.width===undefined?{}:{width:value.width},...value.height===undefined?{}:{height:value.height}})))
/** Only known fields enter a native saved edit. */
export const saveSchema:z.ZodMiniType<SaveRequest>=z.strictObject({revision,patch:z.pipe(z.partial(config),z.transform(value=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined)) as Partial<Settings>))})
/** Native runtime observations never contain attachment receipts. */
export const snapshotSchema:z.ZodMiniType<Snapshot>=z.strictObject({config,revision,appliedRevision:z.nullable(revision),active:z.boolean(),entryDisabled:z.boolean(),refreshMs:integer,downloads:z.boolean(),status:z.nullable(status)})
/** An explicit restart requires the observed settings revision. */
export const revisionSchema=z.strictObject({revision})
/** Scope catalogs are bounded by the owning controller. */
export const catalogSchema:z.ZodMiniType<Catalog>=z.strictObject({scopes:z.array(scope),omitted:integer})
/** A page request carries the complete destination. */
export const listSchema:z.ZodMiniType<ListRequest>=z.strictObject({scope,offset:integer})
/** Every page reports total size and its next offset. */
export const pageSchema:z.ZodMiniType<RecordPage>=z.strictObject({records:z.array(record),total:integer,offset:integer,nextOffset:z.nullable(integer)})
/** Retained record lookup cannot select filesystem paths. */
export const selectionSchema:z.ZodMiniType<Selection>=z.strictObject({scope,id})
/** The text is an explicitly bounded preview; original downloads remain complete. */
export const detailSchema:z.ZodMiniType<Detail>=z.strictObject({record,preview:z.strictObject({text:z.string(),truncated:z.boolean(),complete:z.boolean(),media:z.array(z.strictObject({kind:text,attachmentId:attachment}))}),originals:z.array(original),omittedOriginals:integer})
/** Original exports require an opaque handle inside an exact retained record. */
export const originalSchema:z.ZodMiniType<OriginalRequest>=z.strictObject({scope,id,attachment})
/** Original metadata lookup carries both the retained record and exact offset. */
export const originalsSchema:z.ZodMiniType<OriginalsRequest>=z.strictObject({scope,id,offset:integer})
/** Bounded original pages retain access to every remaining handle. */
export const originalPageSchema:z.ZodMiniType<OriginalPage>=z.strictObject({originals:z.array(original),total:integer,nextOffset:z.nullable(integer)})
