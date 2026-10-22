// Legacy classes serve one binary file; new classes serve an ordered file index.
export async function loadRecognitionBundle({url,headers,signal,combine,onProgress=()=>{}}){
 const get=async path=>{const r=await fetch(path,{headers,signal,cache:'no-store'});if(!r.ok)throw new Error('탐색 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.');return r;};
 const response=await get(url);
 if(!response.headers.get('content-type')?.includes('application/json'))return response.blob();
 const manifest=await response.json();
 if(manifest.format!=='targets-v1'||!Number.isSafeInteger(manifest.parts)||manifest.parts<1)throw new Error('탐색 데이터를 확인해주세요.');
 const buffers=[];
 for(let i=0;i<manifest.parts;i++){
  signal?.throwIfAborted();
  buffers.push(await (await get(url+'&part='+i)).arrayBuffer());
  onProgress(i+1,manifest.parts);
 }
 signal?.throwIfAborted();
 return combine(buffers);
}
