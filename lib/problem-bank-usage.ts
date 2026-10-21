import { env } from 'cloudflare:workers';
import { problemBank, findProblem } from './problem-bank';
import type { ArTarget } from './game';

const byImage=new Map(problemBank.filter(p=>p.imageHash).map(p=>[p.imageHash!,p.id]));
const oldImageCache=new Map<string,Promise<string>>();
export async function imageHash(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function bankIdForImage(hash:string){return byImage.get(hash);}
// Recognize previously placed bank images, which predate stored question IDs.
export async function targetProblem(t:ArTarget):Promise<{bankProblemId?:string;problemImageHash?:string}>{
 let hash=t.problemImageHash;
 if(!hash&&t.problemImage){
  const key=t.problemImage;let pending=oldImageCache.get(key);
  if(!pending){pending=(async()=>{const object=await env.BUCKET?.get(key);if(!object)throw Error('Existing problem image unavailable');return imageHash(await object.arrayBuffer());})();oldImageCache.set(key,pending);if(oldImageCache.size>128)oldImageCache.delete(oldImageCache.keys().next().value!);}
  try{hash=await pending;}catch(e){oldImageCache.delete(key);throw e;}
 }
 return {bankProblemId:t.bankProblemId&&findProblem(t.bankProblemId)?t.bankProblemId:hash?bankIdForImage(hash):undefined,problemImageHash:hash};
}
export async function usedProblems(targets:ArTarget[],excludeTarget=''){
 const used=new Map<string,string[]>();
 for(const t of targets){if(t.id===excludeTarget)continue;const p=await targetProblem(t);if(p.bankProblemId)used.set(p.bankProblemId,[...(used.get(p.bankProblemId)||[]),t.id]);}
 return used;
}
export async function duplicateProblem(targets:ArTarget[],candidate:{bankProblemId?:string;problemImageHash?:string},excludeTarget=''){
 for(const t of targets){if(t.id===excludeTarget)continue;const p=await targetProblem(t);if((candidate.bankProblemId&&p.bankProblemId===candidate.bankProblemId)||(candidate.problemImageHash&&p.problemImageHash===candidate.problemImageHash))return true;}
 return false;
}
