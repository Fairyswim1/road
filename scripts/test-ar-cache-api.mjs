import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const c=await post('/api/game',{action:'create',mode:'ar',title:'인식 데이터 재사용 확인',names:['검증 모둠','다른 모둠'],pin:'246810',cardCount:12,searchMinutes:30,solveMinutes:5,allNumbers:false});assert.equal(c.status,200);
const {id,adminToken,game:g}=c.data,token=g.teams[0].token;
for(let i=0;i<6;i++){const f=new FormData();f.set('target',new Blob([new Uint8Array(500000).fill(i)]),'t.mind');f.set('photo',new Blob([new Uint8Array(200).fill(i)]),'p.jpg');f.set('version',String(i));f.set('cards',JSON.stringify([g.cards[i].id]));f.set('question','2+3');f.set('answers','["5"]');assert.equal((await post(`/api/game-ar?id=${id}&action=upload`,f,adminToken)).status,200);}
assert.equal((await post(`/api/game-ar?id=${id}&action=publish`,{version:6},adminToken)).status,200);assert.equal((await post('/api/game',{id,action:'start'},adminToken)).status,200);
const url=`${base}/api/game-ar?id=${id}`,headers={Authorization:`Bearer ${token}`};
const meta=await fetch(url,{headers}).then(r=>r.json());assert.match(meta.bundleVersion,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(meta).includes('game-ar/'));assert.deepEqual(Object.keys(meta).sort(),['bundleVersion','targets','version']);
assert.equal((await fetch(url+'&asset=bundle&bundleVersion='+'0'.repeat(64),{headers})).status,409);
assert.equal((await fetch(url+'&asset=bundle&bundleVersion='+meta.bundleVersion,{headers})).status,200);
await post(`/api/game-ar?id=${id}&action=answer`,{targetId:meta.targets[0].id,answer:'5'},token);assert.equal((await fetch(url,{headers}).then(r=>r.json())).bundleVersion,meta.bundleVersion);
fs.writeFileSync('.sites-runtime/ar-cache-ui.json',JSON.stringify({id,adminToken,token}));
console.log('PASS immutable recognition identity, stale-file rejection, safe metadata, unchanged identity after answering');
