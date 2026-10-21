const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function createProblemBank({session,onError}){
 const endpoint='/api/problem-bank?id='+encodeURIComponent(session.id||''),headers=()=>({Authorization:'Bearer '+session.token});
 let problems=null,selected=null,selectedBlob=null,objectURL=null,onChoose=null,epoch=0,page=0,opening=0;
 const pageSize=40;
 const dialog=node('dialog',null,'problem-bank-dialog');dialog.setAttribute('aria-label','교사용 수학 문제은행');
 const head=node('header',null,'bank-header'),title=node('div');title.append(node('p','TEACHER QUESTION LIBRARY','eyebrow'),node('h2','수학 문제은행'));
 const close=node('button','닫기','secondary');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);
 const intro=node('p','영역과 난이도로 고른 뒤 문제 이미지와 정답을 함께 가져오세요. 정답·풀이·출처는 교사만 확인합니다.','bank-intro');
 const filters=node('div',null,'bank-filters'),subject=node('select'),difficulty=node('select'),unit=node('select'),edition=node('select'),search=node('input');
 edition.setAttribute('aria-label','문제 출처');
 unit.setAttribute('aria-label','단원');
 subject.setAttribute('aria-label','영역');difficulty.setAttribute('aria-label','난이도');search.type='search';search.placeholder='단원 또는 문제 이름 검색';search.setAttribute('aria-label','문제 검색');
 for(const s of ['전체 영역','수학Ⅰ','수학Ⅱ','확률과 통계','미적분','기하']){const o=node('option',s);o.value=s==='전체 영역'?'':s;subject.append(o);}
 for(const s of ['전체 난이도','기본 응용','심화 응용','도전']){const o=node('option',s);o.value=s==='전체 난이도'?'':s;difficulty.append(o);}
 for(const s of ['전체 출처','수능특강','수능완성','자체 제작']){const o=node('option',s);o.value=s==='전체 출처'?'':s;edition.append(o);}
 filters.append(edition,subject,difficulty,unit,search);
 const options=node('div',null,'bank-options'),uniqueLabel=node('label'),unique=node('input');unique.type='checkbox';uniqueLabel.append(unique,document.createTextNode('비슷한 변형은 묶어 유형별 1문항만 보기'));
 const random=node('button','무작위 한 문제','secondary');random.type='button';options.append(uniqueLabel,random);
 const summary=node('p',null,'bank-status');summary.setAttribute('role','status');
 const body=node('div',null,'bank-body'),list=node('div',null,'bank-list'),detail=node('section',null,'bank-detail');list.setAttribute('aria-label','문제 목록');
 const empty=node('p','왼쪽 목록에서 문제를 선택하세요. 휴대폰에서는 목록 아래에 미리보기가 열립니다.','bank-empty');
 const listColumn=node('div',null,'bank-list-column'),pagination=node('nav',null,'bank-pagination'),prev=node('button','이전','secondary'),next=node('button','다음','secondary'),pageLabel=node('span');prev.type=next.type='button';pagination.setAttribute('aria-label','문제 목록 페이지');pagination.append(prev,pageLabel,next);listColumn.append(list,pagination);
 detail.append(empty);body.append(listColumn,detail);dialog.append(head,intro,filters,options,summary,body);document.body.append(dialog);
 async function request(query){const r=await fetch(endpoint+query,{headers:headers(),cache:'no-store'});if(!r.ok){let d;try{d=await r.json();}catch{}throw Error(d?.error||'문제를 불러오지 못했어요.');}return r;}
 function updateUnits(){const old=unit.value;unit.replaceChildren();const all=node('option','전체 단원');all.value='';unit.append(all);for(const value of [...new Set((problems||[]).filter(p=>(!subject.value||p.subject===subject.value)&&(!edition.value||p.edition===edition.value)).map(p=>p.unit))]){const o=node('option',value);o.value=value;unit.append(o);}if([...unit.options].some(o=>o.value===old))unit.value=old;}
 function filtered(){const q=search.value.trim().toLowerCase(),entries=(problems||[]).filter(p=>(!edition.value||p.edition===edition.value)&&(!subject.value||p.subject===subject.value)&&(!difficulty.value||p.difficulty===difficulty.value)&&(!unit.value||p.unit===unit.value)&&(!q||[p.title,p.unit,p.id,p.sourceCode].join(' ').toLowerCase().includes(q)));if(!unique.checked)return entries;const families=new Map();for(const p of entries){const key=p.familyId||p.id,previous=families.get(key);if(!previous||(previous.inUse&&!p.inUse))families.set(key,p);}return [...families.values()];}
 function renderList(){const entries=filtered(),pages=Math.max(1,Math.ceil(entries.length/pageSize));page=Math.max(0,Math.min(page,pages-1));list.replaceChildren();summary.textContent=`전체 ${(problems?.length||0).toLocaleString('ko-KR')}문항 · 현재 ${entries.length.toLocaleString('ko-KR')}문항${unique.checked?' (유형별 대표)':''} · 사용 중 ${(problems||[]).filter(p=>p.inUse).length}문항`;pageLabel.textContent=`${page+1} / ${pages} 페이지`;prev.disabled=page===0;next.disabled=page===pages-1;random.disabled=!entries.some(p=>!p.inUse);
  if(!entries.length){list.append(node('p','조건에 맞는 문제가 없어요. 필터를 바꿔보세요.'));return;}
  for(const p of entries.slice(page*pageSize,(page+1)*pageSize)){const b=node('button',null,'bank-item');b.type='button';b.disabled=!!p.inUse;b.setAttribute('aria-pressed',String(selected?.id===p.id));b.append(node('span',`${p.edition||''} · ${p.subject} · ${p.unit}`,'bank-unit'),node('strong',p.title),node('span',`${p.difficulty} · 약 ${p.minutes}분 · ${p.id.toUpperCase()}${p.variant?' · 변형 '+p.variant:''}`,'bank-meta'));if(p.inUse)b.append(node('span','이 수업에서 사용 중','bank-used'));b.onclick=()=>void show(p.id);list.append(b);}
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
   answer.append(solution,node('p',`${p.source.book}${p.source.page&&p.source.page!=='—'?' · '+p.source.page+'쪽':''} · ${p.source.code}${p.source.section?' · '+p.source.section:''}`,'bank-source'),node('p',p.source.adaptation,'bank-source'));detail.append(heading,actions,img,answer);
   if(innerWidth<700)detail.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(version===epoch)detail.replaceChildren(node('p',e.message,'bank-empty'));}
 }
 function changeFilter(){epoch++;page=0;selected=null;selectedBlob=null;detail.replaceChildren(empty);renderList();list.scrollTop=0;}
 for(const c of [subject,edition])c.addEventListener('input',()=>{unit.value='';updateUnits();changeFilter();});
 for(const c of [difficulty,unit,search,unique])c.addEventListener('input',changeFilter);
 prev.onclick=()=>{page--;renderList();list.scrollTop=0;};next.onclick=()=>{page++;renderList();list.scrollTop=0;};
 random.onclick=()=>{const entries=filtered(),available=entries.filter(p=>!p.inUse);if(!available.length)return;const p=available[Math.floor(Math.random()*available.length)];page=Math.floor(entries.indexOf(p)/pageSize);renderList();void show(p.id);};
 dialog.addEventListener('close',()=>{epoch++;opening++;if(!selected)detail.replaceChildren(empty);});
 return {async open(callback,{targetId=''}={}){onChoose=callback;const version=++opening;epoch++;problems=null;selected=null;selectedBlob=null;page=0;list.replaceChildren();detail.replaceChildren(empty);random.disabled=prev.disabled=next.disabled=true;pageLabel.textContent='';dialog.showModal();summary.textContent='이 수업의 문제 사용 현황을 확인하고 있어요.';try{const d=await(await request('&excludeTarget='+encodeURIComponent(targetId))).json();if(version!==opening)return;problems=d.problems;const counts=Object.fromEntries(['수능특강','수능완성','자체 제작'].map(e=>[e,problems.filter(p=>p.edition===e).length]));intro.textContent=`수능특강 ${counts['수능특강']} · 수능완성 ${counts['수능완성']} · 자체 제작 ${counts['자체 제작']}문항. 같은 수업에서 사용 중인 문제는 다시 선택할 수 없습니다. 정답·풀이·출처는 교사만 확인합니다.`;updateUnits();renderList();}catch(e){if(version===opening)summary.textContent=e.message;}}};
}
