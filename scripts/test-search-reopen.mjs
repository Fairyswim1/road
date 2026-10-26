import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const created=await post('/api/game',{action:'create',mode:'ar',title:'추가 수색 확인',names:['수식 풀이 모둠','제출 완료 모둠','복귀한 모둠'],pin:'246810',cardCount:12,searchMinutes:10,solveMinutes:10,allNumbers:false});assert.equal(created.status,200);
const {id,adminToken,game:g}=created.data,[a,b,c]=g.teams;
const game=(action,extra={},token=adminToken)=>post('/api/game',{id,action,...extra},token);
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
const read=()=>fetch(`${base}/api/game?id=${id}`,{headers:{Authorization:`Bearer ${adminToken}`}}).then(r=>r.json());
assert.equal((await game('search_reopen',{minutes:5,searchTimerVersion:0})).status,409);
for(let i=0;i<2;i++){
 const f=new FormData();f.set('target',new Blob([new Uint8Array(200)]),'t.mind');f.set('photo',new Blob([new Uint8Array(200).fill(i)]),'p.jpg');f.set('version',String(i));f.set('cards',JSON.stringify(g.cards.slice(i*3,i*3+3).map(c=>c.id)));f.set('question','2+3');f.set('answers','["5"]');assert.equal((await ar('upload',f)).status,200);
}
assert.equal((await ar('publish',{version:2})).status,200);assert.equal((await game('start')).status,200);
const targets=(await read()).game.ar.targets;
for(const team of [a,b]){const answer=await ar('answer',{targetId:targets[0].id,answer:'5'},team.token);assert.equal(answer.data.correct,true);assert.equal((await game('claim',{code:answer.data.code},team.token)).status,200);}
assert.equal((await game('return',{teamId:c.id})).status,200);
assert.equal((await game('stop')).status,200);
assert.equal((await game('submit',{teamId:b.id,incomplete:true})).status,200);
assert.equal((await game('solve',{teamId:a.id})).status,200);
const own=(await read()).game.cards.find(x=>x.owner===a.id),board=Array(36).fill(null);board[0]=own.id;
assert.equal((await game('board',{teamId:a.id,board,boardVersion:0})).status,200);
assert.equal((await game('practice',{teamId:a.id,board,boardVersion:0},a.token)).status,409);
const before=await read();
assert.equal((await game('search_reopen',{minutes:5,searchTimerVersion:0},a.token)).status,403);
for(const minutes of [0,121,1.5,'5'])assert.equal((await game('search_reopen',{minutes,searchTimerVersion:0})).status,400);
assert.equal((await game('search_reopen',{minutes:5,searchTimerVersion:99})).status,409);
const race=await Promise.all([1,2].map(()=>game('search_reopen',{minutes:5,searchTimerVersion:0})));assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
const opened=await read(),t=opened.game.teams[0];assert.equal(opened.game.phase,'search');assert.equal(opened.game.searchPausedMs,null);assert.equal(opened.game.searchTimerVersion,1);
assert.ok(opened.game.searchEndsAt-opened.serverNow>295000&&opened.game.searchEndsAt-opened.serverNow<=300000);
assert.equal(t.status,'searching');assert.equal(t.startedAt,null);assert.ok(t.usedMs>before.game.teams[0].usedMs);assert.deepEqual(t.board,board);assert.equal(t.practiceBoard,undefined);assert.equal(t.boardVersion,1);assert.equal(t.practiceVersion,undefined);
assert.deepEqual(opened.game.teams[1],before.game.teams[1]);assert.equal(opened.game.teams[2].status,'searching');
assert.deepEqual(opened.game.cards,before.game.cards);assert.deepEqual(opened.game.ar,before.game.ar);
assert.equal((await game('board',{teamId:a.id,board,boardVersion:1})).status,400);
assert.equal((await ar('discover',{targetId:targets[1].id},b.token)).status,409);
assert.equal((await game('claim',{code:g.cards[2].secret},a.token)).status,409);
assert.equal((await ar('discover',{targetId:targets[0].id},a.token)).data.claimed,true);
const next=await ar('answer',{targetId:targets[1].id,answer:'5'},a.token);assert.equal(next.data.correct,true);assert.equal((await game('claim',{code:next.data.code},a.token)).status,200);
assert.equal((await game('stop')).status,200);assert.equal((await read()).game.teams[0].usedMs,t.usedMs);
assert.equal((await game('search_reopen',{minutes:5,searchTimerVersion:0})).status,409);
// Keep a solve-stage fixture for UI testing; the copy has fresh progress.
fs.writeFileSync('.sites-runtime/search-reopen-ui.json',JSON.stringify({id,adminToken}));
const copy=(await game('clone',{requestId:crypto.randomUUID().replaceAll('-',''),title:'재개 경계 검사',names:['가','나'],pin:'123456'})).data;
const cp=(action,extra={})=>post('/api/game',{id:copy.id,action,...extra},copy.adminToken);
assert.equal((await cp('start')).status,200);assert.equal((await cp('stop')).status,200);
for(const team of copy.game.teams)assert.equal((await cp('submit',{teamId:team.id,incomplete:true})).status,200);
assert.equal((await cp('search_reopen',{minutes:5,searchTimerVersion:0})).status,409);
assert.equal((await game('solve',{teamId:a.id})).status,200);assert.equal((await game('pause',{teamId:a.id})).status,200);assert.ok((await read()).game.teams[0].usedMs>=t.usedMs);
console.log('PASS teacher-only reopen, duration and stale checks, concurrent replay, AR progress/ownership/boards preserved, solving clock paused, submitted teams excluded, repeat location blocked, new claim, ended class rejected');
