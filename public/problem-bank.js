const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function createProblemBank({session,onError}){
 const endpoint='/api/problem-bank?id='+encodeURIComponent(session.id||''),headers=()=>({Authorization:'Bearer '+session.token});
 let problems=null,selected=null,selectedBlob=null,objectURL=null,onChoose=null,epoch=0;
 const dialog=node('dialog',null,'problem-bank-dialog');dialog.setAttribute('aria-label','교사용 수학 문제은행');
 const head=node('header',null,'bank-header'),title=node('div');title.append(node('p','TEACHER QUESTION LIBRARY','eyebrow'),node('h2','수학 문제은행'));
 const close=node('button','닫기','secondary');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);
 const intro=node('p','영역과 난이도로 고른 뒤 문제 이미지와 정답을 함께 가져오세요. 정답·풀이·출처는 교사만 확인합니다.','bank-intro');
 const filters=node('div',null,'bank-filters'),subject=node('select'),difficulty=node('select'),search=node('input');
 subject.setAttribute('aria-label','영역');difficulty.setAttribute('aria-label','난이도');search.type='search';search.placeholder='단원 또는 문제 이름 검색';search.setAttribute('aria-label','문제 검색');
 for(const s of ['전체 영역','수학Ⅰ','수학Ⅱ','확률과 통계','미적분','기하']){const o=node('option',s);o.value=s==='전체 영역'?'':s;subject.append(o);}
 for(const s of ['전체 난이도','기본 응용','심화 응용','도전']){const o=node('option',s);o.value=s==='전체 난이도'?'':s;difficulty.append(o);}
 filters.append(subject,difficulty,search);
 const summary=node('p',null,'bank-status');summary.setAttribute('role','status');
 const body=node('div',null,'bank-body'),list=node('div',null,'bank-list'),detail=node('section',null,'bank-detail');list.setAttribute('aria-label','문제 목록');
 const empty=node('p','왼쪽 목록에서 문제를 선택하세요. 휴대폰에서는 목록 아래에 미리보기가 열립니다.','bank-empty');
 detail.append(empty);body.append(list,detail);dialog.append(head,intro,filters,summary,body);document.body.append(dialog);
 async function request(query){const r=await fetch(endpoint+query,{headers:headers(),cache:'no-store'});if(!r.ok){let d;try{d=await r.json();}catch{}throw Error(d?.error||'문제를 불러오지 못했어요.');}return r;}
 function filtered(){const q=search.value.trim().toLowerCase();return (problems||[]).filter(p=>(!subject.value||p.subject===subject.value)&&(!difficulty.value||p.difficulty===difficulty.value)&&(!q||[p.title,p.unit,p.id].join(' ').toLowerCase().includes(q)));}
 function renderList(){const entries=filtered();list.replaceChildren();summary.textContent=`전체 ${problems?.length||0}문항 · 현재 ${entries.length}문항`;
  if(!entries.length){list.append(node('p','조건에 맞는 문제가 없어요. 필터를 바꿔보세요.'));return;}
  for(const p of entries){const b=node('button',null,'bank-item');b.type='button';b.setAttribute('aria-pressed',String(selected?.id===p.id));b.append(node('span',`${p.subject} · ${p.unit}`,'bank-unit'),node('strong',p.title),node('span',`${p.difficulty} · 약 ${p.minutes}분 · ${p.id.toUpperCase()}`,'bank-meta'));b.onclick=()=>void show(p.id);list.append(b);}
 }
 async function show(id){const version=++epoch;selected=null;selectedBlob=null;detail.replaceChildren(node('p','문제를 불러오고 있어요.','bank-empty'));
  try{const [entryResponse,imageResponse]=await Promise.all([request('&entry='+encodeURIComponent(id)),request('&image='+encodeURIComponent(id))]);const p=await entryResponse.json(),blob=await imageResponse.blob();if(version!==epoch)return;
   if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(blob);selected=p;selectedBlob=blob;renderList();detail.replaceChildren();
   const heading=node('h3',p.title),img=node('img');img.src=objectURL;img.alt=`${p.subject} ${p.title} 문제`;img.className='bank-problem-image';
   const actions=node('div',null,'bank-actions'),choose=node('button','이 문제 가져오기'),download=node('button','이미지 저장','secondary');choose.type=download.type='button';
   choose.onclick=async()=>{if(!selectedBlob)return;choose.disabled=true;try{await onChoose?.({...selected,blob:selectedBlob});dialog.close();}catch(e){onError(e.message);}finally{choose.disabled=false;}};
   download.onclick=()=>{const a=node('a');a.href=objectURL;a.download=`수식로드-${p.id}.png`;a.click();};actions.append(choose,download);
   const answer=node('details',null,'bank-answer'),answerTitle=node('summary','교사용 정답 · 풀이 · 출처');answer.append(answerTitle,node('p','정답: '+p.answer,'bank-answer-value'));
   const solution=node('div',null,'bank-solution');if(p.solutionHtml)solution.innerHTML=p.solutionHtml;else solution.textContent=p.solution;
   answer.append(solution,node('p',`${p.source.book} · ${p.source.page}쪽 · ${p.source.code}`,'bank-source'),node('p',p.source.adaptation,'bank-source'));detail.append(heading,actions,img,answer);
   if(innerWidth<700)detail.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(version===epoch)detail.replaceChildren(node('p',e.message,'bank-empty'));}
 }
 for(const c of [subject,difficulty,search])c.addEventListener('input',renderList);
 dialog.addEventListener('close',()=>{epoch++;});
 return {async open(callback){onChoose=callback;dialog.showModal();if(problems){renderList();return;}summary.textContent='문제은행을 불러오고 있어요.';try{const d=await(await request('')).json();problems=d.problems;renderList();}catch(e){summary.textContent=e.message;}}};
}
