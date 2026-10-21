// Server-only catalog. Content keys never leave authenticated server routes.
import entries from './problem-bank-data.json';
export type BankSummary={id:string;subject:string;unit:string;title:string;difficulty:string;minutes:number;familyId?:string;variant?:number;origin?:string;edition?:string;sourceCode?:string};
export type BankIndex=BankSummary&{asset:string;key:string;imageHash?:string};
export type BankProblem=BankSummary&{answer:string;answerLatex:string;solution:string;solutionHtml:string;source:{book:string;code:string;page:string;adaptation:string};width:number;height:number;image:string;blocks:({type:'text';text:string}|{type:'math';latex:string})[]};
export const problemBank=entries as unknown as BankIndex[];
const byId=new Map(problemBank.map(p=>[p.id,p]));
export const findProblem=(id:string)=>byId.get(id);
export function problemSummary(p:BankSummary):BankSummary{return {id:p.id,subject:p.subject,unit:p.unit,title:p.title,difficulty:p.difficulty,minutes:p.minutes,familyId:p.familyId,variant:p.variant,origin:p.origin,edition:p.edition,sourceCode:p.sourceCode};}
const cache=new Map<string,Promise<BankProblem>>();
// Public assets contain only compressed ciphertext. Decryption runs after teacher authorization.
export async function loadProblem(p:BankIndex,origin:string):Promise<BankProblem>{
 const cached=cache.get(p.asset);if(cached)return cached;
 const pending=(async()=>{
  const response=await fetch(new URL('/bank-assets/'+p.asset+'.bin',origin));
  if(!response.ok)throw Error('bank asset unavailable');
  const packed=await response.arrayBuffer();if(packed.byteLength>2000000||packed.byteLength<28)throw Error('asset size');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==p.asset)throw Error('asset integrity');
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(p.key),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['decrypt']);
  const compressed=await crypto.subtle.decrypt({name:'AES-GCM',iv:packed.slice(0,12)},key,packed.slice(12));
  const json=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const detail=JSON.parse(json) as BankProblem;if(detail.id!==p.id)throw Error('entry mismatch');return detail;
 })();
 cache.set(p.asset,pending);if(cache.size>16)cache.delete(cache.keys().next().value!);
 try{return await pending;}catch(e){cache.delete(p.asset);throw e;}
}
