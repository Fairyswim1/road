import { env } from "cloudflare:workers";
import { database } from "@/db/raw";
import { hasClaimedAtTarget, type Game, type ArSetup } from "@/lib/game";
import { answersEquivalent } from "@/lib/math-answer";
import { findProblem } from '@/lib/problem-bank';
import { imageHash,bankIdForImage,targetProblem,duplicateProblem } from '@/lib/problem-bank-usage';
export const dynamic="force-dynamic";
type Row={id:string;admin_hash:string;state:string;revision:number};
class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
function fail(message:string,status=400):never{throw new ApiError(message,status);}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const hash=async(b:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b))).map(n=>n.toString(16).padStart(2,"0")).join("");
const imageTicket=(key:string,token:string)=>hash(new TextEncoder().encode(key+":"+token));
const secret=()=>crypto.randomUUID().replaceAll("-","");
const normalize=(s:string)=>s.normalize("NFKC").replace(/\s/g,"").replace(/[−–]/g,"-").toLowerCase();
function problem(question:unknown,answers:unknown,hasImage=false){
 if(typeof question!=="string"||(!question.trim()&&!hasImage)||question.length>2000||!Array.isArray(answers)||!answers.length||answers.length>10||answers.some(x=>typeof x!=="string"||!normalize(x)||x.length>100))fail("글 또는 문제 그림과 정답(한 줄에 하나, 최대 10개)을 입력해주세요.");
 return {question:question.trim(),answers:answers.map((s:string)=>s.trim())};
}
async function problemIdentity(targets:ArSetup['targets'],requested:unknown,prepared:{bytes:ArrayBuffer}|null,existing?:ArSetup['targets'][number],removeImage=false){
 const identity=prepared?{problemImageHash:await imageHash(prepared.bytes),bankProblemId:undefined as string|undefined}:existing&&!removeImage?await targetProblem(existing):{};
 if(prepared)identity.bankProblemId=bankIdForImage(identity.problemImageHash!);
 if(requested!==undefined&&requested!==null&&requested!==''){
  if(typeof requested!=='string'||!findProblem(requested)||identity.bankProblemId!==requested)fail('문제은행에서 문제를 다시 가져와주세요.');
 }
 if(await duplicateProblem(targets,identity,existing?.id))fail('이 수업에서 이미 사용 중인 문제입니다. 다른 문제를 선택해주세요.',409);
 return identity;
}
async function discovered(a:Awaited<ReturnType<typeof auth>>,targetId:string){
 const target=a.ar.targets.find(t=>t.id===targetId),card=target?a.g.cards.find(c=>target.cards.includes(c.id)&&!c.owner):undefined;
 if(target&&hasClaimedAtTarget(a.g,target,a.team!.id))return {card:null,code:null,claimed:true};
 if(!target)return {card:null,code:null,removed:true};
 if(!card)return {card:null,code:null,exhausted:true};
 if(!target.solvedBy?.includes(a.team!.id))return {question:{targetId:target.id,prompt:target.question,image:target.problemImage?`/api/game-ar?id=${a.g.id}&asset=problem&target=${target.id}&ticket=${await imageTicket(target.problemImage,a.team!.token!)}`:null},card:null,code:null};
 return {card:{id:card.id,value:card.value,shape:card.shape},code:card.secret};
}
async function auth(req:Request){
 const id=new URL(req.url).searchParams.get("id")||"";
 if(!/^[a-f0-9]{32}$/.test(id))fail("수업 링크를 확인해주세요.",404);
 const row=await database().prepare("SELECT id,admin_hash,state,revision FROM games WHERE id=?").bind(id).first<Row>();if(!row)fail("수업을 찾을 수 없어요.",404);
 const token=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 const g:Game=JSON.parse(row.state),admin=await hash(new TextEncoder().encode(token))===row.admin_hash,team=g.teams.find(t=>t.token===token);
 if(!admin&&!team)fail("접근 권한이 없어요.",403);
 if(g.mode!=="ar"||!g.ar)fail("AR 수업이 아니에요.");
 return {row,g,ar:g.ar,admin,team};
}
function canAppend(g:Game){return g.phase==="search"&&(g.searchPausedMs!=null||!!g.searchEndsAt&&g.searchEndsAt>Date.now());}
function searching(a:Awaited<ReturnType<typeof auth>>){if(a.g.searchPausedMs!=null)fail("수색이 일시 정지됐어요. 선생님이 재개할 때까지 기다려주세요.",409);if(a.g.phase!=="search"||!a.g.searchEndsAt||a.g.searchEndsAt<=Date.now()||(!a.admin&&a.team?.status!=="searching"))fail("수색이 종료됐어요. 보관함으로 돌아가주세요.",409);}
async function save(a:Awaited<ReturnType<typeof auth>>,next:ArSetup){
 a.g.ar=next;
 const r=await database().prepare("UPDATE games SET state=?,revision=revision+1 WHERE id=? AND revision=?").bind(JSON.stringify(a.g),a.row.id,a.row.revision).run();
 if(!r.meta.changes)fail("다른 화면에서 설정이 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
}
function error(e:unknown){return json({error:e instanceof ApiError?e.message:"저장하지 못했어요. 연결을 확인하고 다시 시도해주세요."},e instanceof ApiError?e.status:503);}
export async function GET(req:Request){try{
 const a=await auth(req),url=new URL(req.url),asset=url.searchParams.get("asset");
 if(!asset){
  if(a.admin)return json({version:a.ar.version,ready:a.ar.ready,targets:a.ar.targets});
  searching(a);if(!a.ar.ready)fail("탐색을 준비 중입니다.",409);
  // Recognition IDs only: never return labels, photos, card mappings or ownership.
  return json({version:a.ar.version,bundleVersion:await hash(new TextEncoder().encode(a.ar.bundle||"")),targets:a.ar.targets.map(t=>({id:t.id}))});
 }
 let key:string|undefined;
 if(asset==="bundle"){if(!a.admin)searching(a);if(!a.ar.ready)fail("탐색을 준비 중입니다.",409);key=a.ar.bundle||undefined;
  const expected=url.searchParams.get("bundleVersion");if(expected&&expected!==await hash(new TextEncoder().encode(key||"")))fail("탐색 배치가 변경됐어요. 다시 시작해주세요.",409);
 }
 else if(asset==="problem"){
  const t=a.ar.targets.find(t=>t.id===url.searchParams.get("target"));if(!t?.problemImage)fail("문제 그림을 찾을 수 없어요.",404);
  if(!a.admin){searching(a);if(!a.g.cards.some(c=>t.cards.includes(c.id)&&!c.owner)||url.searchParams.get("ticket")!==await imageTicket(t.problemImage,a.team!.token!))fail("발견한 문제만 열 수 있어요.",403);}
  key=t.problemImage;
 }
 else{if(!a.admin)fail("접근 권한이 없어요.",403);if(asset!=="photo"&&asset!=="target")fail("잘못된 요청입니다.");const t=a.ar.targets.find(t=>t.id===url.searchParams.get("target"));key=t?`${t.key}/${asset}`:undefined;}
 if(!key)fail("파일을 찾을 수 없어요.",404);let o=await env.BUCKET?.get(key);if(!o)fail("파일을 찾을 수 없어요.",404);
 if(asset==="bundle"&&o.customMetadata?.arFormat==="targets-v1"){
  const manifest=await o.json<{parts:string[]}>();
  const part=url.searchParams.get("part");
  // Only counts and opaque immutable part IDs leave the server. Storage keys, labels and cards stay private.
  if(part===null)return json({format:"targets-v1",parts:manifest.parts.length,partVersions:await Promise.all(manifest.parts.map(p=>hash(new TextEncoder().encode(p))))});
  if(!/^\d+$/.test(part)||!Number.isSafeInteger(Number(part))||Number(part)>=manifest.parts.length)fail("인식 데이터를 찾을 수 없어요.",404);
  o=await env.BUCKET!.get(manifest.parts[Number(part)]);if(!o)fail("인식 데이터를 찾을 수 없어요.",404);
 }
 return new Response(o.body,{headers:{"Content-Type":(asset==="photo"||asset==="problem")?(o.httpMetadata?.contentType||"image/jpeg"):"application/octet-stream","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){return error(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")&&req.headers.get("origin")!==new URL(req.url).origin)fail("허용되지 않은 요청입니다.",403);
 const a=await auth(req),action=new URL(req.url).searchParams.get("action");
 if(action==="discover"){
  searching(a);if(!a.team||a.admin)fail("모둠 링크로 접속하세요.",403);
  const raw=await req.text();if(raw.length>300)fail("요청이 너무 큽니다.");const b=JSON.parse(raw);
  // Question only until this team's answer is verified. Exhausted targets reveal nothing.
  return json(await discovered(a,b.targetId));
 }
 if(action==="answer"){
  const raw=await req.text();if(raw.length>500)fail("입력한 답이 너무 깁니다.");const b=JSON.parse(raw);
  if(typeof b.answer!=="string"||b.answer.length>100||!normalize(b.answer))fail("답을 입력해주세요.");
  for(let retry=0;retry<6;retry++){
   const current=retry?await auth(req):a;searching(current);if(!current.team||current.admin)fail("모둠 링크로 접속하세요.",403);
   const target=current.ar.targets.find(t=>t.id===b.targetId);
   if(target&&hasClaimedAtTarget(current.g,target,current.team.id))return json(await discovered(current,target.id));
   if(!target||!current.g.cards.some(c=>target.cards.includes(c.id)&&!c.owner))return json(await discovered(current,b.targetId));
   if(target.solvedBy?.includes(current.team.id))return json(await discovered(current,target.id));
   if(!target.answers.some(x=>answersEquivalent(b.answer,x)))return json({correct:false,message:"다시 생각해보세요. 분수는 /, 루트는 √( )로 입력할 수 있어요."});
   target.solvedBy=[...(target.solvedBy||[]),current.team.id];
   current.g.events.unshift({at:Date.now(),text:`${current.team.name} · ${target.label} 문제 해결`});current.g.events=current.g.events.slice(0,100);
   try{await save(current,current.ar);return json({correct:true,...await discovered(current,target.id)});}catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;}
  }
  fail("잠시 후 답을 다시 제출해주세요.",409);
 }
 if(!a.admin)fail("교사만 사용할 수 있어요.",403);
 if(a.g.phase!=="setup"&&!((action==="upload"||action==="remove")&&canAppend(a.g)))fail("수색 중에는 장소 추가와 배치 해제만 가능해요. 문제 수정은 수색 시작 전에 해주세요.",409);
 if(!env.BUCKET)fail("사진 저장소에 연결하지 못했어요.",503);
 if(action==="publish"&&req.headers.get("content-type")?.startsWith("application/json")){
  const raw=await req.text();if(raw.length>300)fail("잘못된 저장 요청입니다.");const b=JSON.parse(raw);
  if(b.version!==a.ar.version)fail("배치가 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
  if(!a.ar.targets.length)fail("물건을 먼저 등록해주세요.");
  if(a.ar.ready&&a.ar.bundle)return json({ok:true});
  // Recognition files already exist. Publish an immutable ordered index without
  // merging/re-uploading them, so there is no aggregate recognition-size limit.
  const key=`game-ar/${a.g.id}/manifest-${secret()}`;
  await env.BUCKET.put(key,JSON.stringify({parts:a.ar.targets.map(t=>`${t.key}/target`)}),{customMetadata:{arFormat:"targets-v1"}});
  try{await save(a,{...a.ar,ready:true,bundle:key});}catch(e){await env.BUCKET.delete(key);throw e;}
  return json({ok:true});
 }
 if(action==="remove"){
  const raw=await req.text();if(raw.length>300)fail("요청이 너무 큽니다.");const b=JSON.parse(raw);
  if(b.version!==undefined&&b.version!==a.ar.version)fail("배치가 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
  if(!a.ar.targets.some(t=>t.id===b.targetId))fail("등록한 물건이 아니에요.");
  // Replace the ordered recognition index atomically. Keep immutable files for
  // cached clients and cloned lessons, and never alter already collected cards.
  const manifestKey=a.g.phase==="search"?`game-ar/${a.g.id}/manifest-${secret()}`:null;
  try{
   if(manifestKey)await env.BUCKET.put(manifestKey,JSON.stringify({parts:a.ar.targets.filter(t=>t.id!==b.targetId).map(t=>`${t.key}/target`)}),{customMetadata:{arFormat:"targets-v1"}});
   for(let retry=0;retry<6;retry++){
    const current=await auth(req);
    if(current.g.phase!==a.g.phase||!(current.g.phase==="setup"||canAppend(current.g)))fail("수업 단계가 변경됐어요. 화면을 새로고침해주세요.",409);
    if(current.ar.version!==a.ar.version)fail("배치가 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
    const targets=current.ar.targets.filter(t=>t.id!==b.targetId);
    try{await save(current,{...current.ar,version:current.ar.version+1,ready:!!manifestKey,bundle:manifestKey,targets});return json({ok:true});}
    catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;}
   }
   fail("다른 모둠의 기록을 저장 중입니다. 잠시 후 다시 해제해주세요.",409);
  }catch(e){if(manifestKey)await env.BUCKET.delete(manifestKey);throw e;}
 }
 if(action==="problem"){
  let b:any,file:FormDataEntryValue|null=null;
  if(req.headers.get("content-type")?.startsWith("multipart/form-data")){const f=await multipart(req,5_000_000);b={targetId:f.get("targetId"),question:f.get("question")||"",answers:JSON.parse(String(f.get("answers")||"[]")),removeImage:f.get("removeImage")==="true",bankProblemId:f.get('bankProblemId')};file=f.get("problemImage");}
  else{const raw=await req.text();if(raw.length>20000)fail("문제가 너무 깁니다.");b=JSON.parse(raw);}
  const target=a.ar.targets.find(t=>t.id===b.targetId);if(!target)fail("등록한 물건이 아니에요.");
  const prepared=await picture(file),imageKey=prepared?`game-ar/${a.g.id}/problem-${secret()}`:b.removeImage?undefined:target.problemImage;
  const task=problem(b.question,b.answers,!!imageKey);
  const identity=await problemIdentity(a.ar.targets,b.bankProblemId,prepared,target,!!b.removeImage);
  if(prepared)await env.BUCKET.put(imageKey!,prepared.bytes,{httpMetadata:{contentType:prepared.type}});
  Object.assign(target,task,{problemImage:imageKey,bankProblemId:identity.bankProblemId,problemImageHash:identity.problemImageHash});
  try{await save(a,{...a.ar,version:a.ar.version+1});}catch(e){if(prepared)await env.BUCKET.delete(imageKey!);throw e;}return json({ok:true});
 }
 if(action!=="upload"&&action!=="publish")fail("잘못된 요청입니다.");
 const form=await multipart(req,15_000_000);
 const target=form.get("target");if(!(target instanceof File)||target.size<100||target.size>14_000_000)fail("인식 데이터가 너무 큽니다. 물건 수를 줄여주세요.");
 if(Number(form.get("version"))!==a.ar.version)fail("배치가 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
 const key=`game-ar/${a.g.id}/${secret()}`;
 if(action==="publish"){
  if(!a.ar.targets.length)fail("물건을 먼저 등록해주세요.");
  await env.BUCKET.put(key,await target.arrayBuffer());
  try{await save(a,{...a.ar,ready:true,bundle:key});}catch(e){await env.BUCKET.delete(key);throw e;}
 }else{
  const photo=form.get("photo"),label=form.get("label")??"",ids=JSON.parse(String(form.get("cards")||"[]"));
  const prepared=await picture(form.get("problemImage"));
  const task=problem(form.get("question")||"",JSON.parse(String(form.get("answers")||"[]")),!!prepared);
  const identity=await problemIdentity(a.ar.targets,form.get('bankProblemId'),prepared);
  if(!(photo instanceof File)||photo.size>1_000_000||photo.size<100||typeof label!=="string"||label.length>60)fail("장소 메모는 60자 이하로 입력하고 물건 사진을 확인해주세요.");
  const usedLabels=new Set(a.ar.targets.map(t=>t.label));
  let locationNumber=a.ar.targets.length+1;
  while(usedLabels.has(`장소 ${locationNumber}`))locationNumber++;
  const locationLabel=label.trim()||`장소 ${locationNumber}`;
  if(!Array.isArray(ids)||!ids.length||ids.length>30||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=="string"||!a.g.cards.some(c=>c.id===id)||a.ar.targets.some(t=>t.cards.includes(id))))fail("아직 배치하지 않은 카드를 1~30장 선택해주세요.");
  const photoBytes=await photo.arrayBuffer(),photoHash=await hash(photoBytes);
  if(a.ar.targets.some(t=>t.photoHash===photoHash))fail("이미 등록한 사진입니다. 서로 다른 물건을 사용해주세요.");
  await env.BUCKET.put(`${key}/photo`,photoBytes,{httpMetadata:{contentType:"image/jpeg"}});await env.BUCKET.put(`${key}/target`,await target.arrayBuffer());
  if(prepared)await env.BUCKET.put(`${key}/problem`,prepared.bytes,{httpMetadata:{contentType:prepared.type}});
  const added={id:secret(),label:locationLabel,cards:ids,key,photoHash,...task,...identity,problemImage:prepared?`${key}/problem`:undefined,solvedBy:[]};
  let manifestKey:string|undefined;
  try{
   if(a.g.phase==="search"){
    manifestKey=`game-ar/${a.g.id}/manifest-${secret()}`;
    await env.BUCKET.put(manifestKey,JSON.stringify({parts:[...a.ar.targets,added].map(t=>`${t.key}/target`)}),{customMetadata:{arFormat:"targets-v1"}});
   }
   // Claims and answers can arrive while files upload. Reload before CAS and keep
   // their progress; reject competing placement changes rather than overwriting.
   let saved=false;
   for(let retry=0;retry<6;retry++){
    const current=await auth(req);
    if(current.g.phase!==a.g.phase||!(current.g.phase==="setup"||canAppend(current.g)))fail("수업 단계가 변경됐어요. 화면을 새로고침해주세요.",409);
    if(current.ar.version!==a.ar.version)fail("배치가 변경됐어요. 새로고침 후 다시 시도해주세요.",409);
    if(ids.some((id:string)=>current.g.cards.find(c=>c.id===id)?.owner))fail("이미 획득한 카드는 배치할 수 없어요.",409);
    try{await save(current,{...current.ar,version:current.ar.version+1,ready:!!manifestKey,bundle:manifestKey||null,targets:[...current.ar.targets,added]});saved=true;break;}
    catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;}
   }
   if(!saved)fail("다른 모둠의 기록을 저장 중입니다. 잠시 후 다시 등록해주세요.",409);
  }catch(e){await env.BUCKET.delete([`${key}/photo`,`${key}/target`,`${key}/problem`,...(manifestKey?[manifestKey]:[])]);throw e;}
 }
 return json({ok:true});
 }catch(e){return error(e);}}

async function multipart(req:Request,limit:number){
 const reader=req.body?.getReader();if(!reader)fail("파일을 선택해주세요.");const chunks:Uint8Array[]=[];let length=0;
 while(true){const n=await reader.read();if(n.done)break;length+=n.value.length;if(length>limit){await reader.cancel();fail("업로드 용량이 너무 큽니다. 그림이나 물건 수를 줄여주세요.",413);}chunks.push(n.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return new Response(bytes,{headers:{"Content-Type":req.headers.get("content-type")||""}}).formData();
}
async function picture(file:FormDataEntryValue|null){
 if(file===null)return null;
 if(!(file instanceof File)||file.size<12||file.size>4_000_000)fail("문제 그림은 4MB 이하 JPG·PNG·WebP 파일로 올려주세요.");
 const bytes=await file.arrayBuffer(),v=new Uint8Array(bytes),ascii=(a:number,b:number)=>String.fromCharCode(...v.slice(a,b));
 const type=v[0]===255&&v[1]===216&&v[2]===255?"image/jpeg":v.slice(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i])?"image/png":ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP"?"image/webp":null;
 if(!type)fail("JPG·PNG·WebP 문제 그림을 선택해주세요.");return {bytes,type};
}
