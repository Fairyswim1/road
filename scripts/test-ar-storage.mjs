import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {loadRecognitionBundle} from '../public/ar-bundle.js';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const c=await post('/api/game',{action:'create',mode:'ar',title:'24MB AR 저장 검사',names:['검사1','검사2'],pin:'246810',cardCount:12,searchMinutes:10,solveMinutes:1,allNumbers:false});assert.equal(c.status,200);
const {id,adminToken,game:g}=c.data,student=g.teams[0].token;
const read=()=>fetch(`${base}/api/game?id=${id}`,{headers:{Authorization:`Bearer ${adminToken}`}}).then(r=>r.json());
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
const game=(action,extra={})=>post('/api/game',{id,action,...extra},adminToken);
assert.equal((await ar('publish',{version:0})).status,400);
// Synthetic recognition bytes test storage/transport, not camera recognition.
for(let i=0;i<12;i++){
 const f=new FormData();f.set('target',new Blob([new Uint8Array(2_000_000).fill(i)]),'target.mind');f.set('photo',new Blob([new Uint8Array(200).fill(i)]),'photo.jpg');f.set('version',String(i));f.set('cards',JSON.stringify([g.cards[i].id]));f.set('question','2+3');f.set('answers','["5"]');
 const r=await ar('upload',f);assert.equal(r.status,200,JSON.stringify(r));
}
assert.equal((await ar('publish',{version:11})).status,409);
assert.equal((await ar('publish',{version:12},student)).status,403);
assert.equal((await ar('publish',{version:12})).status,200);
const ready=await read();assert.equal(ready.game.ar.ready,true);
assert.equal((await ar('publish',{version:12})).status,200);
assert.equal((await read()).game.ar.bundle,ready.game.ar.bundle);
const url=`${base}/api/game-ar?id=${id}&asset=bundle`;
const get=(url,token=student)=>fetch(url,{headers:{Authorization:`Bearer ${token}`}});
assert.equal((await get(url)).status,409);assert.equal((await get(url,'wrong')).status,403);
assert.equal((await game('start')).status,200);
const manifest=await (await get(url)).json();assert.deepEqual(manifest,{format:'targets-v1',parts:12});
for(const part of ['-1','12','0.5','NaN','999999999999999999999'])assert.equal((await get(url+'&part='+part)).status,404);
const progress=[];
const result=await loadRecognitionBundle({url,headers:{Authorization:`Bearer ${student}`},signal:new AbortController().signal,onProgress:(n,total)=>progress.push([n,total]),combine:async buffers=>{
 assert.equal(buffers.length,12);
 buffers.forEach((b,i)=>{assert.equal(b.byteLength,2_000_000);const v=new Uint8Array(b);assert.equal(v[0],i);assert.equal(v.at(-1),i);});
 return new Blob(buffers);
}});
assert.equal(result.size,24_000_000);assert.deepEqual(progress.at(-1),[12,12]);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>loadRecognitionBundle({url,headers:{Authorization:`Bearer ${student}`},signal:cancelled.signal,combine:()=>assert.fail()}),{name:'AbortError'});
assert.equal((await game('search_pause',{searchTimerVersion:0})).status,200);
assert.equal((await get(url+'&part=0')).status,409);
const copy=await game('clone',{requestId:crypto.randomUUID().replaceAll('-',''),title:'AR 저장 복사 검사',names:['새1','새2'],pin:'123456'});assert.equal(copy.status,200);
assert.equal(copy.data.game.ar.bundle,ready.game.ar.bundle);
assert.equal((await get(`${base}/api/game-ar?id=${copy.data.id}&asset=bundle&part=11`,copy.data.adminToken)).status,200);
assert.equal((await get(`${base}/api/game-ar?id=${copy.data.id}&asset=bundle&part=0`,adminToken)).status,403);
// A copied class keeps its immutable files when the source changes later.
assert.equal((await post(`/api/game-ar?id=${copy.data.id}&action=remove`,{targetId:copy.data.game.ar.targets[0].id},copy.data.adminToken)).status,200);
assert.equal((await get(`${base}/api/game-ar?id=${copy.data.id}&asset=bundle`,copy.data.adminToken)).status,409);
assert.equal((await get(url+'&part=0',adminToken)).status,200);
writeFileSync('.sites-runtime/ar-storage-session.json',JSON.stringify({id:copy.data.id,adminToken:copy.data.adminToken}));
console.log('PASS 24MB aggregate publication and ordered download, retry, stale versions, privacy, pause, cancellation, clone isolation and invalidation');
