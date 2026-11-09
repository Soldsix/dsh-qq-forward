/** Actual native records and attachment streams survive restart without repeating preparation or send. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {Config,ForwardRuntime,ForwardError} from '../dist/index.js'
import {parseNodes,recordSchema,fingerprint} from '../dist/wire.js'
import {Flights} from '../dist/flights.js'
import {setup,mediaFixture,node,request,scope,signal,mid,fid,aid,deferred,original,png,gif} from './helpers.mjs'
const options={timeout:30000}
const generated=(operationId='op-a',nodes=[node()],destination=scope())=>({scope:destination,operationId,input:{kind:'generated',nodes}})
const accepted={status:'accepted',messageIds:['synthetic-receipt']}

test('native preparation retains exact PNG/GIF bytes across restart and ignores stale source availability',options,async t=>{
 const f=await setup(t),entries=new Map([[aid('png'),await original(png)],[aid('gif'),await original(gif,'animation.gif')]]),source=mediaFixture(f,entries),input=generated('originals',[node([{type:'image',attachmentId:aid('png')},{type:'image',attachmentId:aid('gif')},{type:'image',attachmentId:aid('png')}])]),prepared=await f.runtime.prepare(input,signal())
 assert.equal(prepared.replayed,false);assert.equal(source.reads,2);const stored=f.runtime.inspect(scope(),prepared.id);assert.equal(stored.assets.length,2);assert.equal(stored.document.resources[0].nodes[0].parts.length,3)
 await source.release();f.setMedia(undefined);await f.reopen();assert.deepEqual(await f.runtime.prepare(input,signal()),{id:prepared.id,replayed:true})
 const sent=[];f.runtime.register({account:scope().account,async read(){throw Error('Must not refetch')},async send(destination,document,originals){sent.push({destination,document,originals});return accepted},async dispose(){}})
 assert.deepEqual(await f.runtime.sendRetained(scope(),prepared.id,signal()),accepted);assert.deepEqual(Buffer.from(sent[0].originals[0].original.copyBytes()),png);assert.deepEqual(Buffer.from(sent[0].originals[1].original.copyBytes()),gif);assert.equal(source.reads,2);assert.deepEqual(f.capacity,[undefined,scope()])
})

test('same operation shares preparation while changed inputs and foreign scopes cannot reuse the grant',options,async t=>{
 const f=await setup(t),entered=deferred(),release=deferred();let reads=0
 f.runtime.register({account:scope().account,async read(){reads++;entered.resolve();await release.promise;return{status:'resolved',nodes:[node()]}},async dispose(){}})
 const input={scope:scope(),operationId:'source-once',input:{kind:'source',rootMessageId:mid('outer'),resourceId:fid('root')}},a=f.runtime.prepare(input,signal()),b=f.runtime.prepare(input,signal());await entered.promise;assert.equal(reads,1);await assert.rejects(f.runtime.prepare({...input,input:{...input.input,resourceId:fid('different')}},signal()),error=>error.code==='conflict');release.resolve();const[first,second]=await Promise.all([a,b]);assert.equal(first.id,second.id);assert.equal(reads,1)
 assert.throws(()=>f.runtime.inspect(scope('another-group'),first.id),error=>error.code==='not-found');assert.equal((await f.runtime.sendRetained(scope('another-group'),first.id,signal())).code,'permission-denied');await assert.rejects(f.runtime.prepare({...input,input:{...input.input,rootMessageId:mid('changed')}},signal()),error=>error.code==='conflict')
})

test('a prepare caller cancellation does not cancel another identical caller',options,async t=>{
 const f=await setup(t),entered=deferred(),ready=deferred();let reads=0,aborted=false
 f.runtime.register({account:scope().account,async read(value,abort){reads++;abort.addEventListener('abort',()=>{aborted=true},{once:true});entered.resolve();await ready.promise;return{status:'resolved',nodes:[node()]}},async dispose(){}})
 const input={scope:scope(),operationId:'shared',input:{kind:'source',rootMessageId:'outer',resourceId:'root'}},cancel=new AbortController(),a=f.runtime.prepare(input,cancel.signal),b=f.runtime.prepare(input,signal());await entered.promise;cancel.abort();await assert.rejects(a,error=>error.code==='cancelled');assert.equal(aborted,false);ready.resolve();assert.ok((await b).id);assert.equal(reads,1)
})

test('uncertain sender receipt is returned once; the runtime never retries or regenerates it',options,async t=>{
 const f=await setup(t),prepared=await f.runtime.prepare(generated(),signal());let sends=0
 f.runtime.register({account:scope().account,async read(){throw Error('No read expected')},async send(){sends++;throw Error('synthetic private diagnostic')},async dispose(){}})
 assert.deepEqual(await f.runtime.sendRetained(scope(),prepared.id,signal()),{status:'uncertain',code:'provider-error'});assert.equal(sends,1);assert.equal(f.runtime.status().retained,1)
})

test('send capacity is independent of preparation and cancelled provider disposal joins the pending send',options,async t=>{
 const f=await setup(t,{maxConcurrentSends:1}),a=await f.runtime.prepare(generated('a'),signal()),b=await f.runtime.prepare(generated('b'),signal()),entered=deferred(),abortSeen=deferred(),cleanup=deferred();let disposed=false
 const release=f.runtime.register({account:scope().account,async read(){return{status:'resolved',nodes:[node()]}},async send(destination,document,originals,abort){abort.addEventListener('abort',()=>abortSeen.resolve(),{once:true});entered.resolve();await cleanup.promise;return{status:'uncertain',code:'cancelled-after-dispatch'}},async dispose(){disposed=true}})
 const pending=f.runtime.sendRetained(scope(),a.id,signal());await entered.promise;assert.equal((await f.runtime.sendRetained(scope(),b.id,signal())).code,'unavailable');assert.ok((await f.runtime.prepare(generated('chat-not-blocked'),signal())).id);let finished=false;const closing=release().then(()=>{finished=true});await abortSeen.promise;assert.equal(finished,false);assert.throws(()=>f.runtime.register({account:scope().account,async read(){},async dispose(){}}),error=>error.code==='conflict');cleanup.resolve();await closing;assert.equal((await pending).status,'uncertain');assert.equal(disposed,true);assert.equal(f.runtime.status().sending,0)
})

test('media capabilities may be installed after the core; a real media capacity failure remains explicit',options,async t=>{
 const f=await setup(t,{maxMediaItemBytes:1024,maxMediaBytes:1024,mediaChunkBytes:1024}),input=generated('media',[node([{type:'image',attachmentId:aid('png')}])]);f.setMedia(undefined);await assert.rejects(f.runtime.prepare(input,signal()),error=>error.code==='media-unavailable');f.setMedia(f.media);mediaFixture(f,new Map([[aid('png'),await original()]]));assert.ok((await f.runtime.prepare(input,signal())).id)
 const tooLarge=await original(Buffer.from('<html>'+('x'.repeat(1500))+'</html>'),'large.html');await f.reopen();const fresh=scope('large', 'group','other-account');mediaFixture(f,new Map([[aid('large'),tooLarge]]),fresh);await assert.rejects(f.runtime.prepare(generated('over-limit',[node([{type:'file',attachmentId:aid('large'),name:'large.html'}])],fresh),signal()),error=>error.code==='capacity');assert.equal(f.runtime.status().preparing,0)
})

test('storage capacities refuse admission without deleting earlier prepared outputs',options,async t=>{
 const f=await setup(t,{maxPrepared:1}),one=await f.runtime.prepare(generated('one'),signal());await assert.rejects(f.runtime.prepare(generated('two'),signal()),error=>error.code==='capacity');assert.equal(f.runtime.inspect(scope(),one.id).operationId,'one');await f.reopen();assert.equal(f.runtime.status().retained,1)
})

test('incomplete source graphs never retain a deceptively successful partial preparation',options,async t=>{
 const f=await setup(t);f.runtime.register({account:scope().account,async read(){return{status:'resolved',nodes:[node([{type:'reply',messageId:mid('unavailable')}])]}},async dispose(){}});await assert.rejects(f.runtime.prepare({scope:scope(),operationId:'incomplete',input:{kind:'source',rootMessageId:'outer',resourceId:'root'}},signal()),error=>error.code==='incomplete');assert.equal(f.runtime.status().retained,0)
})

test('durable parsing rejects edited graph closure and missing assets even with recomputed hashes',options,async t=>{
 const f=await setup(t);mediaFixture(f,new Map([[aid('png'),await original()]]));const prepared=await f.runtime.prepare(generated('verify',[node([{type:'image',attachmentId:aid('png')}])]),signal()),record=f.runtime.inspect(scope(),prepared.id)
 for(const modify of[value=>{value.assets=[]},value=>{value.document.resources=[]},value=>{value.document.resources.push({...value.document.resources[0],id:'unreachable'})},value=>{value.document.nodeCount++},value=>{value.scope.peerId='foreign'}]){const bad=structuredClone(record);modify(bad);bad.fingerprint=fingerprint(bad.document);assert.throws(()=>recordSchema(f.config).parse(bad))}
 const deep=structuredClone(record);for(let i=0;i<20;i++)deep.document.resources[0].nodes=[node([{type:'inline-forward',node:deep.document.resources[0].nodes[0]}])];assert.throws(()=>recordSchema(f.config).parse(deep),error=>!(error instanceof RangeError))
})

test('wire input rejects native receipts, unknown fields and unbounded inline nesting',()=>{
 const config=Config({});assert.throws(()=>parseNodes([{...node(),nativeReceipt:{attachmentId:'foreign'}}],config),error=>error.code==='invalid');let deep=node();for(let i=0;i<10000;i++)deep=node([{type:'inline-forward',node:deep}]);assert.throws(()=>parseNodes([deep],config),error=>error.code==='capacity')
})

test('last-waiter cancellation and close wait for actual cleanup and do not admit replacement work',options,async()=>{
 const flights=new Flights(1),entered=deferred(),aborted=deferred(),cleanup=deferred(),cancel=new AbortController();const pending=flights.run('key','input','owner',cancel.signal,async abort=>{abort.addEventListener('abort',()=>aborted.resolve(),{once:true});entered.resolve();await cleanup.promise;throw new ForwardError('cancelled')});await entered.promise;cancel.abort();await aborted.promise;assert.equal(flights.size,1);await assert.rejects(flights.run('other','input','owner',signal(),async()=>42),error=>error.code==='capacity');const rejected=assert.rejects(pending,error=>error.code==='cancelled');cleanup.resolve();await rejected;assert.equal(flights.size,0);await flights.close();await assert.rejects(flights.run('new','input','owner',signal(),async()=>42),error=>error.code==='closed')
})

test('provider cleanup failures are sanitized and do not leave the account reserved forever',options,async t=>{
 const f=await setup(t),release=f.runtime.register({account:scope().account,async read(){return{status:'resolved',nodes:[node()]}},async dispose(){throw Error('synthetic secret diagnostic')}});await assert.rejects(release(),error=>error.code==='unavailable'&&!error.message.includes('secret'));assert.equal(f.runtime.status().providers,0);f.runtime.register({account:scope().account,async read(){return{status:'resolved',nodes:[node()]}},async dispose(){}})
})

test('different conversations and recursive resources share only the bounded provider IO lane',options,async t=>{
 const f=await setup(t,{maxProviderCalls:2,maxConcurrentReads:8}),twoEntered=deferred(),release=deferred();let active=0,peak=0,calls=0
 f.cleanup(()=>release.resolve())
 f.runtime.register({account:scope().account,async read(value){calls++;active++;peak=Math.max(peak,active);if(active===2)twoEntered.resolve();await release.promise;active--;return{status:'resolved',nodes:[node(value.resourceId==='root'?[{type:'forward',resourceId:fid('child')}]:[{type:'text',text:value.scope.peerId}])]}},async dispose(){}})
 const tasks=[1,2,3,4].map(id=>f.runtime.read(request('root','outer',scope('group-'+id)),signal()));await twoEntered.promise;assert.equal(peak,2);assert.equal(f.runtime.status().reading,4);assert.ok((await f.runtime.prepare(generated('independent-text'),signal())).id);release.resolve();const documents=await Promise.all(tasks);assert.ok(documents.every(value=>value.complete));assert.equal(calls,8);assert.equal(peak,2);assert.equal(f.runtime.status().reading,0)
})

test('a deadline aborts the provider and joins cleanup before freeing the read slot',options,async t=>{
 const f=await setup(t,{readTimeoutMs:100,maxConcurrentReads:1}),entered=deferred(),abortSeen=deferred(),cleanup=deferred()
 f.cleanup(()=>cleanup.resolve())
 const keepAlive=setTimeout(()=>cleanup.reject(Error('Synthetic cleanup deadline')),10000);t.after(()=>clearTimeout(keepAlive))
 f.runtime.register({account:scope().account,async read(value,abort){abort.addEventListener('abort',()=>abortSeen.resolve(),{once:true});entered.resolve();await cleanup.promise;return{status:'resolved',nodes:[node()]}},async dispose(){}})
 const pending=f.runtime.read(request(),signal());await entered.promise;await abortSeen.promise;assert.equal(f.runtime.status().reading,1);await assert.rejects(f.runtime.read(request('another'),signal()),error=>error.code==='capacity');const refused=assert.rejects(pending,error=>error.code==='timeout');cleanup.resolve();await refused;assert.equal(f.runtime.status().reading,0)
})

test('strict Host operations reject injected storage receipts and cancelled replays without IO',options,async t=>{
 const f=await setup(t),input=generated('replay');await f.runtime.prepare(input,signal());const cancelled=new AbortController();cancelled.abort();await assert.rejects(f.runtime.prepare(input,cancelled.signal),error=>error.code==='cancelled');await assert.rejects(f.runtime.prepare({...input,assets:[{originalId:'foreign',stored:{attachmentId:'foreign'}}]},signal()),error=>error.code==='invalid');await f.runtime.close();await assert.rejects(f.runtime.prepare(input,signal()),error=>error.code==='closed')
})

test('unregistering an account aborts and joins its media preparation before permitting replacement',options,async t=>{
 const f=await setup(t),entered=deferred(),abortSeen=deferred(),cleanup=deferred(),input=await original();f.cleanup(()=>cleanup.resolve())
 f.media.register({account:scope().account,async read(destination,id,abort){abort.addEventListener('abort',()=>abortSeen.resolve(),{once:true});entered.resolve();await cleanup.promise;return input},async store(){throw Error('Unused')},async dispose(){}})
 const release=f.runtime.register({account:scope().account,async read(){return{status:'resolved',nodes:[node()]}},async dispose(){}}),pending=f.runtime.prepare(generated('cancel-media',[node([{type:'image',attachmentId:aid('image')}])]),signal());await entered.promise;const refused=assert.rejects(pending,error=>error.code==='cancelled');let closed=false;const stopping=release().then(()=>{closed=true});await abortSeen.promise;assert.equal(closed,false);assert.equal(f.runtime.status().preparing,1);cleanup.resolve();await stopping;await refused;assert.equal(f.runtime.status().retained,0);assert.equal(f.runtime.status().preparing,0)
})
