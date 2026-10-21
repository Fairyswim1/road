import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
const create=await fetch(base+'/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',mode:'ar',title:'수능완성 추가 검증',names:['1모둠','2모둠'],pin:'246810',cardCount:12,searchMinutes:20,solveMinutes:10,allNumbers:false})});assert.equal(create.status,200);
const g=await create.json(),headers={Authorization:'Bearer '+g.adminToken},bank=base+'/api/problem-bank?id='+g.id;
const list=await fetch(bank,{headers}).then(r=>r.json());assert.equal(list.count,1060);const addition=list.problems.filter(p=>p.edition==='수능완성');assert.equal(addition.length,60);assert.equal(addition.filter(p=>p.difficulty==='도전').length,25);
const question=addition.find(p=>p.id==='wc-geo-012');assert.ok(question);const detail=await fetch(bank+'&entry='+question.id,{headers}).then(r=>r.json());assert.equal(detail.source.code,'26056-1150');assert.match(detail.source.section,/5회.*30번/);
const pic=await fetch(bank+'&image='+question.id,{headers});assert.equal(pic.status,200);const image=await pic.blob();
function upload(version,card){const f=new FormData();f.set('version',String(version));f.set('label','수능완성 검증 장소');f.set('photo',new Blob([new Uint8Array(200).fill(card+1)]),'object.jpg');f.set('target',new Blob([new Uint8Array(200)]),'object.mind');f.set('cards',JSON.stringify([g.game.cards[card].id]));f.set('question','');f.set('answers',JSON.stringify([detail.answer]));f.set('problemImage',image,'question.png');f.set('bankProblemId',question.id);return f;}
const url=base+'/api/game-ar?id='+g.id+'&action=upload';assert.equal((await fetch(url,{method:'POST',headers,body:upload(0,0)})).status,200);const duplicate=await fetch(url,{method:'POST',headers,body:upload(1,1)});assert.equal(duplicate.status,409);assert.match((await duplicate.json()).error,/이미 사용 중/);
const updated=await fetch(bank,{headers}).then(r=>r.json());assert.equal(updated.problems.find(p=>p.id===question.id).inUse,true);
fs.writeFileSync('.sites-runtime/completion-ui.json',JSON.stringify({id:g.id,adminToken:g.adminToken}));
console.log('PASS completion source filter metadata, 25 challenge questions, protected new PNG, AR registration and duplicate prevention');
