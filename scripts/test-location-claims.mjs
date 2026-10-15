import assert from 'node:assert/strict';
// Local API integration: fake recognition files exercise claims, not physical AR tracking.
const base='http://127.0.0.1:5173';
async function post(path,body,token){
 const form=body instanceof FormData;
 const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
const created=await post('/api/game',{action:'create',mode:'ar',title:'장소별 모둠 획득 검사',names:['A','B','C'],pin:'246810',cardCount:12,searchMinutes:5,solveMinutes:1,allNumbers:false});
assert.equal(created.status,200);
const {id,adminToken,game:g}=created.data,[a,b,c]=g.teams;
const game=(action,extra={},token=adminToken)=>post('/api/game',{id,action,...extra},token);
const ar=(action,body,token=adminToken)=>post(`/api/game-ar?id=${id}&action=${action}`,body,token);
const read=async()=>fetch(`${base}/api/game?id=${id}`,{headers:{Authorization:`Bearer ${adminToken}`}}).then(r=>r.json());
for(const [index,ids] of [[0,[0,1,2]],[1,[3,4]]]){
 const form=new FormData();form.set('target',new Blob([new Uint8Array(200)]),'target.mind');form.set('photo',new Blob([new Uint8Array(200).fill(index)]),'photo.jpg');form.set('version',String(index));form.set('label',`장소 ${index}`);form.set('cards',JSON.stringify(ids.map(i=>g.cards[i].id)));form.set('question','1+1?');form.set('answers','["2"]');
 assert.equal((await ar('upload',form)).status,200);
}
const [first,second]=(await read()).game.ar.targets;
const bundle=new FormData();bundle.set('version','2');bundle.set('target',new Blob([new Uint8Array(200)]),'bundle.mind');
assert.equal((await ar('publish',bundle)).status,200);assert.equal((await game('start')).status,200);
assert.equal((await ar('answer',{targetId:first.id,answer:'2'},a.token)).data.correct,true);
// Two phones in the same team claim DIFFERENT card codes at the same instant.
const race=await Promise.all([0,1].map(i=>game('claim',{code:g.cards[i].secret},a.token)));
assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
let state=(await read()).game;
assert.equal(state.cards.filter(card=>first.cards.includes(card.id)&&card.owner===a.id).length,1);
const own=state.cards.find(card=>card.owner===a.id);
assert.equal((await game('claim',{code:own.secret},a.token)).status,200,'network retry is idempotent');
for(const action of ['discover','answer'])assert.deepEqual((await ar(action,{targetId:first.id,answer:'2'},a.token)).data,{card:null,code:null,claimed:true});
assert.equal((await game('claim',{code:g.cards[2].secret},a.token)).status,409,'known code cannot bypass the limit');
// Other teams still solve independently and each receive one of the remaining cards.
for(const team of [b,c]){
 const question=await ar('discover',{targetId:first.id},team.token);assert.ok(question.data.question);assert.equal(question.data.card,null);
 assert.equal((await ar('answer',{targetId:first.id,answer:'0'},team.token)).data.correct,false);
 const solved=await ar('answer',{targetId:first.id,answer:'2'},team.token);assert.ok(solved.data.card);
 assert.equal((await game('claim',{code:solved.data.code},team.token)).status,200);
}
assert.deepEqual((await ar('discover',{targetId:first.id},a.token)).data,{card:null,code:null,claimed:true});
// The limit is per location, so team A can earn another card elsewhere.
const elsewhere=await ar('answer',{targetId:second.id,answer:'2'},a.token);assert.ok(elsewhere.data.card);
assert.equal((await game('claim',{code:elsewhere.data.code},a.token)).status,200);
state=(await read()).game;
assert.equal(state.cards.filter(card=>card.owner===a.id).length,2);
assert.deepEqual(new Set(state.cards.filter(card=>first.cards.includes(card.id)).map(card=>card.owner)),new Set([a.id,b.id,c.id]));
assert.deepEqual((await ar('discover',{targetId:'unknown'},a.token)).data,{card:null,code:null});
console.log('PASS same-team concurrent different-card claims, idempotent retry, rescan/answer/code bypass blocked, three distinct team rewards, independent locations');
