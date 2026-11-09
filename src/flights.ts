/** Exact-key sharing retains actual cleanup and never cancels another waiter's work. */
import {ForwardError} from './errors.ts'
interface Flight<T>{readonly fingerprint:string;readonly owner:string;readonly controller:AbortController;readonly done:Promise<T>;waiters:number}
/** Bounded operations are owned by their registration or the runtime, not by the first caller. */
export class Flights<T>{
 private readonly active=new Map<string,Flight<T>>()
 private readonly lifetime=new AbortController()
 private stopping:Promise<void>|undefined
 /** @param maximum - explicit simultaneous-operation capacity. */
 constructor(private readonly maximum:number){}
 /** @returns currently owned operations, including cleanup after cancellation. */
 get size():number{return this.active.size}
 /** @param key - exact scoped identity. @param fingerprint - immutable input identity. @param owner - registration identity. @param signal - one caller's lifetime. @param work - abort-compliant owner operation. @returns the same result without a duplicate call; cancellation joins the last owner's work. */
 async run(key:string,fingerprint:string,owner:string,signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(this.lifetime.signal.aborted)throw new ForwardError('closed');if(signal.aborted)throw new ForwardError('cancelled')
  let flight=this.active.get(key)
  if(flight&&flight.fingerprint!==fingerprint)throw new ForwardError('conflict')
  if(!flight){
   if(this.active.size>=this.maximum)throw new ForwardError('capacity')
   const controller=new AbortController(),done=Promise.resolve().then(()=>{if(controller.signal.aborted)throw new ForwardError('cancelled');return work(AbortSignal.any([controller.signal,this.lifetime.signal]))});flight={fingerprint,owner,controller,done,waiters:0};const created=flight;this.active.set(key,flight)
   const finish=()=>{if(this.active.get(key)===created)this.active.delete(key)};void done.then(finish,finish)
  }
  flight.waiters++
  try{return await new Promise<T>((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(new ForwardError('cancelled'))};signal.addEventListener('abort',abort,{once:true});void flight.done.then(value=>{signal.removeEventListener('abort',abort);resolve(value)},error=>{signal.removeEventListener('abort',abort);reject(error)})})}
  finally{if(--flight.waiters===0){flight.controller.abort();await Promise.allSettled([flight.done])}}
 }
 /** @param owner - exact registration identity. @returns after cancelling and joining its operations. */
 async closeOwner(owner:string):Promise<void>{const work=[...this.active.values()].filter(value=>value.owner===owner);for(const flight of work)flight.controller.abort();await Promise.allSettled(work.map(value=>value.done))}
 /** @returns completion after cancelling and joining every owned operation. */
 close():Promise<void>{if(this.stopping)return this.stopping;this.lifetime.abort();return this.stopping=(async()=>{for(const flight of this.active.values())flight.controller.abort();await Promise.allSettled([...this.active.values()].map(value=>value.done))})()}
}
