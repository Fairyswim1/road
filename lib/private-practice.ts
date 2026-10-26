export type PracticeCells=(string|null)[];
type DraftStorage=Pick<Storage,"getItem"|"setItem">;
export const privatePracticeKey=(gameId:string,teamId:string)=>`formula-road-private-practice-v1:${gameId}:${teamId}`;
export function cleanPracticeBoard(value:unknown,owned:ReadonlySet<string>):PracticeCells{
 const seen=new Set<string>();
 return Array.from({length:36},(_,i)=>{
  const id=Array.isArray(value)?value[i]:null;
  if(typeof id!=="string"||!owned.has(id)||seen.has(id))return null;
  seen.add(id);return id;
 });
}
export function loadPrivatePractice(storage:DraftStorage|null,key:string,owned:ReadonlySet<string>,legacy?:unknown):PracticeCells{
 try{const raw=storage?.getItem(key);if(raw!=null){const saved=JSON.parse(raw);if(Array.isArray(saved)&&saved.length===36)return cleanPracticeBoard(saved,owned);}}catch{}
 // Copy the old shared draft once; polling never supplies subsequent placements.
 return cleanPracticeBoard(legacy,owned);
}
export function savePrivatePractice(storage:DraftStorage|null,key:string,board:PracticeCells):boolean{
 try{if(!storage)return false;storage.setItem(key,JSON.stringify(board));return true;}catch{return false;}
}
