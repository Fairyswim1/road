import assert from 'node:assert/strict';
const entries=new Map();let quota=false,blocked=false;
globalThis.caches={async open(){if(blocked)throw Error('storage disabled');return {async match(k){return entries.get(k)?.clone();},async put(k,r){if(quota)throw Error('quota');entries.set(k,r.clone());},async keys(){return [...entries.keys()].map(url=>new Request(url));},async delete(r){return entries.delete(typeof r==='string'?r:r.url);}};}};
let requests=[],active=0,peak=0,legacy=false,delays=false,stableParts=0;
globalThis.fetch=async(url,{signal}={})=>{
 signal?.throwIfAborted();requests.push(url);const u=new URL(url),n=u.searchParams.get('part');
 if(n===null)return legacy?new Response(new Blob(['legacy'])):Response.json({format:'targets-v1',parts:stableParts||8,...(stableParts?{partVersions:Array.from({length:stableParts},(_,i)=>String(i).padStart(64,'0'))}:{})});
 active++;peak=Math.max(peak,active);
 try{await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delays?(Number(n)===0?1:80):(8-Number(n))*3);signal?.addEventListener('abort',abort,{once:true});});return new Response(new Blob([n]));}finally{active--;}
};
let moduleId=0,merges=0;
const fresh=async()=> (await import('../public/ar-bundle.js?test='+ ++moduleId)).loadRecognitionBundle;
const base={url:'https://test.invalid/api/game-ar?id=class&asset=bundle',headers:{Authorization:'Bearer teacher-test-token'},version:'a'.repeat(64),combine:async buffers=>{merges++;return new Blob(buffers);}};
let load=await fresh(),stages=[];
assert.equal(await (await load({...base,onStage:s=>stages.push(s)})).text(),'01234567');assert.equal(requests.length,9);assert.equal(peak,4);assert.equal(merges,1);assert.ok(stages.includes('saved'));
assert.equal(entries.size,1);assert.ok([...entries.keys()].every(k=>!k.includes('teacher-test-token')));
requests=[];assert.equal(await (await load(base)).text(),'01234567');assert.equal(requests.length,0);assert.equal(merges,1);
load=await fresh();requests=[];stages=[];await load({...base,onStage:s=>stages.push(s)});assert.equal(requests.length,0);assert.equal(merges,1);assert.deepEqual(stages,['cached']);
requests=[];await load({...base,version:'b'.repeat(64)});assert.equal(requests.length,9);assert.equal(entries.size,1);
requests=[];await load({...base,version:'b'.repeat(64),headers:{Authorization:'Bearer different-team'}});assert.equal(requests.length,9);
// Completed parts survive interruption; retry only downloads missing parts.
entries.clear();load=await fresh();delays=true;const abort=new AbortController();
await assert.rejects(()=>load({...base,signal:abort.signal,onProgress:n=>{if(n===1)abort.abort();}}),{name:'AbortError'});
assert.equal(entries.size,1);requests=[];delays=false;load=await fresh();await load(base);assert.equal(requests.length,8);assert.ok(!requests.some(x=>x.includes('&part=0')));
// Failed persistent storage never prevents AR; in-page memory still works.
entries.clear();quota=true;load=await fresh();requests=[];stages=[];await load({...base,onStage:s=>stages.push(s)});assert.ok(stages.includes('session'));requests=[];await load(base);assert.equal(requests.length,0);quota=false;
blocked=true;load=await fresh();await load(base);blocked=false;
// Original single-file lessons are cached too.
entries.clear();legacy=true;load=await fresh();requests=[];assert.equal(await (await load(base)).text(),'legacy');assert.equal(requests.length,1);load=await fresh();requests=[];assert.equal(await (await load(base)).text(),'legacy');assert.equal(requests.length,0);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>load({...base,signal:cancelled.signal}),{name:'AbortError'});
console.log('PASS ordered four-way transfer, memory/disk reuse without download or merge, revision/team isolation, resumable parts, quota/blocked-storage fallback, legacy cache, cancellation');

// Appending a live location downloads only its new immutable part.
entries.clear();legacy=false;stableParts=3;load=await fresh();requests=[];
await load({...base,version:'c'.repeat(64)});assert.equal(requests.length,4);
stableParts=4;load=await fresh();requests=[];
assert.equal(await (await load({...base,version:'d'.repeat(64)})).text(),'0123');
assert.equal(requests.length,2);assert.ok(requests[1].includes('&part=3'));
assert.equal(entries.size,5);
console.log('PASS live append reuses existing recognition parts, downloads only new part');
