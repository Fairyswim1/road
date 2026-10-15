import type {Game} from './game';

export const LESSONS_KEY='formula-road.teacher-lessons.v1';
export const LESSONS_EVENT='formula-road-lessons-changed';
export type SavedLesson={id:string;token:string;title:string;phase:Game['phase'];teamCount:number;cardCount:number;targetCount:number;savedAt:number};
const validId=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const validToken=(s:unknown):s is string=>typeof s==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(s);
export function readLessons():SavedLesson[]{
 const raw=localStorage.getItem(LESSONS_KEY);if(!raw)return [];
 const data:unknown=JSON.parse(raw);if(!Array.isArray(data))throw new Error('목록을 읽을 수 없습니다. 관리자 링크로 수업을 열어주세요.');
 return data.filter((x):x is SavedLesson=>!!x&&typeof x==='object'&&validId(x.id)&&validToken(x.token)&&typeof x.title==='string'&&['setup','search','solve','ended'].includes(x.phase)&&Number.isInteger(x.teamCount)&&Number.isInteger(x.cardCount)&&Number.isInteger(x.targetCount)&&Number.isFinite(x.savedAt));
}
function writeLessons(rows:SavedLesson[]){localStorage.setItem(LESSONS_KEY,JSON.stringify(rows));window.dispatchEvent(new Event(LESSONS_EVENT));}
// Call only after this token has been verified by an admin API response.
export function rememberLesson(game:Game,token:string,addIfMissing=true){
 if(!validId(game.id)||!validToken(token))throw new Error('관리자 링크를 확인해주세요.');
 const rows=readLessons(),old=rows.find(x=>x.id===game.id);
 if(!old&&!addIfMissing)return;
 const next:SavedLesson={id:game.id,token,title:game.title,phase:game.phase,teamCount:game.teams.length,cardCount:game.cards.length,targetCount:game.ar?.targets.length||0,savedAt:old?.savedAt||Date.now()};
 if(JSON.stringify(old)===JSON.stringify(next))return;
 writeLessons([next,...rows.filter(x=>x.id!==game.id)]);
}
export function forgetLesson(id:string){writeLessons(readLessons().filter(x=>x.id!==id));}
export function lessonHref(row:Pick<SavedLesson,'id'|'token'>){return `/#g=${row.id}&a=${row.token}`;}
export function parseAdminLink(raw:string,origin:string){
 let url:URL;try{url=new URL(raw.trim(),origin);}catch{throw new Error('관리자 링크 전체를 붙여 넣어주세요.');}
 if(url.origin!==origin)throw new Error('이 수식로드 사이트의 관리자 링크를 넣어주세요.');
 const p=new URLSearchParams(url.hash.slice(1)),id=p.get('g'),token=p.get('a');
 if(p.has('t')||!validId(id)||!validToken(token))throw new Error('학생 참여 링크가 아닌 관리자 링크를 넣어주세요.');
 return {id,token};
}
