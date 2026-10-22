import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function make(mode){return (await post('/api/game',{action:'create',mode,title:'수색 시간 조절 확인',names:['1모둠','2모둠'],pin:'246810',cardCount:60,searchMinutes:1,solveMinutes:10,allNumbers:false})).data;}
const expiry=await make();assert.ok(expiry.id);await post('/api/game',{id:expiry.id,action:'start'},expiry.adminToken);const expiresAt=Date.now()+61000;
const c=await make('ar'),{id,adminToken}=c,[a,b]=c.game.teams;
const game=(action,extra={},token=adminToken)=>post('/api/game',{id,action,...extra},token);
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
const read=async(token=adminToken)=>(await fetch(`${base}/api/game?id=${id}`,{headers:{Authorization:`Bearer ${token}`}})).json();
assert.equal((await game('search_pause',{searchTimerVersion:0})).status,409);
const f=new FormData();f.set('target',new Blob([new Uint8Array(200)]),'t.mind');f.set('photo',new Blob([new Uint8Array(200)]),'p.jpg');f.set('version','0');f.set('label','검증 장소');f.set('cards',JSON.stringify(c.game.cards.slice(0,3).map(x=>x.id)));f.set('question','1+1');f.set('answers','["2"]');assert.equal((await ar('upload',f)).status,200);
const target=(await read()).game.ar.targets[0];const bundle=new FormData();bundle.set('version','1');bundle.set('target',new Blob([new Uint8Array(200)]),'b.mind');assert.equal((await ar('publish',bundle)).status,200);
assert.equal((await game('start')).status,200);
const answer=(await ar('answer',{targetId:target.id,answer:'2'},a.token)).data;assert.ok(answer.code);
assert.equal((await game('search_pause',{searchTimerVersion:0},a.token)).status,403);
const paused=await game('search_pause',{searchTimerVersion:0});assert.equal(paused.status,200);const ms=paused.data.game.searchPausedMs;assert.ok(ms>0&&ms<=60000);assert.equal(paused.data.game.searchEndsAt,null);
await new Promise(r=>setTimeout(r,1100));const later=await read(a.token);assert.equal(later.game.searchPausedMs,ms);assert.equal(later.game.phase,'search');assert.equal(later.game.ar,undefined);
assert.equal((await game('claim',{code:answer.code},a.token)).status,409);
for(const action of ['discover','answer']){const r=await ar(action,{targetId:target.id,answer:'2'},a.token);assert.equal(r.status,409);assert.match(r.data.error,/일시 정지/);}
const blocked=await fetch(`${base}/api/game-ar?id=${id}&asset=bundle`,{headers:{Authorization:`Bearer ${a.token}`}});assert.equal(blocked.status,409);
assert.equal((await game('search_add',{minutes:0,searchTimerVersion:1})).status,400);
assert.equal((await game('search_add',{minutes:1,searchTimerVersion:1},a.token)).status,403);
const adds=await Promise.all([1,1].map(minutes=>game('search_add',{minutes,searchTimerVersion:1})));assert.deepEqual(adds.map(x=>x.status).sort(),[200,409]);
assert.equal((await read()).game.searchPausedMs,ms+60000);
const resume=await game('search_resume',{searchTimerVersion:2});assert.equal(resume.status,200);assert.equal(resume.data.game.searchPausedMs,null);assert.ok(Math.abs(resume.data.game.searchEndsAt-resume.data.serverNow-(ms+60000))<1000);
assert.equal((await game('claim',{code:answer.code},a.token)).status,200);
await game('return',{teamId:a.id});
const before=(await read()).game.searchEndsAt;const added=await game('search_add',{minutes:5,searchTimerVersion:3});assert.equal(added.status,200);assert.equal(added.data.game.searchEndsAt,before+300000);assert.equal(added.data.game.teams[0].status,'ready');assert.equal(added.data.game.cards.filter(x=>x.owner===a.id).length,1);
assert.equal((await game('search_pause',{searchTimerVersion:4})).status,200);
const clone=(await post('/api/game',{action:'clone',id,requestId:crypto.randomUUID().replaceAll('-',''),title:'복사된 시간 설정',names:['가','나'],pin:'123456'},adminToken)).data;assert.equal(clone.game.phase,'setup');assert.equal(clone.game.searchMinutes,1);assert.equal(clone.game.searchPausedMs,undefined);assert.equal(clone.game.searchEndsAt,null);
// Keep a paused local fixture for visual verification.
fs.writeFileSync('.sites-runtime/search-controls-ui.json',JSON.stringify({id,adminToken,teamToken:b.token}));
console.log('PASS pause persistence, resume, live/paused extension, stale duplicate rejection, permissions, blocked AR answer/discover/claim, returned team and clone preservation');
await new Promise(r=>setTimeout(r,Math.max(0,expiresAt-Date.now())));
const late=await post('/api/game',{id:expiry.id,action:'search_add',minutes:5,searchTimerVersion:0},expiry.adminToken);assert.equal(late.status,409);
const expired=await fetch(`${base}/api/game?id=${expiry.id}`,{headers:{Authorization:`Bearer ${expiry.adminToken}`}}).then(r=>r.json());assert.equal(expired.game.phase,'solve');
// Paused lesson remains paused beyond its original deadline.
assert.equal((await read()).game.phase,'search');assert.ok((await read()).game.searchPausedMs>0);
const stopped=await game('stop');assert.equal(stopped.status,200);assert.equal(stopped.data.game.phase,'solve');assert.equal(stopped.data.game.searchPausedMs,null);assert.equal((await game('search_resume',{searchTimerVersion:5})).status,409);
console.log('PASS automatic expiry, no reopening ended search, pause survives original deadline, explicit stop while paused');
