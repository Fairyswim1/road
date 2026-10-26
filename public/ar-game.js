import {photoFile,compilePhoto,combineTargets,startVision,prepareVision} from './ar-vision.js';
import {createProblemBank} from './problem-bank.js';
import {attachMathKeypad} from './math-keypad.js';
import {loadRecognitionBundle} from './ar-bundle.js';
const $=id=>document.getElementById(id),p=new URLSearchParams(location.hash.slice(1));
const session={id:p.get('g'),token:p.get('a')||p.get('t')};
const api='/api/game-ar?id='+encodeURIComponent(session.id||'');
const headers=()=>({Authorization:'Bearer '+session.token});
const shapes={NS:'세로',EW:'가로',NE:'위·오른쪽',ES:'오른쪽·아래',SW:'아래·왼쪽',NW:'위·왼쪽'};
let view,blob,previewURL,busy=false,vision,abort,scanStarting=false,found=-1,detected=null,findTimer,refreshTimer,discoverBusy=false,versionSeen=-1,urls=[],activeTarget=null;
let problemBlob=null,bankProblemId=null,problemPreviewURL=null,questionImagePath=null,questionImageURL=null,imageEpoch=0,imageZoom=1;
const message=t=>{$('message').textContent=t;$('message').hidden=!t;};
const bank=createProblemBank({session,onError:message});
const mathKeypad=attachMathKeypad($('answer-input'),$('math-answer-controls'));
$('bank-open').onclick=()=>{if(busy||view?.role!=='admin'||view.game.phase!=='setup')return;void bank.open(async entry=>{if(view.game.phase!=='setup')throw Error('수색 시작 전만 문제를 바꿀 수 있어요.');clearProblemUpload();bankProblemId=entry.id;problemBlob=entry.blob;problemPreviewURL=URL.createObjectURL(entry.blob);$('problem-preview').src=problemPreviewURL;$('problem-preview').hidden=false;$('problem-remove').hidden=false;$('question').value='';$('answers').value=entry.answer;$('bank-selection').textContent=`선택: ${entry.subject} · ${entry.title} · ${entry.difficulty}`;$('bank-selection').hidden=false;message('문제 이미지와 정답을 가져왔습니다. 물건 사진과 보상 카드를 정한 뒤 숨기기를 눌러주세요.');});};
async function response(r){const text=await r.text();let d;try{d=JSON.parse(text);}catch{throw Object.assign(new Error(r.status===413?'인식 데이터가 너무 큽니다. 물건 수를 줄여주세요.':'서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'),{status:r.status});}if(!r.ok)throw Object.assign(new Error(d.error||'요청을 처리하지 못했습니다.'),{status:r.status});return d;}
async function arCall(action,body){return response(await fetch(api+'&action='+action,{method:'POST',headers:body instanceof FormData?headers():{...headers(),'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)}));}
async function gameCall(action,extra={}){return response(await fetch('/api/game',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({action,id:session.id,...extra})}));}
function acceptView(next){
 if(view&&(next.revision<view.revision||(next.revision===view.revision&&next.serverNow<view.serverNow)))return;
 view=next;render();
}
async function refresh(){acceptView(await response(await fetch('/api/game?id='+session.id,{headers:headers(),cache:'no-store'})));}
let haltState='';
function updateSearchNotice(){
 const g=view.game,state=view.role==='team'?(g.phase==='search'&&g.searchPausedMs!=null?'paused':g.phase==='solve'||g.phase==='ended'?'ended':''):'';
 $('search-halt-banner').hidden=!state;
 if(state){const title=state==='paused'?'수색 일시 정지':'수색 종료';$('search-halt-title').textContent=title;$('search-halt-label').textContent=title;}
 if(state!==haltState){haltState=state;if(state){close();$('search-halt-dialog').showModal();}else $('search-halt-dialog').close();}
}
$('search-halt-confirm').onclick=()=>$('search-halt-dialog').close();
$('search-halt-dialog').addEventListener('cancel',e=>e.preventDefault());
function backLink(){return '/#g='+session.id+'&'+(view.role==='admin'?'a':'t')+'='+session.token;}
function canSearch(){return view?.role==='team'&&view.game.phase==='search'&&view.game.searchPausedMs==null&&view.game.teams[0].status==='searching'&&view.game.searchEndsAt>view.serverNow;}
function cardNode(card){const d=document.createElement('div');d.className='own-card';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');const ports={N:[50,0],S:[50,100],E:[100,50],W:[0,50]};for(const side of card.shape){const l=document.createElementNS(svg.namespaceURI,'line');Object.entries({x1:50,y1:50,x2:ports[side][0],y2:ports[side][1],stroke:'currentColor','stroke-width':4}).forEach(([k,v])=>l.setAttribute(k,String(v)));svg.append(l);}const b=document.createElement('b');b.textContent=card.value;d.append(svg,b);return d;}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function updateButtons(){const blocked=view?.role==='team'&&!canSearch();const ready=detected?.card&&!busy&&!blocked;$('claim').hidden=!!detected?.question;$('question-form').hidden=!detected?.question;$('answer-submit').disabled=busy||blocked;$('answer-input').disabled=busy||blocked;mathKeypad.setDisabled(busy||blocked);$('claim').disabled=!ready;$('claim').textContent=ready?'발견한 카드 획득하기':'카드를 찾아보세요';const showingProblem=!!(detected?.question||detected?.card);$('precision-controls').hidden=showingProblem;$('precision-scan').disabled=blocked||photoBusy||!vision;$('resume-scan').disabled=blocked||photoBusy||!vision;$('precision-scan').textContent=photoBusy?'사진을 분석하는 중…':'멈춰서 정밀 인식';}
function render(){
 const admin=view.role==='admin',g=view.game;$('teacher').hidden=!admin;$('student').hidden=admin;$('heading').textContent=admin?'물건에 카드를 숨기세요.':g.teams[0].name+'의 탐색';$('role').textContent=admin?'TEACHER · AR SETUP':'OUR TEAM';$('subtitle').textContent=g.title;
 for(const id of ['back','admin-back','student-back'])$(id).href=backLink();
 if(admin){
  const ar=g.ar,locked=g.phase!=='setup';
  $('placement-summary').textContent=`${ar.targets.length}개 물건 · ${ar.targets.reduce((n,t)=>n+t.cards.length,0)}장 배치 / 준비 ${g.cards.length}장 · ${ar.ready?'탐색 데이터 저장 완료':'배치 완료 후 저장 필요'}`;
  $('publish').disabled=busy||locked||!ar.targets.length||ar.ready;$('place').disabled=busy||locked||!blob;
  for(const id of ['label','photo','cards','auto-count','auto','edit','edit-card','edit-value','edit-shape','question','answers','problem-image','problem-remove','bank-open'])$(id).disabled=busy||locked;
  if(versionSeen!==ar.version){versionSeen=ar.version;renderTargets();}
 }else{
  $('phase').textContent=canSearch()?'수색 중 · 남은 시간 '+Math.max(0,Math.ceil((g.searchEndsAt-view.serverNow)/60000))+'분':g.phase==='search'&&g.searchPausedMs!=null?'수색 일시 정지 · 남은 시간 '+Math.ceil(g.searchPausedMs/60000)+'분 · 선생님의 재개 신호를 기다려주세요.':g.phase==='setup'?'선생님의 시작 신호를 기다려주세요.':'수색 종료 · 관리자 패드에서 수식로드를 완성하세요.';
  $('practice-link').href=backLink()+'&practice=1';$('practice-link').hidden=g.phase==='setup';$('scan').disabled=!canSearch()||busy||scanStarting;$('own-count').textContent=g.cards.length+'장';$('own-cards').replaceChildren(...g.cards.map(cardNode));if(!g.cards.length){const p=document.createElement('p');p.textContent='아직 획득한 카드가 없어요.';$('own-cards').append(p);}
  if(!canSearch()&&(vision||scanStarting)){close();message(g.searchPausedMs!=null?'수색이 일시 정지됐어요. 재개되면 AR 탐색을 다시 시작하세요.':'수색이 종료됐습니다. 모은 카드는 저장되어 있어요.');}
 }
 updateSearchNotice();
 updateButtons();
}
function fillCards(){const g=view.game,assigned=new Set(g.ar.targets.flatMap(t=>t.cards));$('cards').replaceChildren(...g.cards.filter(c=>!assigned.has(c.id)).map(c=>option(c.id,`${c.id} · ${c.value} · ${shapes[c.shape]}`)));selectRandomCards();$('edit-card').replaceChildren(...g.cards.map(c=>option(c.id,`${c.id} · ${c.value} · ${shapes[c.shape]}`)));editSelection();}
async function renderTargets(){fillCards();for(const u of urls)URL.revokeObjectURL(u);urls=[];$('targets').replaceChildren();const version=versionSeen;
 for(const t of view.game.ar.targets){const el=document.createElement('article');el.className='target';const h=document.createElement('h3');h.textContent=t.label;const description=document.createElement('p');description.textContent=t.cards.map(id=>{const c=view.game.cards.find(c=>c.id===id);return `${id}번 ${c?.value} (${shapes[c?.shape]})`;}).join(' · ');const button=document.createElement('button');button.textContent='배치 해제';button.className='secondary';button.disabled=view.game.phase!=='setup';button.onclick=async()=>{if(busy||!confirm('이 물건의 배치를 해제할까요? 카드는 준비 목록으로 돌아갑니다.'))return;busy=true;try{await arCall('remove',{targetId:t.id});await refresh();}catch(e){message(e.message);}finally{busy=false;render();}};el.append(h,description,button);
 const details=problemEditor(t,version);el.append(details);$('targets').append(el);
 fetch(api+'&asset=photo&target='+t.id,{headers:headers()}).then(async r=>{if(!r.ok)return;const b=await r.blob();if(versionSeen!==version)return;const u=URL.createObjectURL(b);urls.push(u);const img=new Image();img.alt='교사용 '+t.label;img.src=u;el.prepend(img);}).catch(()=>{});
 }}
async function problemImageFile(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25000000)throw new Error('25MB 이하 JPG·PNG·WebP 그림을 골라주세요.');
 const u=URL.createObjectURL(file);try{const img=new Image();img.src=u;await img.decode();const ratio=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);const b=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));if(!b||b.size>4000000)throw new Error('문제 그림이 너무 큽니다. 필요한 문제 부분만 잘라서 올려주세요.');return b;}finally{URL.revokeObjectURL(u);}
}
function problemEditor(t,version){
 const details=document.createElement('details'),summary=document.createElement('summary'),form=document.createElement('form'),q=document.createElement('textarea'),ans=document.createElement('textarea'),save=document.createElement('button'),file=document.createElement('input'),preview=new Image(),remove=document.createElement('input');let replacement=null,replacementBankId=t.bankProblemId||null,localURL;
 summary.textContent='수학문제 · 정답 확인/수정';q.value=t.question||'';q.maxLength=2000;q.rows=4;ans.value=(t.answers||[]).join('\n');ans.required=true;ans.rows=2;save.textContent='문제 저장';save.disabled=view.game.phase!=='setup';file.type='file';file.accept='image/jpeg,image/png,image/webp';preview.className='problem-preview';preview.alt='등록된 문제 그림';preview.hidden=true;remove.type='checkbox';
 function label(text,control){const l=document.createElement('label');l.textContent=text;l.append(control);return l;}
 const removeLabel=label('기존 문제 그림 삭제',remove);removeLabel.hidden=!t.problemImage;
 const bankButton=document.createElement('button');bankButton.type='button';bankButton.className='secondary';bankButton.textContent='문제은행에서 교체하기';bankButton.disabled=view.game.phase!=='setup';bankButton.onclick=()=>{if(busy||view.game.phase!=='setup')return;void bank.open(async entry=>{if(view.game.phase!=='setup')throw Error('수색 시작 전만 문제를 바꿀 수 있어요.');replacement=entry.blob;replacementBankId=entry.id;if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(replacement);urls.push(localURL);preview.src=localURL;preview.hidden=false;remove.checked=false;q.value='';ans.value=entry.answer;message('새 문제를 가져왔습니다. 문제 저장을 눌러 적용하세요.');},{targetId:t.id});};
 form.append(bankButton,label('학생에게 보여줄 문제 (그림만 올려도 됩니다)',q),label('문제 그림 추가/교체',file),preview,removeLabel,label('정답 (한 줄에 하나)',ans),save);
 if(t.problemImage)fetch(api+'&asset=problem&target='+t.id,{headers:headers()}).then(async r=>{if(!r.ok)return;const b=await r.blob();if(versionSeen!==version||replacement||remove.checked)return;const u=URL.createObjectURL(b);urls.push(u);preview.src=u;preview.hidden=false;}).catch(()=>{});
 file.onchange=async()=>{if(!file.files[0])return;busy=true;render();save.disabled=true;try{replacement=await problemImageFile(file.files[0]);replacementBankId=null;if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(replacement);urls.push(localURL);preview.src=localURL;preview.hidden=false;remove.checked=false;}catch(e){file.value='';message(e.message);}finally{busy=false;render();save.disabled=view.game.phase!=='setup';}};
 remove.onchange=()=>{if(remove.checked){replacement=null;replacementBankId=null;file.value='';preview.hidden=true;}else if(preview.src)preview.hidden=false;};
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=true;try{const f=new FormData();f.append('targetId',t.id);f.append('bankProblemId',replacementBankId||'');f.append('question',q.value);f.append('answers',JSON.stringify(answerLines(ans.value)));f.append('removeImage',String(remove.checked));if(replacement)f.append('problemImage',replacement,'problem.jpg');await arCall('problem',f);await refresh();message('문제와 정답을 저장했습니다.');}catch(e){message(e.message);}finally{busy=false;render();save.disabled=view.game.phase!=='setup';}};
 details.append(summary,form);return details;
}
function clearProblemUpload(){$('bank-selection').hidden=true;bankProblemId=null;problemBlob=null;$('problem-image').value='';$('problem-preview').hidden=true;$('problem-remove').hidden=true;if(problemPreviewURL)URL.revokeObjectURL(problemPreviewURL);problemPreviewURL=null;}
$('problem-remove').onclick=clearProblemUpload;
$('problem-image').onchange=async()=>{if(!$('problem-image').files[0])return;busy=true;render();try{problemBlob=await problemImageFile($('problem-image').files[0]);bankProblemId=null;$('bank-selection').hidden=true;if(problemPreviewURL)URL.revokeObjectURL(problemPreviewURL);problemPreviewURL=URL.createObjectURL(problemBlob);$('problem-preview').src=problemPreviewURL;$('problem-preview').hidden=false;$('problem-remove').hidden=false;}catch(e){clearProblemUpload();message(e.message);}finally{busy=false;render();}};
function clearQuestionImage(){imageEpoch++;questionImagePath=null;if(questionImageURL)URL.revokeObjectURL(questionImageURL);questionImageURL=null;$('question-image-open').hidden=true;$('question-image').removeAttribute('src');$('image-large').removeAttribute('src');$('question-image-status').textContent='';$('image-dialog').close();}
async function questionImage(path){
 if(path===questionImagePath)return;clearQuestionImage();if(!path)return;questionImagePath=path;const epoch=imageEpoch;$('question-image-status').textContent='문제 그림을 불러오는 중…';
 try{const r=await fetch(path,{headers:headers()});if(!r.ok)throw new Error();const b=await r.blob();if(epoch!==imageEpoch)return;questionImageURL=URL.createObjectURL(b);$('question-image').src=questionImageURL;$('question-image-open').hidden=false;$('question-image-status').textContent='';}catch{if(epoch!==imageEpoch)return;questionImagePath=null;$('question-image-status').textContent='문제 그림을 불러오지 못했어요. 연결되면 다시 불러옵니다.';}
}
$('question-image-open').onclick=()=>{if(!questionImageURL)return;imageZoom=1;$('image-large').src=questionImageURL;$('image-large').style.width='100%';$('image-dialog').showModal();};
$('image-close').onclick=()=>$('image-dialog').close();
$('image-plus').onclick=()=>{imageZoom=Math.min(4,imageZoom+.5);$('image-large').style.width=imageZoom*100+'%';};
$('image-minus').onclick=()=>{imageZoom=Math.max(1,imageZoom-.5);$('image-large').style.width=imageZoom*100+'%';};
function answerLines(value){return value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
function editSelection(){const c=view?.game.cards.find(c=>c.id===$('edit-card').value);if(c){$('edit-value').value=c.value;$('edit-shape').value=c.shape;}}
$('edit-value').append(...['1','2','3','4','5','6','7','8','9','10','+','-','×','÷'].map(v=>option(v,v)));$('edit-shape').append(...Object.entries(shapes).map(([k,v])=>option(k,v)));$('edit-card').onchange=editSelection;
$('edit-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{await gameCall('card_edit',{cardId:$('edit-card').value,value:$('edit-value').value,shape:$('edit-shape').value});versionSeen=-1;await refresh();message('카드 구성을 변경했습니다.');}catch(e){message(e.message);}finally{busy=false;render();}};
function selectRandomCards(){const options=[...$('cards').options],n=Math.min(30,Math.max(1,Math.floor(Number($('auto-count').value)||2)));$('auto-count').value=String(n);for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}options.forEach((o,i)=>o.selected=i<n);}
$('auto').onclick=selectRandomCards;
$('photo').onchange=async()=>{blob=null;try{blob=await photoFile($('photo').files[0]);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);$('preview').src=previewURL;$('preview').hidden=false;message('사진과 숨길 카드를 확인해주세요.');}catch(e){message(e.message);}render();};
$('place-form').onsubmit=async e=>{e.preventDefault();if(busy||!blob)return;if(!$('question').value.trim()&&!problemBlob){message('수학문제를 글이나 그림으로 입력해주세요.');return;}const cards=[...$('cards').selectedOptions].map(o=>o.value);if(!cards.length||cards.length>30){message('배치할 카드를 1~30장 선택해주세요.');return;}busy=true;render();$('progress').hidden=false;message('사진 인식 데이터를 분석합니다. 화면을 켜 둔 채 기다려주세요.');
 try{const target=await compilePhoto(blob,n=>$('progress').value=n),f=new FormData();f.append('photo',blob,'photo.jpg');f.append('target',target,'target.mind');f.append('label',$('label').value);f.append('bankProblemId',bankProblemId||'');f.append('question',$('question').value);if(problemBlob)f.append('problemImage',problemBlob,'problem.jpg');f.append('answers',JSON.stringify(answerLines($('answers').value)));f.append('cards',JSON.stringify(cards));f.append('version',String(view.game.ar.version));await arCall('upload',f);blob=null;clearProblemUpload();$('place-form').reset();$('preview').hidden=true;await refresh();message('물건에 카드를 숨겼습니다. 다음 물건을 등록하거나 배치 완료를 눌러주세요.');}catch(e){message(e.message);}finally{busy=false;$('progress').hidden=true;render();}};
$('publish').onclick=async()=>{if(busy)return;busy=true;render();message('등록된 장소의 탐색 준비를 완료합니다.');try{await arCall('publish',{version:view.game.ar.version});await refresh();message('준비 완료! 관리자 화면으로 돌아가 모둠 링크를 나눠주고 수색을 시작하세요.');}catch(e){message(e.message);}finally{busy=false;render();}};
let scanTargets=[],scanEpoch=0,photoBusy=false;
function close(){photoBusy=false;clearQuestionImage();scanEpoch++;clearTimeout(findTimer);abort?.abort();abort=null;vision?.stop();vision=null;scanStarting=false;found=-1;detected=null;activeTarget=null;discoverBusy=false;$('question-form').hidden=true;$('reward').hidden=true;$('camera').hidden=true;document.body.classList.remove('scanning');updateButtons();}
function present(d,index){
 const previous=detected;detected=d;if(!d.question)clearQuestionImage();
 if(d.question){activeTarget=d.question.targetId;vision?.clear();$('reward').hidden=true;$('question-text').textContent=d.question.prompt;void questionImage(d.question.image||null);if(previous?.question?.targetId!==d.question.targetId){$('answer-input').value='';mathKeypad.reset();$('answer-feedback').textContent='';}$('camera-state').textContent='수학문제 발견';$('camera-help').textContent='정답을 맞히면 숨겨진 카드가 나타납니다.';}
 else if(d.card){activeTarget=scanTargets[index]?.id||activeTarget;if(found===index)vision?.show(index,d.card);$('reward').replaceChildren(cardNode(d.card));$('reward').hidden=false;$('camera-state').textContent='정답 확인 · 카드 발견';$('camera-help').textContent='카드를 획득해 우리 모둠 보관함에 넣으세요.';}
 else{activeTarget=null;vision?.clear();$('reward').hidden=true;$('camera-state').textContent=d.claimed?'이 장소 획득 완료':'탐색 중';$('camera-help').textContent=d.claimed?'우리 모둠은 이 장소에서 이미 1장을 획득했어요. 다른 장소를 찾아보세요.':'물건 앞면을 중앙에 비춰주세요. 안 잡히면 ‘멈춰서 정밀 인식’을 눌러주세요.';}
 updateButtons();
}
async function discover(){const index=activeTarget?scanTargets.findIndex(t=>t.id===activeTarget):found,epoch=scanEpoch;if(index<0||discoverBusy||busy||!vision)return;discoverBusy=true;
 try{const d=await arCall('discover',{targetId:scanTargets[index].id});if(epoch!==scanEpoch||(!activeTarget&&found!==index))return;present(d,index);}
 catch(e){if(epoch!==scanEpoch)return;detected=null;vision?.clear();$('reward').hidden=true;updateButtons();if(e.status===409){close();await refresh();}else $('camera-help').textContent='연결을 확인해주세요. 카드가 확인되면 다시 표시됩니다.';}finally{if(epoch===scanEpoch)discoverBusy=false;}}
$('question-form').onsubmit=async e=>{e.preventDefault();if(busy||!detected?.question)return;const targetId=detected.question.targetId,epoch=scanEpoch;busy=true;updateButtons();try{const d=await arCall('answer',{targetId,answer:$('answer-input').value});if(epoch!==scanEpoch)return;if(d.correct===false){$('answer-feedback').textContent=d.message;return;}$('answer-input').blur();present(d,scanTargets.findIndex(t=>t.id===targetId));}catch(e){if(epoch===scanEpoch)$('answer-feedback').textContent=e.message;}finally{busy=false;updateButtons();}};
$('question-cancel').onclick=()=>{clearTimeout(findTimer);found=-1;activeTarget=null;present({card:null,code:null},-1);vision?.resume();};
async function startScan(){if(scanStarting||vision||!canSearch())return;message('');scanStarting=true;const epoch=++scanEpoch;abort=new AbortController();const signal=abort.signal;$('camera').hidden=false;document.body.classList.add('scanning');$('camera-state').textContent='카메라 준비 중';$('camera-help').textContent='카메라 접근을 허용해주세요.';
 try{void prepareVision().catch(()=>{});const meta=await response(await fetch(api,{headers:headers(),signal}));const b=await loadRecognitionBundle({url:api+'&asset=bundle',headers:headers(),version:meta.bundleVersion,signal,combine:combineTargets,onStage(stage){if(epoch!==scanEpoch)return;const labels={download:'인식 데이터 불러오는 중',combine:'인식 데이터 준비 중 · 처음 한 번만 필요해요',saving:'휴대폰에 인식 데이터 저장 중',cached:'저장된 인식 데이터 사용 · 카메라 준비 중',saved:'인식 데이터 저장 완료 · 카메라 준비 중',session:'카메라 준비 중 · 이 화면에서는 데이터를 재사용해요'};$('camera-help').textContent=labels[stage]||'탐색 준비 중';},onProgress(done,total){if(epoch===scanEpoch)$('camera-help').textContent=`탐색 준비 중 · ${done}/${total}`;}});if(epoch!==scanEpoch)return;scanTargets=meta.targets;
 const started=await startVision({container:$('ar-container'),blob:b,bundleVersion:meta.bundleVersion,count:scanTargets.length,signal,onStatus(text){if(epoch===scanEpoch&&!activeTarget)$('camera-help').textContent=text;},onFound(index){if(epoch!==scanEpoch||!canSearch()||activeTarget)return;found=index;activeTarget=scanTargets[index].id;$('camera-state').textContent='물건 인식 완료';$('camera-help').textContent='수학문제를 불러옵니다.';void discover();}});
 if(epoch!==scanEpoch){started.stop();return;}vision=started;$('camera-state').textContent='탐색 중';$('camera-help').textContent='물건 앞면을 중앙에 비춰주세요. 안 잡히면 ‘멈춰서 정밀 인식’을 눌러주세요.';

 }catch(e){if(epoch===scanEpoch){close();message(e?.message||'카메라를 열지 못했습니다. 브라우저의 카메라 권한을 확인해주세요.');}}finally{if(epoch===scanEpoch){scanStarting=false;render();}}}
$('scan').onclick=()=>void startScan();
$('precision-scan').onclick=async()=>{if(photoBusy||!vision||!canSearch()||activeTarget)return;const epoch=scanEpoch,current=vision;photoBusy=true;updateButtons();try{await current.capture();}finally{if(epoch===scanEpoch){photoBusy=false;updateButtons();}}};
$('resume-scan').onclick=()=>{if(photoBusy||!vision||!canSearch())return;found=-1;activeTarget=null;detected=null;vision.resume();$('camera-state').textContent='탐색 중';$('camera-help').textContent='반사광을 피해 물건 앞면을 비춰주세요.';updateButtons();};
$('claim').onclick=async()=>{if(busy||!detected?.code)return;const code=detected.code;busy=true;updateButtons();try{acceptView(await gameCall('claim',{code}));detected=null;activeTarget=null;$('reward').hidden=true;vision?.clear();render();$('camera-help').textContent='획득 완료! 우리 모둠 보관함에 저장했습니다. 이제 다른 장소를 찾아보세요.';}catch(e){detected=null;activeTarget=null;$('reward').hidden=true;vision?.clear();$('camera-help').textContent=e.message;}finally{busy=false;updateButtons();}};
$('close').onclick=()=>{close();render();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){close();}else void refresh().catch(e=>message(e.message));});window.addEventListener('pagehide',()=>{clearInterval(refreshTimer);close();for(const u of urls)URL.revokeObjectURL(u);});
try{if(!session.id||!session.token)throw new Error('관리자 또는 모둠 참여 링크에서 AR 화면을 열어주세요.');await refresh();if(view.game.mode!=='ar')throw new Error('새 AR 수업을 만들어주세요.');const autoScan=new URLSearchParams(location.search).get('scan')==='1';if(autoScan){const url=new URL(location.href);url.searchParams.delete('scan');history.replaceState(null,'',url.pathname+url.search+url.hash);if(canSearch()&&!document.hidden)void startScan();}refreshTimer=setInterval(()=>{if(document.hidden||(busy&&view.role==='admin'))return;void refresh().catch(()=>{message('인터넷 연결을 확인해주세요.');detected=null;vision?.clear();updateButtons();});void discover();},2000);}catch(e){message(e.message);$('heading').textContent='수업 링크를 확인해주세요.';}
