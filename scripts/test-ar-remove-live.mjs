import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const c=await post('/api/game',{action:'create',mode:'ar',title:'수색 중 장소 추가 · 안내 확인',names:['우리 모둠','두 번째 모둠','세 번째 모둠'],pin:'246810',cardCount:20,searchMinutes:30,solveMinutes:5,allNumbers:false});assert.equal(c.status,200);
const {id,adminToken,game:g}=c.data,[a,b,d]=g.teams;
const read=async(token=adminToken)=>fetch(`${base}/api/game?id=${id}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
const meta=async(token=a.token)=>fetch(`${base}/api/game-ar?id=${id}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
const game=(action,extra={},token=adminToken)=>post('/api/game',{id,action,...extra},token);
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
function form(i,version,cards=[i]){const f=new FormData();f.set('target',new Blob([new Uint8Array(200).fill(i)]),'t.mind');f.set('photo',new Blob([new Uint8Array(200).fill(i)]),'p.jpg');f.set('version',String(version));f.set('cards',JSON.stringify(cards.map(n=>g.cards[n].id)));f.set('question','2+3');f.set('answers','["5"]');return f;}
assert.equal((await ar('upload',form(0,0,[0,1]))).status,200);
assert.equal((await ar('upload',form(2,1))).status,200);
assert.equal((await ar('publish',{version:2})).status,200);
assert.equal((await game('start')).status,200);
const initial=await meta(),first=initial.targets[0].id;
const headers={Authorization:`Bearer ${a.token}`};
const manifest=async m=>fetch(`${base}/api/game-ar?id=${id}&asset=bundle&bundleVersion=${m.bundleVersion}`,{headers}).then(r=>r.json());
const initialParts=await manifest(initial);
assert.equal((await ar('remove',{targetId:first,version:2},a.token)).status,403);
const reward=await ar('answer',{targetId:first,answer:'5'},a.token);assert.ok(reward.data.code);
assert.equal((await game('claim',{code:reward.data.code},a.token)).status,200);
const held=await ar('answer',{targetId:first,answer:'5'},b.token);assert.ok(held.data.code);
const second=initial.targets[1].id;
// A different team's answer can be saved at the same time as removal.
const [removed,answered]=await Promise.all([ar('remove',{targetId:first,version:2}),ar('answer',{targetId:second,answer:'5'},d.token)]);
assert.equal(removed.status,200,JSON.stringify(removed));assert.equal(answered.status,200);assert.equal(answered.data.correct,true);
let current=await read();assert.equal(current.game.phase,'search');assert.equal(current.game.ar.ready,true);assert.equal(current.game.ar.version,3);
assert.deepEqual(current.game.ar.targets.map(t=>t.id),[second]);assert.ok(current.game.ar.targets[0].solvedBy.includes(d.id));
assert.equal(current.game.cards[0].owner,a.id);assert.equal(current.game.cards[1].owner,null);
assert.deepEqual((await ar('discover',{targetId:first},b.token)).data,{card:null,code:null,removed:true});
assert.equal((await ar('answer',{targetId:first,answer:'5'},b.token)).data.removed,true);
assert.equal((await game('claim',{code:held.data.code},b.token)).status,409);
const after=await meta();assert.notEqual(after.bundleVersion,initial.bundleVersion);
assert.deepEqual((await manifest(after)).partVersions,initialParts.partVersions.slice(1));
assert.equal((await fetch(`${base}/api/game-ar?id=${id}&asset=bundle&bundleVersion=${initial.bundleVersion}`,{headers})).status,409);
assert.equal((await ar('remove',{targetId:second,version:2})).status,409);
// An owned card cannot be re-hidden; an unclaimed card can.
assert.equal((await ar('upload',form(7,3,[0]))).status,409);
assert.equal((await ar('upload',form(8,3,[1]))).status,200);
current=await read();const rehidden=current.game.ar.targets[1].id;
assert.deepEqual(current.game.ar.targets[1].solvedBy,[]);
assert.equal((await game('claim',{code:held.data.code},b.token)).status,403);
assert.equal((await game('search_pause',{searchTimerVersion:0})).status,200);
assert.equal((await ar('remove',{targetId:second,version:4})).status,200);
assert.equal((await ar('remove',{targetId:rehidden,version:5})).status,200);
current=await read();assert.equal(current.game.ar.targets.length,0);assert.equal(current.game.ar.ready,true);assert.ok(current.game.searchPausedMs>0);assert.equal(current.game.cards[0].owner,a.id);
assert.equal((await game('search_resume',{searchTimerVersion:1})).status,200);
const empty=await meta();assert.deepEqual(empty.targets,[]);assert.equal((await manifest(empty)).parts,0);
// Empty placement is recoverable without restarting the class.
assert.equal((await ar('upload',form(9,6,[3]))).status,200);
current=await read();assert.equal(current.game.ar.ready,true);assert.equal(current.game.ar.targets.length,1);
fs.writeFileSync('.sites-runtime/remove-places-ui.json',JSON.stringify({id,adminToken,team:a.token,targets:current.game.ar.targets.map(t=>({id:t.id,label:t.label}))}));
assert.equal((await game('stop')).status,200);
assert.equal((await ar('remove',{targetId:current.game.ar.targets[0].id,version:7})).status,409);
assert.equal((await game('search_reopen',{minutes:30,searchTimerVersion:2})).status,200);
console.log('PASS live/paused removal, concurrent answer and collected-card preservation, stale claim/version rejection, immutable index ordering/cache reuse, empty/re-add, role/phase protection');
