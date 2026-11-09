/** Browser-safe owner projections contain no native attachment receipts or backend locations. */
import type {Branded} from '@deepseek-ai/dsh-brand'
import type {ConversationScope,AttachmentId} from 'dsh-im-kit'
/** Durable prepared-output identity; possession alone grants no access. */
export type PreparedId=Branded<'forward.prepared'>
/** Retained scalar metadata for one exact conversation. */
export interface PreparedView{readonly id:PreparedId;readonly scope:ConversationScope;readonly operationId:string;readonly createdAt:number;readonly nodes:number;readonly resources:number;readonly quotes:number;readonly media:number;readonly mediaBytes:number}
/** Preview text and opaque media handles remain separate from original bytes. */
export interface ForwardPreview{readonly text:string;readonly truncated:boolean;readonly media:readonly {readonly kind:string;readonly attachmentId:AttachmentId}[];readonly complete:boolean}
/** Current operation counts include actual cleanup, independently of retained record counts. */
export interface RuntimeStatus{readonly providers:number;readonly reading:number;readonly preparing:number;readonly sending:number;readonly exporting:number;readonly retained:number|null;readonly storageFault:boolean;readonly maintenance:boolean;readonly closed:boolean}
/** Original export metadata excludes native receipts and source locations. */
export interface OriginalView{readonly id:AttachmentId;readonly name:string;readonly mime:string;readonly bytes:number;readonly sha256:string;readonly width?:number;readonly height?:number}
