"use client";
import {useEffect,useState} from 'react';
import {BookOpen,Copy,Link,RefreshCw,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {LESSONS_EVENT,LESSONS_KEY,readLessons,rememberLesson,forgetLesson,lessonHref,parseAdminLink,type SavedLesson} from '@/lib/saved-lessons';
import type {Game,View} from '@/lib/game';
const phaseNames={setup:'수업 준비',search:'카드 수색',solve:'수식 완성',ended:'수업 완료'};
type Session={id:string;token:string};
async function verify(session:Session){
 const r=await fetch(`/api/game?id=${session.id}`,{headers:{Authorization:`Bearer ${session.token}`},cache:'no-store'});
 const data=await r.json() as View&{error?:string};
 if(!r.ok)throw new Error(data.error||'수업을 불러오지 못했어요.');
 if(data.role!=='admin'||data.game.id!==session.id)throw new Error('관리자 링크만 목록에 추가할 수 있어요.');
 return data.game;
}
export function SavedLessons({onClone}:{onClone:(game:Game,session:Session)=>void}){
 const [rows,setRows]=useState<SavedLesson[]>([]),[ready,setReady]=useState(false),[link,setLink]=useState(''),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[remove,setRemove]=useState<SavedLesson|null>(null),[failures,setFailures]=useState<Record<string,string>>({});
 useEffect(()=>{const update=()=>{try{setRows(readLessons());}catch{setIssue('이 브라우저에서 목록을 읽을 수 없어요. 보관한 관리자 링크로 수업을 열어주세요.');}setReady(true);};const changed=(e:StorageEvent)=>{if(e.key===LESSONS_KEY||e.key===null)update();};update();window.addEventListener(LESSONS_EVENT,update);window.addEventListener('storage',changed);return()=>{window.removeEventListener(LESSONS_EVENT,update);window.removeEventListener('storage',changed);};},[]);
 async function add(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setIssue('');try{const session=parseAdminLink(link,location.origin),game=await verify(session);rememberLesson(game,session.token);setFailures(old=>{const next={...old};delete next[session.id];return next;});setLink('');toast.success('내 수업 목록에 추가했어요.');}catch(e){setIssue(e instanceof Error?e.message:'목록에 저장하지 못했어요. 관리자 링크를 따로 보관해주세요.');}finally{setBusy(false);}}
 async function clone(row:SavedLesson){setBusy(true);setIssue('');try{const game=await verify(row);rememberLesson(game,row.token);onClone(game,{id:row.id,token:row.token});}catch(e){setIssue(e instanceof Error?e.message:'수업을 열지 못했어요.');}finally{setBusy(false);}}
 async function refresh(){setBusy(true);setIssue('');const errors:Record<string,string>={};try{const queue=[...readLessons()];await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{let row;while((row=queue.shift())){try{const game=await verify(row);rememberLesson(game,row.token,false);}catch(e){errors[row.id]=e instanceof Error?e.message:'연결을 확인해주세요.';}}}));setFailures(errors);}catch{setIssue('목록을 읽지 못했어요. 브라우저 저장 설정을 확인해주세요.');}finally{setBusy(false);}}
 async function copy(row:SavedLesson){try{await navigator.clipboard.writeText(location.origin+lessonHref(row));toast.success('관리자 링크를 복사했어요.');}catch{setIssue('복사하지 못했어요. 수업을 연 뒤 주소창의 관리자 링크를 복사해주세요.');}}
 return <section id="my-lessons" className="panel saved-lessons" aria-labelledby="saved-lessons-title">
  <div className="section-title"><div><p className="eyebrow">MY CLASSROOMS</p><h2 id="saved-lessons-title"><BookOpen/> 내 수업 목록 <span className="lesson-count">{rows.length}</span></h2></div><Button variant="outline" disabled={busy||!rows.length} onClick={()=>void refresh()}><RefreshCw size={16}/> 현황 새로고침</Button></div>
  <p className="muted">이 브라우저에서 만들거나 관리자 링크로 연 수업이 자동으로 모입니다. 목록에는 관리자 링크가 포함되므로 선생님 기기에서 사용해주세요.</p>
  {!ready?<p className="empty-state">목록을 불러오는 중…</p>:!rows.length?<div className="lesson-empty"><h3>저장된 수업이 아직 없어요.</h3><p>아래에서 새 수업을 만들거나, 예전에 보관한 관리자 링크를 추가하세요.</p></div>:<div className="lesson-list">{rows.map(row=><article className="lesson-item" key={row.id} aria-label={row.title}><div className="lesson-info"><span className={`lesson-phase phase-${row.phase}`}>{phaseNames[row.phase]}</span><h3>{row.title}</h3><p>{row.teamCount}모둠 · 준비 카드 {row.cardCount}장 · 등록 장소 {row.targetCount}개</p>{failures[row.id]&&<p className="lesson-error" role="status">{failures[row.id]} 마지막 저장 현황을 표시합니다.</p>}</div><div className="lesson-actions"><a className="lesson-open" href={lessonHref(row)}>수업 열기 →</a><Button variant="outline" disabled={busy} onClick={()=>void clone(row)}><Copy size={15}/> 다른 학급용으로 복제</Button><Button variant="outline" disabled={busy} onClick={()=>void copy(row)}><Link size={15}/> 링크 복사</Button><Button variant="ghost" disabled={busy} onClick={()=>setRemove(row)} aria-label={`${row.title} 목록에서 빼기`}><Trash2 size={15}/> 목록에서 빼기</Button></div></article>)}</div>}
  <details className="lesson-import"><summary>기존 수업 · 다른 기기의 관리자 링크로 추가</summary><form onSubmit={add}><label>기존 수업 관리자 링크<input type="text" inputMode="url" value={link} onChange={e=>setLink(e.target.value)} required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="관리자 링크 전체를 붙여 넣으세요" disabled={busy}/></label><Button className="primary" disabled={busy}>{busy?'확인 중…':'목록에 추가'}</Button></form></details>
  <p className="note">수업과 학생 기록은 서버에 저장됩니다. 이 목록은 현재 브라우저에 보관되며, 다른 기기에서는 관리자 링크를 열어 추가할 수 있어요. 브라우저 데이터를 지우면 목록도 지워지니 관리자 링크는 따로 보관해주세요.</p>
  {issue&&<p className="notice" role="alert">{issue}</p>}
  <Dialog open={!!remove} onOpenChange={o=>{if(!o)setRemove(null);}}><DialogContent><DialogTitle>목록에서 뺄까요?</DialogTitle><DialogDescription>{remove?.title}의 바로가기를 이 브라우저에서 지웁니다. 서버의 수업과 학생 기록은 삭제되지 않습니다. 다시 추가하려면 관리자 링크가 필요합니다.</DialogDescription><Button className="primary" onClick={()=>{if(!remove)return;try{forgetLesson(remove.id);setRemove(null);}catch{setIssue('목록을 변경하지 못했어요.');}}}>목록에서만 빼기</Button></DialogContent></Dialog>
 </section>;
}
