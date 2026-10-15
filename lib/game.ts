export type Shape = "NS"|"EW"|"NE"|"ES"|"SW"|"NW";
export type Card = {id:string; value:string; shape:Shape; secret?:string; owner:string|null; claimedAt:number|null};
export type Result = {valid:boolean; message:string; expression?:string; value?:string; distance?:number; count?:number; success?:boolean};
export type Team = {id:string; name:string; token?:string; status:"searching"|"ready"|"solving"|"submitted"; board:(string|null)[]; boardVersion:number; practiceBoard?:(string|null)[]; practiceVersion?:number; usedMs:number; startedAt:number|null; result:Result|null};
export type ArTarget = {id:string;label:string;cards:string[];key:string;photoHash:string;question:string;problemImage?:string;answers:string[];solvedBy:string[]};
export type ArSetup = {version:number;ready:boolean;bundle:string|null;targets:ArTarget[]};
export type Game = {id:string; title:string; phase:"setup"|"search"|"solve"|"ended"; searchMinutes:number; solveMinutes:number; searchEndsAt:number|null; allNumbers:boolean; teams:Team[]; cards:Card[]; events:{at:number; text:string}[]; mode?:"ar";ar?:ArSetup};
export type View = {game:Game; role:"admin"|"team"; teamId:string|null; serverNow:number; revision:number};
// Derive from ownership so existing lessons also enforce one reward per team/location.
export function hasClaimedAtTarget(game:Game,target:ArTarget,teamId:string){return game.cards.some(c=>c.owner===teamId&&target.cards.includes(c.id));}
export const shapes:Shape[]=["NS","EW","NE","ES","SW","NW"];
export const shapeNames:Record<Shape,string>={NS:"세로",EW:"가로",NE:"위·오른쪽",ES:"오른쪽·아래",SW:"아래·왼쪽",NW:"위·왼쪽"};
export function solvingRemaining(game:Game,t:Team,now:number){return Math.max(0,game.solveMinutes*60000-t.usedMs-(t.startedAt?now-t.startedAt:0));}

// Exact rational arithmetic: never eval student expressions or compare floating point values to 100.
type F={n:bigint;d:bigint};
const B=BigInt;
function gcd(a:bigint,b:bigint):bigint{a=a<B(0)?-a:a;while(b){const c=a%b;a=b;b=c;}return a||B(1);}
function frac(n:bigint,d:bigint):F{if(d===B(0))throw new Error("0으로 나눌 수 없어요.");if(d<B(0)){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function op(a:F,b:F,o:string):F{if(o==="+")return frac(a.n*b.d+b.n*a.d,a.d*b.d);if(o==="-")return frac(a.n*b.d-b.n*a.d,a.d*b.d);if(o==="×")return frac(a.n*b.n,a.d*b.d);return frac(a.n*b.d,a.d*b.n);}
export function arithmetic(values:string[]){
  const tokens:string[]=[];
  for(const v of values){if(/^\d+$/.test(v)&&tokens.length&&/^\d+$/.test(tokens[tokens.length-1]))tokens[tokens.length-1]+=v;else tokens.push(v);}
  if(!tokens.length||tokens.length%2===0||tokens.some((v,i)=>i%2?!["+","-","×","÷"].includes(v):!/^\d+$/.test(v)))throw new Error("숫자와 연산기호를 올바른 순서로 연결해주세요.");
  let sum:F={n:B(0),d:B(1)},term:F={n:B(tokens[0]),d:B(1)},sign="+";
  for(let i=1;i<tokens.length;i+=2){const n={n:B(tokens[i+1]),d:B(1)},o=tokens[i];if(o==="×"||o==="÷")term=op(term,n,o);else{sum=op(sum,term,sign);sign=o;term=n;}}
  const result=op(sum,term,sign);
  return {expression:tokens.join(" "),value:result.d===B(1)?String(result.n):`${result.n}/${result.d}`,success:result.n===B(100)*result.d,distance:Math.abs(Number(result.n)/Number(result.d)-100)};
}
export function validateBoard(board:(string|null)[],cards:Card[],teamId:string,allNumbers=false):Result{
 try{
  if(board.length!==36)throw new Error("판은 6×6칸이어야 해요.");
  const ids=board.filter((id):id is string=>!!id);
  if(new Set(ids).size!==ids.length)throw new Error("한 카드를 두 번 사용할 수 없어요.");
  const owned=new Map(cards.filter(c=>c.owner===teamId).map(c=>[c.id,c]));
  if(ids.some(id=>!owned.has(id)))throw new Error("우리 모둠이 획득한 카드만 사용할 수 있어요.");
  if(!board[0]||!board[35])throw new Error("출발 칸과 도착 칸에 카드를 놓아주세요.");
  const first=owned.get(board[0]!)!;
  const incoming=first.shape.includes("N")?"N":first.shape.includes("W")?"W":null;
  if(!incoming)throw new Error("출발 카드의 길은 위쪽 또는 왼쪽 바깥과 이어져야 해요.");
  const opposite:Record<string,string>={N:"S",S:"N",E:"W",W:"E"};
  const moves:Record<string,number>={N:-6,S:6,E:1,W:-1};
  let pos=0,entry=incoming;const seen=new Set<number>(),ordered:Card[]=[];
  while(true){
   if(seen.has(pos))throw new Error("길이 순환하고 있어요.");seen.add(pos);
   const card=owned.get(board[pos]||"");if(!card)throw new Error(`${Math.floor(pos/6)+1}행 ${pos%6+1}열에서 길이 끊겼어요.`);
   if(!card.shape.includes(entry))throw new Error(`${Math.floor(pos/6)+1}행 ${pos%6+1}열의 카드 방향이 맞지 않아요.`);
   ordered.push(card);const exit=card.shape.split("").find(d=>d!==entry)!;
   if(pos===35){if(!["E","S"].includes(exit))throw new Error("도착 카드의 길은 오른쪽 또는 아래 바깥과 이어져야 해요.");break;}
   if((exit==="N"&&pos<6)||(exit==="S"&&pos>=30)||(exit==="W"&&pos%6===0)||(exit==="E"&&pos%6===5))throw new Error("도착하기 전에 길이 판 밖으로 나갔어요.");
   pos+=moves[exit];entry=opposite[exit];
  }
  if(ordered.length!==ids.length)throw new Error("출발~도착 길에 연결되지 않은 카드는 보관함으로 돌려주세요.");
  if(allNumbers&&[...owned.values()].some(c=>/^\d+$/.test(c.value)&&!ids.includes(c.id)))throw new Error("이번 수업은 획득한 숫자 카드를 모두 사용해야 해요.");
  const result=arithmetic(ordered.map(c=>c.value));
  return {valid:true,...result,count:ordered.length,message:result.success?"길 연결과 수식값 100을 모두 완성했어요!":"길이 연결됐어요. 수식값을 100으로 만들어보세요."};
 }catch(e){return {valid:false,message:e instanceof Error?e.message:"수식을 확인해주세요."};}
}
