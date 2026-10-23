const CACHE='formula-road-recognition-mindar125-v1';
let recent=null; // One combined bundle, even when device storage is unavailable.
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function storage(url,headers,version){
 if(!/^[a-f0-9]{64}$/.test(version||''))return null;
 const address=new URL(url,globalThis.location?.origin);
 const scope=await digest(address.origin+address.pathname+address.search+'\n'+(new Headers(headers).get('Authorization')||''));
 const prefix=address.origin+'/__ar-device-cache/'+scope+'/';
 let cache=null;try{cache=await globalThis.caches?.open(CACHE);}catch{}
 const key=prefix+version+'/';
 return {key,
  async get(name){if(name==='combined'&&recent?.key===key)return recent.blob;try{const r=await cache?.match(key+name);if(r){const b=await r.blob();if(b.size)return b;}}catch{}return null;},
  async put(name,blob){if(name==='combined')recent={key,blob};try{if(!cache)return false;await cache.put(key+name,new Response(blob));return true;}catch{return false;}},
  async prune(){try{for(const r of await cache?.keys()||[])if(r.url.startsWith(prefix)&&r.url!==key+'combined')await cache.delete(r);}catch{}}
 };
}
// Authorize with fresh lesson metadata before using this cache. Recognition bytes
// only: never cache questions, answers, photos, tokens or card ownership.
export async function loadRecognitionBundle({url,headers,version,signal,combine,onProgress=()=>{},onStage=()=>{}}){
 signal?.throwIfAborted();
 const local=await storage(url,headers,version);
 const cached=await local?.get('combined');signal?.throwIfAborted();
 if(cached){recent={key:local.key,blob:cached};onStage('cached');return cached;}
 const transfer=new AbortController();
 const cancel=()=>transfer.abort(signal?.reason);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const versioned=url+(version?'&bundleVersion='+encodeURIComponent(version):'');
 const get=async path=>{const r=await fetch(path,{headers,signal:transfer.signal,cache:'no-store'});if(!r.ok)throw new Error('탐색 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.');return r;};
 try{
  onStage('download');
  const response=await get(versioned);
  let blob;
  if(!response.headers.get('content-type')?.includes('application/json'))blob=await response.blob();
  else{
   const manifest=await response.json();
   if(manifest.format!=='targets-v1'||!Number.isSafeInteger(manifest.parts)||manifest.parts<1)throw new Error('탐색 데이터를 확인해주세요.');
   const buffers=new Array(manifest.parts);let next=0,done=0;
   async function worker(){try{while(next<manifest.parts){
    transfer.signal.throwIfAborted();const i=next++;
    let part=await local?.get('part-'+i);
    if(!part){part=await (await get(versioned+'&part='+i)).blob();transfer.signal.throwIfAborted();await local?.put('part-'+i,part);}
    transfer.signal.throwIfAborted();buffers[i]=await part.arrayBuffer();onProgress(++done,manifest.parts);
   }}catch(e){transfer.abort(e);throw e;}}
   const results=await Promise.allSettled(Array.from({length:Math.min(4,manifest.parts)},worker));
   const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   signal?.throwIfAborted();onStage('combine');blob=await combine(buffers);
  }
  signal?.throwIfAborted();onStage('saving');
  const saved=await local?.put('combined',blob);
  if(saved)await local.prune();
  signal?.throwIfAborted();onStage(saved?'saved':'session');return blob;
 }finally{signal?.removeEventListener('abort',cancel);transfer.abort();}
}
