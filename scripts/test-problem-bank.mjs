import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
async function post(path,body,token){const form=body instanceof FormData;const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
const created=await post('/api/game',{action:'create',mode:'ar',title:'문제은행 로컬 검증',names:['분수 모둠','루트 모둠'],pin:'246810',cardCount:12,searchMinutes:60,solveMinutes:10,allNumbers:false});
const {id,adminToken,game:g}=created,[team]=g.teams;
const auth=token=>({headers:{Authorization:'Bearer '+token}});
const bank='/api/problem-bank?id='+id;
assert.equal((await fetch(base+bank)).status,403);
assert.equal((await fetch(base+bank,auth(team.token))).status,403);
for(const query of ['&entry=mi-01','&image=mi-01'])assert.equal((await fetch(base+bank+query,auth(team.token))).status,403);
const list=await fetch(base+bank,auth(adminToken)).then(r=>r.json());assert.equal(list.count,100);assert.ok(list.problems.every(p=>!('answer'in p)&&!('solution'in p)));
const detail=await fetch(base+bank+'&entry=mi-01',auth(adminToken)).then(r=>r.json());assert.equal(detail.answer,'sqrt(6)');assert.ok(detail.solutionHtml);
const imageResponse=await fetch(base+bank+'&image=mi-01',auth(adminToken));assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');assert.match(imageResponse.headers.get('cache-control'),/private.*no-store/);
const png=await imageResponse.blob();assert.ok(png.size>1000);
assert.equal((await fetch(base+bank+'&entry=missing',auth(adminToken))).status,404);
const form=new FormData();form.set('target',new Blob([new Uint8Array(200)]),'target.mind');form.set('photo',png,'photo.png');form.set('version','0');form.set('label','문제은행 검증용 장소');form.set('cards',JSON.stringify(g.cards.slice(0,2).map(c=>c.id)));form.set('question','');form.set('answers',JSON.stringify([detail.answer]));form.set('problemImage',png,'mi-01.png');
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
await ar('upload',form);
const teacher=await fetch(base+'/api/game?id='+id,auth(adminToken)).then(r=>r.json());const target=teacher.game.ar.targets[0];
// Retain local-only setup fixture for actual browser interactions.
fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/problem-bank-fixture.json',JSON.stringify({id,adminToken,teamToken:team.token,targetId:target.id}));
const bundle=new FormData();bundle.set('version','1');bundle.set('target',new Blob([new Uint8Array(200)]),'bundle.mind');await ar('publish',bundle);await post('/api/game',{id,action:'start'},adminToken);
const student=await fetch(base+'/api/game?id='+id,auth(team.token)).then(r=>r.json());assert.ok(!JSON.stringify(student).includes('sqrt(6)'));assert.ok(!JSON.stringify(student).includes('문제은행 검증용 장소'));
const discovered=await ar('discover',{targetId:target.id},team.token);assert.equal(discovered.card,null);assert.ok(discovered.question.image);
assert.equal((await fetch(base+discovered.question.image,auth(team.token))).status,200);
const wrong=await ar('answer',{targetId:target.id,answer:'2'},team.token);assert.equal(wrong.correct,false);
await new Promise(r=>setTimeout(r,1300));
const correct=await ar('answer',{targetId:target.id,answer:'2√(6)/2'},team.token);assert.equal(correct.correct,true);assert.ok(correct.card);
console.log('PASS: teacher-only 100-question bank; protected PNG/answers; bank image upload→discovery→equivalent radical answer→card reveal');
// A second clean setup class for browser QA, with no fake tracking files.
const fixture=await post('/api/game',{action:'create',mode:'ar',title:'문제은행 화면 확인',names:['1모둠','2모둠','3모둠','4모둠','5모둠'],pin:'246810',cardCount:100,searchMinutes:60,solveMinutes:10,allNumbers:false});
fs.writeFileSync('.sites-runtime/problem-bank-ui.json',JSON.stringify({id:fixture.id,adminToken:fixture.adminToken}));
