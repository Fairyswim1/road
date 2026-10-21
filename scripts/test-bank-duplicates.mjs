import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
const headers=token=>({Authorization:'Bearer '+token});
async function post(path,body,token,expected=200){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...headers(token),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
async function create(){return post('/api/game',{action:'create',mode:'ar',title:'문제 중복 방지 검증',names:['1모둠','2모둠'],pin:'246810',cardCount:20,searchMinutes:30,solveMinutes:10,allNumbers:false});}
async function state(g){return (await fetch(base+'/api/game?id='+g.id,{headers:headers(g.adminToken)}).then(r=>r.json())).game;}
async function list(g,target=''){const r=await fetch(`${base}/api/problem-bank?id=${g.id}&excludeTarget=${target}`,{headers:headers(g.adminToken)});assert.equal(r.status,200);return (await r.json()).problems;}
const inUse=async(g,id,target='')=>(await list(g,target)).find(p=>p.id===id).inUse;
// Previous releases stored only images. Verify a pre-update local fixture if present.
if(fs.existsSync('.sites-runtime/problem-bank-fixture.json')){const old=JSON.parse(fs.readFileSync('.sites-runtime/problem-bank-fixture.json'));const oldState=await state(old);if(oldState.ar.targets.some(t=>!t.bankProblemId&&t.problemImage))assert.equal(await inUse(old,'mi-01'),true);}
const g=await create(),images=new Map();
for(const id of ['mi-01','mi-02','mi-03']){const r=await fetch(`${base}/api/problem-bank?id=${g.id}&image=${id}`,{headers:headers(g.adminToken)});assert.equal(r.status,200);images.set(id,await r.blob());}
let photoSeed=1;
async function upload(g,id,card,expected=200,explicit=true){const s=await state(g),f=new FormData();f.set('target',new Blob([new Uint8Array(200)]),'test.mind');f.set('photo',new Blob([new Uint8Array(200).fill(photoSeed++)]),'test.jpg');f.set('version',String(s.ar.version));f.set('label','로컬 검증 장소 '+card);f.set('cards',JSON.stringify([s.cards[card].id]));f.set('question',id?'':'직접 입력 문제 '+card);f.set('answers','["1"]');if(id){f.set('problemImage',images.get(id),'problem.png');if(explicit)f.set('bankProblemId',id);}return post(`/api/game-ar?id=${g.id}&action=upload`,f,g.adminToken,expected);}
async function edit(g,target,id,expected=200){const f=new FormData();f.set('targetId',target);f.set('question','');f.set('answers','["1"]');f.set('bankProblemId',id);f.set('problemImage',images.get(id),'problem.png');return post(`/api/game-ar?id=${g.id}&action=problem`,f,g.adminToken,expected);}
await upload(g,'mi-01',0);const first=(await state(g)).ar.targets[0];assert.equal(first.bankProblemId,'mi-01');assert.ok(first.problemImageHash);
assert.equal(await inUse(g,'mi-01'),true);assert.equal(await inUse(g,'mi-01',first.id),false);
await upload(g,'mi-01',1,409);await upload(g,'mi-01',1,409,false);assert.equal((await state(g)).ar.targets.length,1);
await edit(g,first.id,'mi-01'); // Keeping its own question is allowed.
await upload(g,'mi-02',1);const second=(await state(g)).ar.targets[1];await edit(g,second.id,'mi-01',409);
await edit(g,first.id,'mi-03');assert.equal(await inUse(g,'mi-01'),false);assert.equal(await inUse(g,'mi-03'),true);
await upload(g,'mi-01',2);const third=(await state(g)).ar.targets[2];
await post(`/api/game-ar?id=${g.id}&action=remove`,{targetId:third.id},g.adminToken);assert.equal(await inUse(g,'mi-01'),false);
// Two independent editors cannot reserve the same question concurrently.
await upload(g,null,3);await upload(g,null,4);const candidates=(await state(g)).ar.targets.slice(-2);
async function race(target){const f=new FormData();f.set('targetId',target.id);f.set('question','');f.set('answers','["1"]');f.set('bankProblemId','mi-01');f.set('problemImage',images.get('mi-01'),'p.png');return fetch(`${base}/api/game-ar?id=${g.id}&action=problem`,{method:'POST',headers:headers(g.adminToken),body:f}).then(r=>r.status);}
assert.deepEqual((await Promise.all(candidates.map(race))).sort(),[200,409]);assert.equal((await state(g)).ar.targets.filter(t=>t.bankProblemId==='mi-01').length,1);
const other=await create();await upload(other,'mi-01',0);assert.equal(await inUse(other,'mi-01'),true);
const copy=await post('/api/game',{action:'clone',id:g.id,requestId:crypto.randomUUID().replaceAll('-',''),title:'복제 수업',names:['새1','새2'],pin:'246810'},g.adminToken);
assert.equal(await inUse(copy,'mi-01'),true);await upload(copy,'mi-01',5,409);
// Students must never receive bank identities or answer material.
const student=await fetch(base+'/api/game?id='+g.id,{headers:headers(g.game.teams[0].token)}).then(r=>r.json());assert.ok(!JSON.stringify(student).includes('bankProblemId'));assert.equal((await fetch(`${base}/api/problem-bank?id=${g.id}`,{headers:headers(g.game.teams[0].token)})).status,403);
fs.writeFileSync('.sites-runtime/bank-duplicates-ui.json',JSON.stringify({id:g.id,adminToken:g.adminToken}));
console.log('PASS legacy image recognition, duplicate upload/edit rejection, own-target edit, replace/delete release, concurrent edits, class isolation, clones and student privacy');
