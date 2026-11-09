/** One native domain retains prepared documents without deleting or replaying them. */
import {defineDomain,domainTable,type DomainFacility,type Domain,type KvTable} from '@deepseek-ai/dsh-storage-domain'
import type {Config} from './config.ts'
import type {PreparedForward,PreparedId} from './types.ts'
import {recordSchema} from './wire.ts'
import {ForwardError} from './errors.ts'
function definition(config:Config){return defineDomain({name:config.namespace,version:1,layout:'single' as const,tables:{prepared:domainTable<PreparedId,PreparedForward>(recordSchema(config))}})}
type PreparedDomain=Domain<ReturnType<typeof definition>>
/** Bounded serialized persistence never holds the mutation queue during network or media IO. */
export class PreparedStore{
 private readonly table:KvTable<PreparedId,PreparedForward>
 private tail:Promise<void>=Promise.resolve()
 private pending=0
 private bytes=0
 private closed=false
 private fault=false
 private stopping:Promise<void>|undefined
 private constructor(private readonly config:Config,private readonly domain:PreparedDomain){this.table=domain.table('prepared')}
 /** @param config - parsed storage limits. @param facility - native domain service. @returns retained records after strict schema and capacity checks. */
 static async open(config:Config,facility:DomainFacility):Promise<PreparedStore>{let domain:PreparedDomain;try{domain=await facility.open(definition(config))}catch(error){throw new ForwardError('storage')}const store=new PreparedStore(config,domain);try{if(store.table.size>config.maxPrepared)throw new ForwardError('capacity');for(const [id,value]of store.table.entries()){if(id!==value.id)throw new ForwardError('invalid');store.bytes+=Buffer.byteLength(JSON.stringify(value))}if(store.bytes>config.maxRetainedBytes)throw new ForwardError('capacity');return store}catch(error){await domain.close();throw error instanceof ForwardError?error:new ForwardError('storage')}}
 /** @returns current fault state without document bodies or paths. */
 status():{readonly retained:number|null;readonly pending:number;readonly bytes:number;readonly fault:boolean}{if(this.fault)return{retained:null,pending:this.pending,bytes:this.bytes,fault:true};try{return{retained:this.table.size,pending:this.pending,bytes:this.bytes,fault:false}}catch(error){this.fault=true;return{retained:null,pending:this.pending,bytes:this.bytes,fault:true}}}
 /** @param id - retained prepared identity. @returns immutable native-domain snapshot, or undefined. */
 get(id:PreparedId):PreparedForward|undefined{if(this.closed)throw new ForwardError('closed');if(this.fault)throw new ForwardError('storage');try{return this.table.get(id)}catch(error){this.fault=true;throw new ForwardError('storage')}}
 /** @param value - complete content after media originals were stored. @returns durable admission or an unchanged identical existing operation. */
 admit(value:PreparedForward):Promise<{readonly value:PreparedForward;readonly replayed:boolean}>{
  if(this.closed||this.stopping)return Promise.reject(new ForwardError('closed'));if(this.fault)return Promise.reject(new ForwardError('storage'));if(this.pending>=this.config.maxPendingMutations)return Promise.reject(new ForwardError('capacity'));this.pending++
  const done=this.tail.then(async()=>{const existing=this.get(value.id);if(existing){if(existing.fingerprint!==value.fingerprint||existing.requestFingerprint!==value.requestFingerprint)throw new ForwardError('conflict');return{value:existing,replayed:true}}if(Buffer.byteLength(JSON.stringify(value))>this.config.maxRecordBytes)throw new ForwardError('capacity');let parsed:PreparedForward;try{parsed=recordSchema(this.config).parse(value)}catch(error){throw new ForwardError('invalid')}const bytes=Buffer.byteLength(JSON.stringify(parsed));if(this.table.size>=this.config.maxPrepared||this.bytes+bytes>this.config.maxRetainedBytes)throw new ForwardError('capacity');try{await this.table.put(parsed.id,parsed)}catch(error){this.fault=true;throw new ForwardError('storage')}this.bytes+=bytes;return{value:parsed,replayed:false}})
  this.tail=done.then(()=>{this.pending--},()=>{this.pending--});return done
 }
 /** @returns completion after admitted mutations and domain ownership release. */
 close():Promise<void>{if(this.stopping)return this.stopping;return this.stopping=(async()=>{await this.tail;this.closed=true;await this.domain.close()})()}
}
