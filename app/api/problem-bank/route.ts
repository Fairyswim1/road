import { database } from '@/db/raw';
import { problemBank,findProblem,problemSummary } from '@/lib/problem-bank';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(req:Request){
 try{
  const url=new URL(req.url),id=url.searchParams.get('id')||'';
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!/^[a-f0-9]{32}$/.test(id)||!token)return json({error:'교사 수업 링크에서 문제은행을 열어주세요.'},403);
  const row=await database().prepare('SELECT admin_hash FROM games WHERE id=?').bind(id).first<{admin_hash:string}>();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(!row||row.admin_hash!==hash)return json({error:'문제은행은 교사만 열 수 있어요.'},403);
  const key=url.searchParams.get('image')||url.searchParams.get('entry');
  if(!key)return json({count:problemBank.length,problems:problemBank.map(problemSummary)});
  const problem=findProblem(key);if(!problem)return json({error:'문제를 찾을 수 없어요.'},404);
  if(url.searchParams.has('image')){
   const images=(await import('@/lib/problem-bank-images.json')).default as Record<string,string>;
   const data=images[key];if(!data)return json({error:'문제 이미지를 찾을 수 없어요.'},404);
   const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/png','Content-Disposition':`inline; filename="formula-road-${key}.png"`}});
  }
  return json({...problemSummary(problem),answer:problem.answer,solution:problem.solution,solutionHtml:problem.solutionHtml,source:problem.source,width:problem.width,height:problem.height});
 }catch{return json({error:'문제은행을 불러오지 못했어요. 잠시 후 다시 시도해주세요.'},503);}
}
