/** Neutral forward documents keep the authenticated outer scope separate from displayed sender claims. */
import type {AccountRef,ConversationScope,ForwardId,MessageId,MessagePart,UserId,DeliveryReceipt,AttachmentId} from 'dsh-im-kit'
import type {NativeStoredOriginal} from 'dsh-media-kit/dsh-attachments'
import type {OriginalMedia} from 'dsh-media-kit'
import type {PreparedId} from './data.ts'
export type {PreparedId,PreparedView,ForwardPreview,RuntimeStatus,OriginalView} from './data.ts'
/** Original segments plus inlined forwarded nodes in their original order. */
export type ForwardPart=MessagePart|{readonly type:'inline-forward';readonly node:ForwardNode}
/** Names and user IDs are source claims, never an authenticated caller identity. */
export interface ForwardNode{readonly claimedSender:{readonly id?:UserId;readonly name?:string};readonly sentAt?:number;readonly sourceMessageId?:MessageId;readonly referenceMessageId?:MessageId;readonly parts:readonly ForwardPart[]}
/** The requesting Host binds all four identity dimensions before calling a reader. */
export interface ReadRequest{readonly scope:ConversationScope;readonly rootMessageId:MessageId;readonly resourceId:ForwardId}
/** Partial resolution remains explicit and never authorizes another conversation. */
export type ForwardFailure='invalid'|'capacity'|'busy'|'cancelled'|'closed'|'unavailable'|'not-found'|'permission-denied'|'malformed'|'rejected'|'timeout'|'offline'|'cycle'|'depth'|'ambiguous'|'incomplete'|'conflict'|'storage'|'media-unavailable'|'media-failed'
/** One provider result; the optional raw response is retained as untrusted source data. */
export type ResourceResult={readonly status:'resolved';readonly nodes:readonly ForwardNode[];readonly raw?:unknown}|{readonly status:'failed';readonly code:ForwardFailure}
/** An installed provider may only look up cached messages in the exact authorized scope. */
export interface ForwardProvider{
 readonly account:AccountRef
 /** @param request - authenticated outer envelope and granted resource. @param signal - provider/read lifetime. @returns source nodes without republishing them as new inbound messages. */
 read(request:ReadRequest,signal:AbortSignal):Promise<ResourceResult>
 /** @param scope - exact authorized outer scope. @param id - scoped cached message. @param signal - read lifetime. @returns a source node, or null without a global message lookup. */
 message?(scope:ConversationScope,id:MessageId,signal:AbortSignal):Promise<ForwardNode|null>
 /** @param scope - authorized destination. @param nodes - complete nodes; attached originals are materialized by the caller. @param signal - send lifetime. @returns a classified receipt, with no retry or regeneration. */
 send?(scope:ConversationScope,document:ForwardDocument,originals:readonly {readonly originalId:AttachmentId;readonly original:OriginalMedia}[],signal:AbortSignal):Promise<DeliveryReceipt>
 /** @returns completion after releasing this adapter's owned resources. */
 dispose():Promise<void>
}
/** Resource association is retained even when its body cannot be resolved. */
export interface ForwardResource{readonly rootMessageId:MessageId;readonly id:ForwardId;readonly status:'resolved'|'failed';readonly nodes:readonly ForwardNode[];readonly failure:ForwardFailure|null;readonly raw?:unknown}
/** Quote targets are observed within this document or the authenticated outer conversation. */
export interface ForwardMessage{readonly rootMessageId:MessageId;readonly id:MessageId;readonly originRootMessageId:MessageId|null;readonly status:'resolved'|'failed';readonly node:ForwardNode|null;readonly failure:ForwardFailure|null;readonly source:'document'|'outer-cache'|null}
/** A source is never silently truncated to meet traversal or display limits. */
export interface ForwardProblem{readonly rootMessageId:MessageId;readonly kind:'resource'|'message';readonly id:string;readonly code:ForwardFailure}
/** Complete means every requested resource and reference was resolved within configured traversal bounds. */
export interface ForwardDocument extends ReadRequest{readonly resources:readonly ForwardResource[];readonly messages:readonly ForwardMessage[];readonly problems:readonly ForwardProblem[];readonly complete:boolean;readonly nodeCount:number}
/** Prepared originals are native-storage receipts, never user-supplied backend paths. */
export interface ForwardAsset{readonly originalId:AttachmentId;readonly stored:NativeStoredOriginal}
/** Immutable prepared content remains available after provider or process restart. */
export interface PreparedForward{readonly version:1;readonly id:PreparedId;readonly scope:ConversationScope;readonly operationId:string;readonly requestFingerprint:string;readonly fingerprint:string;readonly document:ForwardDocument;readonly assets:readonly ForwardAsset[];readonly createdAt:number}
