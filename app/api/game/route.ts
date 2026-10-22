import { database } from "@/db/raw";
import { shapes, validateBoard, solvingRemaining, hasClaimedAtTarget, type Game, type Team } from "@/lib/game";
export const dynamic="force-dynamic";
type Row={id:string;admin_hash:string;pin_hash:string;state:string;revision:number};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const secret=()=>crypto.randomUUID().replaceAll("-","");
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,"0")).join("");
class GameError extends Error{constructor(message:string,public status=400){super(message);}}
function fail(message:string,status=400):never{throw new GameError(message,status);}
function num(v:unknown,min:number,max:number){if(typeof v!=="number"||!Number.isInteger(v)||v<min||v>max)fail("설정 숫자의 범위를 확인해주세요.");return v as number;}
function title(v:unknown){if(typeof v!=="string"||!v.trim()||v.length>60)fail("이름은 1~60자로 입력해주세요.");return (v as string).trim();}
function log(g:Game,text:string){g.events.unshift({at:Date.now(),text});g.events=g.events.slice(0,100);}
function pause(t:Team,now:number){if(t.startedAt){t.usedMs+=Math.max(0,now-t.startedAt);t.startedAt=null;}}
function finishSearch(g:Game,now:number){g.phase="solve";g.searchPausedMs=null;g.searchEndsAt=Math.min(now,g.searchEndsAt||now);g.teams.forEach(t=>{if(t.status==="searching")t.status="ready";});}
function project(row:Row,g:Game,token:string,admin:boolean){
 const team=g.teams.find(t=>t.token===token);
 if(!admin&&!team)fail("참여 링크가 올바르지 않아요. 관리자에게 모둠 링크를 받아주세요.",403);
 const now=Date.now();if(g.phase==="search"&&g.searchEndsAt&&now>=g.searchEndsAt)finishSearch(g,now);
 const {ar:_ar,...safe}=g;
 return {game:admin?g:{...safe,cards:g.cards.filter(c=>c.owner===team!.id).map(({secret:_,...c})=>c),teams:g.teams.filter(t=>t.id===team!.id).map(({token:_,...t})=>t),events:[]},role:admin?"admin":"team",teamId:team?.id||null,serverNow:now,revision:row.revision};
}
async function getRow(id:string){if(!/^[a-f0-9]{32}$/.test(id))fail("수업 링크가 올바르지 않아요.",404);const r=await database().prepare("SELECT * FROM games WHERE id = ?").bind(id).first<Row>();if(!r)fail("수업을 찾을 수 없어요.",404);return r;}
function bearer(r:Request){return r.headers.get("authorization")?.replace(/^Bearer /,"")||"";}
export async function GET(req:Request){try{const row=await getRow(new URL(req.url).searchParams.get("id")||"");const token=bearer(req);return json(project(row,JSON.parse(row.state),token,await hash(token)===row.admin_hash));}catch(e){return error(e);}}
export async function POST(req:Request){try{
 if(req.headers.get("origin")&&req.headers.get("origin")!==new URL(req.url).origin)fail("허용되지 않은 요청이에요.",403);
 const raw=await req.text();if(raw.length>18000)fail("요청이 너무 커요.");const b=JSON.parse(raw);
 if(b.action==="create"){
  const id=secret(),adminToken=secret();
  if(!Array.isArray(b.names)||b.names.length<2||b.names.length>10)fail("모둠은 2~10개로 설정해주세요.");
  if(!/^\d{6}$/.test(b.pin||""))fail("관리자 PIN은 숫자 6자리로 입력해주세요.");
  const names=b.names.map(title);if(new Set(names).size!==names.length)fail("모둠 이름은 서로 다르게 입력해주세요.");
  const count=num(b.cardCount,b.mode==="ar"?12:60,240);
  const values=["1","2","3","4","5","6","7","8","9","10","+","-","×","÷","+","-","×","÷"];
  const g:Game={id,title:title(b.title),phase:"setup",searchMinutes:num(b.searchMinutes,1,120),solveMinutes:num(b.solveMinutes,1,60),searchEndsAt:null,allNumbers:b.allNumbers===true,teams:names.map((name:string,i:number)=>({id:`t${i+1}`,name,token:secret(),status:"searching",board:Array(36).fill(null),boardVersion:0,usedMs:0,startedAt:null,result:null})),cards:Array.from({length:count},(_,i)=>({id:String(i+1).padStart(3,"0"),value:values[i%values.length],shape:shapes[(Math.floor(i/values.length)+(b.mode==="ar"?i:0))%6],secret:secret().slice(0,12).toUpperCase(),owner:null,claimedAt:null})),events:[]};
  if(b.mode==="ar"){g.mode="ar";g.ar={version:0,ready:false,bundle:null,targets:[]};}
  // Shuffle the distribution across marker numbers; card orientations stay fixed after creation.
  const faces=g.cards.map(c=>({value:c.value,shape:c.shape}));
  for(let i=faces.length-1;i>0;i--){const a=new Uint32Array(1);crypto.getRandomValues(a);const j=a[0]%(i+1);[faces[i],faces[j]]=[faces[j],faces[i]];}
  g.cards.forEach((c,i)=>Object.assign(c,faces[i]));log(g,"수업이 만들어졌어요.");
  const adminHash=await hash(adminToken),pinHash=await hash(id+b.pin);
  await database().prepare("INSERT INTO games (id, admin_hash, pin_hash, state, revision, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(id,adminHash,pinHash,JSON.stringify(g),Date.now()).run();
  return json({id,adminToken,...project({id,admin_hash:adminHash,pin_hash:pinHash,state:"",revision:0},g,adminToken,true)});
 }
 const token=bearer(req),tokenHash=await hash(token);
 if(b.action==="clone"){
  const source=await getRow(b.id);if(tokenHash!==source.admin_hash)fail("관리자만 수업을 복제할 수 있어요.",403);
  if(!/^[a-f0-9]{32}$/.test(b.requestId||""))fail("복제 요청을 다시 열어주세요.");
  if(!Array.isArray(b.names)||b.names.length<2||b.names.length>10)fail("모둠은 2~10개로 설정해주세요.");
  const names=b.names.map(title),newTitle=title(b.title);
  if(new Set(names).size!==names.length)fail("모둠 이름은 서로 다르게 입력해주세요.");
  if(!/^\d{6}$/.test(b.pin||""))fail("새 수업의 관리자 PIN은 숫자 6자리로 입력해주세요.");
  // Stable credentials make a retry of the same request return the same new class.
  const id=(await hash(source.id+":clone:"+b.requestId)).slice(0,32),adminToken=await hash(token+":clone:"+b.requestId),adminHash=await hash(adminToken);
  let row=await database().prepare("SELECT * FROM games WHERE id = ?").bind(id).first<Row>();
  if(!row){
   const original:Game=JSON.parse(source.state);
   const g:Game={id,title:newTitle,phase:"setup",searchMinutes:original.searchMinutes,solveMinutes:original.solveMinutes,searchEndsAt:null,allNumbers:original.allNumbers,
    teams:names.map((name:string,i:number)=>({id:`t${i+1}`,name,token:secret(),status:"searching",board:Array(36).fill(null),boardVersion:0,usedMs:0,startedAt:null,result:null})),
    cards:original.cards.map(c=>({id:c.id,value:c.value,shape:c.shape,secret:secret().slice(0,12).toUpperCase(),owner:null,claimedAt:null})),events:[]};
   if(original.mode==="ar"){
    g.mode="ar";
    // Assets are immutable and served through each class's authorization. Edits write new keys.
    g.ar=original.ar?{version:0,ready:original.ar.ready,bundle:original.ar.bundle,targets:original.ar.targets.map(t=>({...t,id:secret(),cards:[...t.cards],answers:[...t.answers],solvedBy:[]}))}:{version:0,ready:false,bundle:null,targets:[]};
   }
   log(g,"기존 수업의 배치와 문제를 복사해 새 수업을 만들었어요.");
   await database().prepare("INSERT OR IGNORE INTO games (id, admin_hash, pin_hash, state, revision, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(id,adminHash,await hash(id+b.pin),JSON.stringify(g),Date.now()).run();
   row=await getRow(id);
  }
  if(row.admin_hash!==adminHash)fail("새 수업을 열지 못했어요. 다시 복제해주세요.",409);
  return json({id,adminToken,...project(row,JSON.parse(row.state),adminToken,true)});
 }
 for(let retry=0;retry<8;retry++){
  const row=await getRow(b.id),g:Game=JSON.parse(row.state),admin=tokenHash===row.admin_hash;
  const actor=g.teams.find(t=>t.token===token);if(!admin&&!actor)fail("접근 권한이 없어요.",403);
  const now=Date.now();if(g.phase==="search"&&g.searchEndsAt&&now>=g.searchEndsAt)finishSearch(g,now);
  let message="저장했어요.";
  if(b.action==="practice"){
   if(!admin&&b.teamId!==actor!.id)fail("우리 모둠 연습판만 바꿀 수 있어요.",403);
   const t=admin?g.teams.find(t=>t.id===b.teamId):actor;if(!t)fail("모둠을 찾을 수 없어요.");
   if(g.phase==="setup")fail("수색 시작 후 연습할 수 있어요.",409);
   if(b.boardVersion!==(t.practiceVersion||0))fail("다른 기기에서 연습판을 바꿨어요. 최신 판을 확인하고 다시 놓아주세요.",409);
   if(!Array.isArray(b.board)||b.board.length!==36||b.board.some((id:unknown)=>id!==null&&(typeof id!=="string"||!g.cards.some(c=>c.id===id&&c.owner===t.id))))fail("우리 모둠이 획득한 카드만 연습에 사용할 수 있어요.");
   const ids=b.board.filter(Boolean);if(new Set(ids).size!==ids.length)fail("카드는 한 번씩만 사용할 수 있어요.");
   t.practiceBoard=b.board;t.practiceVersion=(t.practiceVersion||0)+1;message="연습판을 저장했어요.";
  }else if(b.action==="claim"){
   if(!actor)fail("모둠 참여 화면에서 획득해주세요.",403);
   if(g.searchPausedMs!=null)fail("수색이 일시 정지됐어요. 선생님이 재개할 때까지 기다려주세요.",409);
   if(g.phase!=="search"||actor.status!=="searching")fail("현재는 카드를 수색할 수 없어요.",409);
   const c=g.cards.find(c=>c.secret===String(b.code||"").trim().toUpperCase());if(!c)fail("이 수업의 카드 코드가 아니에요.",404);
   if(g.mode==="ar"){
    const target=g.ar?.targets.find(t=>t.cards.includes(c.id));
    if(!target)fail("획득할 수 있는 카드가 없어요.",409);
    if(!target.solvedBy?.includes(actor.id))fail("먼저 이 물건의 수학문제를 풀어주세요.",403);
    // Rechecked on every CAS retry; simultaneous phones cannot claim different rewards here.
    if(c.owner!==actor.id&&hasClaimedAtTarget(g,target,actor.id))fail("우리 모둠은 이 장소에서 이미 1장을 획득했어요. 다른 장소를 찾아보세요.",409);
   }
   if(c.owner===actor.id)message="이미 우리 모둠이 획득한 카드예요.";
   else{if(c.owner)fail("지금 획득할 수 있는 카드가 없어요. 계속 탐색해주세요.",409);c.owner=actor.id;c.claimedAt=now;message=`${c.value} 카드 획득!`;log(g,`${actor.name} · ${c.id}번 ${c.value} 카드 획득`);}
   const playable=g.mode==="ar"?g.cards.filter(c=>g.ar?.targets.some(t=>t.cards.includes(c.id))):g.cards;
   if(playable.length&&playable.every(c=>c.owner))finishSearch(g,now);
  }else if(b.action==="return"){
   const t=admin?g.teams.find(t=>t.id===b.teamId):actor;if(!t)fail("모둠을 찾을 수 없어요.");
   if(g.phase!=="search"&&g.phase!=="solve")fail("수색 시작 후 복귀할 수 있어요.");
   if(t.status==="searching"){t.status="ready";log(g,`${t.name} · 수색 종료, 관리자에게 복귀`);}
  }else{
   if(!admin)fail("관리자만 사용할 수 있어요.",403);
   if(b.action==="unlock"){if(await hash(g.id+String(b.pin))!==row.pin_hash)fail("관리자 PIN이 맞지 않아요.",403);return json({ok:true});}
   if(b.action==="start"){
    if(g.mode==="ar"&&(!g.ar?.ready||!g.ar.targets.length||!g.ar.bundle))fail("AR 카드 배치를 완료하고 탐색 데이터를 저장해주세요.",409);
    if(g.mode==="ar"&&g.ar?.targets.some(t=>(!t.question&&!t.problemImage)||!t.answers?.length))fail("모든 물건에 수학문제와 정답을 등록해주세요.",409);
    if(g.phase!=="setup")fail("이미 시작된 수업이에요.",409);g.phase="search";g.searchEndsAt=now+g.searchMinutes*60000;log(g,"카드 수색이 시작됐어요.");
   }else if(b.action==="search_reopen"){
    if(g.phase!=="solve")fail("수색 종료 후 수식 완성 단계에서 다시 열 수 있어요.",409);
    if(b.searchTimerVersion!==(g.searchTimerVersion||0))fail("수색 상태가 변경됐어요. 최신 화면에서 다시 눌러주세요.",409);
    const minutes=num(b.minutes,1,120),teams=g.teams.filter(t=>t.status!=="submitted");
    if(!teams.length)fail("모든 모둠이 최종 제출했어요.",409);
    const remaining=g.cards.filter(c=>!c.owner&&(g.mode!=="ar"||g.ar?.targets.some(t=>t.cards.includes(c.id))));
    if(!remaining.length)fail("숨겨진 카드를 모두 획득했어요. 추가로 수색할 카드가 없습니다.",409);
    teams.forEach(t=>{pause(t,now);t.status="searching";});
    g.phase="search";g.searchPausedMs=null;g.searchEndsAt=now+minutes*60000;
    g.searchTimerVersion=(g.searchTimerVersion||0)+1;
    log(g,`수색을 ${minutes}분 동안 다시 열었어요. 획득한 카드와 수식판은 유지됩니다.`);
   }else if(["search_pause","search_resume","search_add"].includes(b.action)){
    if(g.phase!=="search")fail("진행 중인 수색에서만 시간을 조절할 수 있어요.",409);
    if(b.searchTimerVersion!==(g.searchTimerVersion||0))fail("다른 화면에서 수색 시간이 변경됐어요. 최신 상태에서 다시 눌러주세요.",409);
    if(b.action==="search_pause"){
     if(g.searchPausedMs!=null)fail("이미 일시 정지 중이에요.",409);
     g.searchPausedMs=Math.max(0,(g.searchEndsAt||now)-now);g.searchEndsAt=null;log(g,"수색을 일시 정지했어요.");
    }else if(b.action==="search_resume"){
     if(g.searchPausedMs==null)fail("일시 정지 중일 때만 재개할 수 있어요.",409);
     g.searchEndsAt=now+g.searchPausedMs;g.searchPausedMs=null;log(g,"남은 시간부터 수색을 재개했어요.");
    }else{
     const minutes=num(b.minutes,1,120),extra=minutes*60000;
     if(g.searchPausedMs!=null)g.searchPausedMs+=extra;else g.searchEndsAt=(g.searchEndsAt||now)+extra;
     log(g,`수색 시간을 ${minutes}분 추가했어요.`);
    }
    g.searchTimerVersion=(g.searchTimerVersion||0)+1;
   }else if(b.action==="stop"){
    if(g.phase!=="search")fail("수색 중일 때만 종료할 수 있어요.",409);finishSearch(g,now);log(g,"전체 카드 수색이 종료됐어요.");
   }else if(b.action==="card_edit"){
    if(g.phase!=="setup")fail("수색 시작 전만 카드를 바꿀 수 있어요.",409);
    const c=g.cards.find(c=>c.id===b.cardId);if(!c)fail("카드를 찾을 수 없어요.");
    if(!["1","2","3","4","5","6","7","8","9","10","+","-","×","÷"].includes(b.value)||!shapes.includes(b.shape))fail("카드의 숫자·기호·방향을 확인해주세요.");
    c.value=b.value;c.shape=b.shape;
   }else if(b.action==="rename"){
    if(g.phase!=="setup")fail("시작 전 모둠 이름을 변경해주세요.");const t=g.teams.find(t=>t.id===b.teamId);if(!t)fail("모둠을 찾을 수 없어요.");const name=title(b.name);if(g.teams.some(x=>x.id!==t.id&&x.name===name))fail("이미 사용 중인 이름이에요.");t.name=name;
   }else if(b.action==="solve"||b.action==="pause"||b.action==="board"||b.action==="submit"){
    const t=g.teams.find(t=>t.id===b.teamId);if(!t)fail("모둠을 찾을 수 없어요.");
    if(g.phase==="setup"||g.phase==="ended"||t.status==="searching")fail("모둠의 수색을 종료한 후 수식판을 열어주세요.");
    if(t.status==="submitted")fail("이미 제출한 수식판이에요.",409);
    if(b.action==="solve"){
     g.teams.forEach(x=>pause(x,now));if(solvingRemaining(g,t,now)<=0)fail("이 모둠의 풀이 시간이 끝났어요.",409);t.status="solving";t.startedAt=now;log(g,`${t.name} · 수식 풀이 시작`);
    }else if(b.action==="pause")pause(t,now);
    else{
     if(b.action==="board"){
      if(!t.startedAt||solvingRemaining(g,t,now)<=0)fail("풀이 시간이 진행 중일 때만 배치할 수 있어요.",409);
      if(b.boardVersion!==t.boardVersion)fail("다른 화면에서 판이 변경됐어요. 최신 판을 확인해주세요.",409);
      if(!Array.isArray(b.board)||b.board.length!==36||b.board.some((id:unknown)=>id!==null&&(typeof id!=="string"||!g.cards.some(c=>c.id===id&&c.owner===t.id))))fail("사용할 수 없는 카드가 포함됐어요.");
      const ids=b.board.filter(Boolean);if(new Set(ids).size!==ids.length)fail("카드는 한 번씩만 사용할 수 있어요.");t.board=b.board;t.boardVersion++;t.result=null;
     }else{
      const result=validateBoard(t.board,g.cards,t.id,g.allNumbers);if(!result.valid&&b.incomplete!==true)fail(result.message);pause(t,now);t.status="submitted";t.result=result.valid?result:{...result,success:false,count:t.board.filter(Boolean).length,message:`미완성 제출 · ${result.message}`};log(g,`${t.name} · 최종 제출: ${result.valid?result.value:"미완성"}`);message="최종 제출했어요.";
      if(g.teams.every(t=>t.status==="submitted"))g.phase="ended";
     }
    }
   }else fail("알 수 없는 작업이에요.");
  }
  const saved=await database().prepare("UPDATE games SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?").bind(JSON.stringify(g),g.id,row.revision).run();
  if(saved.meta.changes)return json({...project({...row,revision:row.revision+1},g,token,admin),message});
 }
 fail("동시에 요청이 많아요. 잠시 후 다시 시도해주세요.",409);
 }catch(e){return error(e);}}
function error(e:unknown){if(e instanceof GameError)return json({error:e.message},e.status);console.error("Game request failed",e instanceof Error?e.message:"unknown");return json({error:"저장소에 연결하지 못했어요. 입력을 유지한 채 다시 시도해주세요."},503);}
