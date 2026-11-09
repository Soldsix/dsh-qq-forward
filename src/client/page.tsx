/** Native settings retain drafts through polling, failed validation and transactional reloads. */
import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {Button,Input,Switch,Toast} from '@deepseek-ai/dsh-client-ui-primitives'
import type {HostObservable,InjectFace,PropsLocale,PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {FIELDS,type Settings,type Field} from '../fields.ts'
import type {Snapshot,SaveRequest,Failure} from '../control-types.ts'
import {Records,type RecordFace} from './records.tsx'
/** Stable native failure without backend response text. */
export class PageProblem extends Error{constructor(readonly reason:Failure){super(reason)}}
/** Native settings and retained-record operations. */
export interface PageFace extends RecordFace{readonly read:()=>Promise<Snapshot>;readonly save:(request:SaveRequest)=>Promise<Snapshot>;readonly restart:(request:{revision:string})=>Promise<Snapshot>;readonly notify:(text:string,success:boolean)=>void}
/** App-wide transient result. */
export interface Notice{readonly id:number;readonly text:string;readonly success:boolean}
/** Toast state outlives the reporting page. */
export interface NoticeFace{readonly hooks:{readonly notice:HostObservable<Notice|null>};readonly dismiss:(id:number)=>void}
/** @param props - native shell notification subscription. @returns a toast that survives page closure. */
export function NoticeHost({useNotice,dismiss}:InjectFace<NoticeFace>):ReactNode{const value=useNotice(item=>item);return value?<Toast key={value.id} text={value.text} {...value.success?{tone:'success' as const}:{}} onDone={()=>dismiss(value.id)}/>:null}
/** @param props - native plugin slot and locale. @returns the complete configuration page. */
export function Page({view,...props}:PropsRuntime<'plugins.bundle.config'>&PropsLocale<'qqForward'>&PageFace):ReactNode{return view==='page'?<Form {...props}/>:null}
function Form({t,...face}:PropsLocale<'qqForward'>&PageFace):ReactNode{
 const id=useId(),alive=useRef(true),editing=useRef(false),writing=useRef(false),sequence=useRef(0),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[baseline,setBaseline]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Partial<Record<Field,string|boolean>>>({}),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0)
 const dirty=Object.keys(draft).length>0;editing.current=dirty
 function accept(value:Snapshot,reset:boolean){setSnapshot(value);if(reset||!editing.current&&!writing.current){setBaseline(value);setDraft({})}}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++}},[])
 useEffect(()=>{let current=true,timer:ReturnType<typeof setTimeout>|undefined;const poll=async()=>{const turn=++sequence.current;try{const value=await face.read();if(current&&turn===sequence.current){accept(value,false);setFailed(false)}if(current)timer=setTimeout(()=>{void poll()},value.refreshMs)}catch(error){if(current&&turn===sequence.current)setFailed(true)}};void poll();return()=>{current=false;sequence.current++;clearTimeout(timer)}},[face.read,refresh])
 async function submit(restart:boolean):Promise<void>{
  if(!baseline||writing.current||!restart&&!dirty)return;const patch:Partial<Settings>={}
  for(const key of Object.keys(FIELDS) as Field[]){const raw=draft[key];if(raw===undefined)continue;if(key==='enabled'){if(typeof raw!=='boolean'){face.notify(t('invalid'),false);return}patch.enabled=raw}else if(key==='namespace'||key==='allowedMediaMimeTypes'){if(typeof raw!=='string'){face.notify(t('invalid'),false);return}patch[key]=raw}else{if(typeof raw!=='string'||!/^\d+$/.test(raw.trim())||!Number.isSafeInteger(Number(raw))){face.notify(t('invalid'),false);return}patch[key]=Number(raw)}}
  writing.current=true;sequence.current++;setBusy(true)
  try{const value=await(restart?face.restart({revision:baseline.revision}):face.save({revision:baseline.revision,patch}));face.notify(t(restart?'restarted':'saved'),true);if(alive.current){accept(value,true);setRefresh(value=>value+1)}}catch(error){face.notify(error instanceof PageProblem?t(error.reason):t('unavailable'),false)}finally{writing.current=false;if(alive.current)setBusy(false)}
 }
 if(!snapshot||!baseline)return<section className="qforward-page">{failed?<div role="alert"><p>{t('load')}</p><Button onClick={()=>setRefresh(value=>value+1)}>{t('refresh')}</Button></div>:<span className="qforward-spinner" role="status" aria-label={t('loading')}/>}</section>
 const field=(key:Exclude<Field,'enabled'>)=><div className="qforward-field" key={key}><label htmlFor={`${id}-${key}`}>{t(key)}</label><Input id={`${id}-${key}`} type={FIELDS[key]==='number'?'number':'text'} disabled={busy} value={String(draft[key]??baseline.config[key])} onChange={event=>{const next=event.currentTarget.value;setDraft(value=>({...value,[key]:next}))}}/></div>,advanced=(Object.keys(FIELDS) as Field[]).filter((key):key is Exclude<Field,'enabled'|'namespace'|'maxConcurrentReads'|'maxConcurrentSends'>=>!['enabled','namespace','maxConcurrentReads','maxConcurrentSends'].includes(key))
 return<section className="qforward-page"><p className="qforward-help">{t('intro')}</p><div className="qforward-summary" aria-live="polite"><span>{t(snapshot.active?'active':'inactive')}</span>{snapshot.status&&<><span>{t('retained')}: {snapshot.status.retained??'—'}</span><span>{t('providers')}: {snapshot.status.providers}</span><span>{t('reading')}: {snapshot.status.reading}</span><span>{t('preparing')}: {snapshot.status.preparing}</span><span>{t('sending')}: {snapshot.status.sending}</span><span>{t('exporting')}: {snapshot.status.exporting}</span></>}</div>{snapshot.entryDisabled&&<p>{t('entryDisabled')}</p>}{snapshot.status?.storageFault&&<p role="alert">{t('faulted')}</p>}<div className="qforward-warning" role={failed?'alert':undefined}>{failed?t('load'):null}</div><form onSubmit={event=>{event.preventDefault();void submit(false)}}><h3>{t('settings')}</h3><div className="qforward-field"><span>{t('enabled')}</span><Switch label={t('enabled')} disabled={busy} checked={(draft.enabled??baseline.config.enabled)===true} onChange={value=>setDraft(previous=>({...previous,enabled:value}))}/></div>{field('namespace')}{field('maxConcurrentReads')}{field('maxConcurrentSends')}<details><summary>{t('advanced')}</summary><div className="qforward-fields">{advanced.map(field)}</div></details><p className="qforward-help">{t('reloadHelp')}</p>{dirty&&<p role="status">{t(snapshot.revision===baseline.revision?'dirty':'stale')}</p>}<div className="qforward-actions"><Button type="submit" variant="primary" disabled={busy||!dirty}>{t('save')}</Button><Button type="button" disabled={busy||!dirty} onClick={()=>accept(snapshot,true)}>{t('discard')}</Button><Button type="button" disabled={busy||dirty} onClick={()=>{void submit(true)}}>{t('restart')}</Button><Button type="button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>{t('refresh')}</Button></div></form><Records {...face} t={t} active={snapshot.active} downloads={snapshot.downloads} refreshMs={snapshot.refreshMs}/></section>
}
