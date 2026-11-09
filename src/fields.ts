/** Browser-safe settings and field inventory share no Host runtime imports. */
export interface Settings{
 enabled:boolean;namespace:string;maxConcurrentReads:number;maxProviderCalls:number;readTimeoutMs:number;prepareTimeoutMs:number
 maxTraversalDepth:number;maxInlineDepth:number;maxMessages:number;maxResources:number;maxNodes:number;maxPartsPerNode:number;maxTextChars:number;maxDocumentBytes:number
 maxPrepared:number;maxRecordBytes:number;maxRetainedBytes:number;maxPendingMutations:number;maxConcurrentPrepares:number;maxConcurrentSends:number
 maxAssets:number;maxMediaItemBytes:number;maxMediaBytes:number;mediaChunkBytes:number;maxMediaDimension:number;maxMediaPixels:number;allowedMediaMimeTypes:string
}
/** Every deployment field has a native form control; validation remains with the Host schema. */
export const FIELDS={enabled:'boolean',namespace:'string',maxConcurrentReads:'number',maxProviderCalls:'number',readTimeoutMs:'number',prepareTimeoutMs:'number',maxTraversalDepth:'number',maxInlineDepth:'number',maxMessages:'number',maxResources:'number',maxNodes:'number',maxPartsPerNode:'number',maxTextChars:'number',maxDocumentBytes:'number',maxPrepared:'number',maxRecordBytes:'number',maxRetainedBytes:'number',maxPendingMutations:'number',maxConcurrentPrepares:'number',maxConcurrentSends:'number',maxAssets:'number',maxMediaItemBytes:'number',maxMediaBytes:'number',mediaChunkBytes:'number',maxMediaDimension:'number',maxMediaPixels:'number',allowedMediaMimeTypes:'string'} as const satisfies Record<keyof Settings,'boolean'|'string'|'number'>
/** Editable field identity. */
export type Field=keyof Settings
