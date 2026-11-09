/** Browser-safe owner operations distinguish bounded previews from complete original downloads. */
import type {ConversationScope,AttachmentId} from 'dsh-im-kit'
import type {Settings} from './fields.ts'
import type {PreparedId,PreparedView,ForwardPreview,RuntimeStatus,OriginalView} from './data.ts'
import type {} from '@deepseek-ai/dsh-typert-protocol/types'
/** Saved and applied settings remain independently observable. */
export interface Snapshot{readonly config:Settings;readonly revision:string;readonly appliedRevision:string|null;readonly active:boolean;readonly entryDisabled:boolean;readonly refreshMs:number;readonly downloads:boolean;readonly status:RuntimeStatus|null}
/** Optimistic edit of declared fields only. */
export interface SaveRequest{readonly revision:string;readonly patch:Partial<Settings>}
/** Exact retained scope catalog with explicit omission. */
export interface Catalog{readonly scopes:readonly ConversationScope[];readonly omitted:number}
/** One exact conversation and page offset. */
export interface ListRequest{readonly scope:ConversationScope;readonly offset:number}
/** Body-free retained rows. */
export interface RecordPage{readonly records:readonly PreparedView[];readonly total:number;readonly offset:number;readonly nextOffset:number|null}
/** A prepared ID never authorizes another conversation. */
export interface Selection{readonly scope:ConversationScope;readonly id:PreparedId}
/** Preview limits are explicit; original metadata contains neither native receipts nor source URLs. */
export interface Detail{readonly record:PreparedView;readonly preview:ForwardPreview;readonly originals:readonly OriginalView[];readonly omittedOriginals:number}
/** Exact original selected within a retained scoped record. */
export interface OriginalRequest extends Selection{readonly attachment:AttachmentId}
/** Original metadata paging does not truncate the retained graph. */
export interface OriginalsRequest extends Selection{readonly offset:number}
/** Every retained original can be reached through bounded pages. */
export interface OriginalPage{readonly originals:readonly OriginalView[];readonly total:number;readonly nextOffset:number|null}
/** Native controls expose no private diagnostics. */
export type Failure='forbidden'|'cancelled'|'invalid'|'conflict'|'unavailable'|'busy'|'capacity'|'storage'|'not-found'|'apply-failed'
declare module '@deepseek-ai/dsh-typert-protocol/types'{interface RemoteErrorDetailsMap{/** Owner-safe retained forward management failure. */'qq-forward/control':{readonly reason:Failure}}}
