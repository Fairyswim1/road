import {drawRecognitionFrame,serialMatcher,openCamera} from './ar-recognition.js';
const CDN='https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/';
export async function photoFile(file){
 if(!file||file.size>25000000)throw new Error('25MB 이하 사진을 골라주세요.');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,720/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*ratio);c.height=Math.round(img.naturalHeight*ratio);if(Math.min(c.width,c.height)<160)throw new Error('물건의 한 면을 더 크게 찍어주세요.');c.getContext('2d').drawImage(img,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));if(!blob)throw new Error('사진을 처리하지 못했습니다. JPG로 다시 시도하세요.');return blob;}finally{URL.revokeObjectURL(url);}
}
export async function compilePhoto(blob,onProgress){
 const {Compiler}=await import(CDN+'mindar-image.prod.js');const compiler=new Compiler(),url=URL.createObjectURL(blob);
 try{const img=new Image();img.src=url;await img.decode();const data=await compiler.compileImageTargets([img],onProgress);const points=data[0].matchingData.reduce((n,l)=>n+l.maximaPoints.length+l.minimaPoints.length,0);if(points<30)throw new Error('무늬가 부족합니다. 그림이 다양한 다른 표지를 골라주세요.');return new Blob([compiler.exportData()]);}finally{URL.revokeObjectURL(url);}
}
export async function combineTargets(buffers){const {Compiler}=await import(CDN+'mindar-image.prod.js');const compiler=new Compiler(),data=[];for(const b of buffers){const imported=compiler.importData(b);if(imported.length!==1)throw new Error('등록 데이터를 확인해주세요.');data.push(...imported);}compiler.data=data;return new Blob([compiler.exportData()]);}
let enginePromise;
export function prepareVision(){return enginePromise??=(import(CDN+'mindar-image.prod.js').catch(e=>{enginePromise=null;throw e;}));}
let cachedMatcher=null;
export async function createImageMatcher(blob,key){
 if(cachedMatcher?.key===key)return cachedMatcher.promise;
 const previous=cachedMatcher;
 const promise=(async()=>{
  if(previous){try{const old=await previous.promise;await old.idle();old.dispose();}catch{}}
  const {Controller}=await prepareVision();
  const controller=new Controller({inputWidth:1024,inputHeight:1024,maxTrack:1});
  const {dimensions}=controller.addImageTargetsFromBuffer(await blob.arrayBuffer());
  const indexes=dimensions.map((_,i)=>i);let active=Promise.resolve();
  const run=serialMatcher(async canvas=>{const {featurePoints}=await controller.detect(canvas);if(featurePoints.length<12)return -1;let timeout;try{const match=await Promise.race([controller._workerMatch(featurePoints,indexes),new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.worker?.terminate();if(cachedMatcher?.key===key)cachedMatcher=null;reject(new Error('인식 응답 시간이 초과됐어요. 카메라를 다시 열어주세요.'));},20000);})]);return match.targetIndex;}finally{clearTimeout(timeout);}});
  return {match(canvas,signal){const p=run(canvas,signal);active=p.catch(()=>{});return p;},idle:()=>active,dispose(){controller.dispose();controller.worker?.terminate();for(const tensor of Object.values(controller.cropDetector.detector.tensorCaches||{}))tensor?.dispose?.();}};
 })();
 cachedMatcher={key,promise};try{return await promise;}catch(e){if(cachedMatcher?.promise===promise)cachedMatcher=null;throw e;}
}
export async function startVision({container,blob,bundleVersion,count,onFound,onStatus=()=>{},signal,deviceId}){
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.className='recognition-video';
 const frozen=document.createElement('canvas');frozen.className='recognition-freeze';frozen.hidden=true;container.replaceChildren(video,frozen);
 const local=new AbortController();let stopped=false,paused=false,timer=null,working=false,attempt=0,matcher,stream;
 const canvas=document.createElement('canvas');
 function stop(){if(stopped)return;stopped=true;local.abort();clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());video.srcObject=null;container.replaceChildren();signal.removeEventListener('abort',stop);}
 signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
 function resume(){if(stopped)return;paused=false;frozen.hidden=true;clearTimeout(timer);timer=setTimeout(tick,180);}
 function pause(){paused=true;clearTimeout(timer);}
 async function recognize(source,mode,contrast=false){drawRecognitionFrame(source,canvas,mode,contrast);return matcher.match(canvas,local.signal);}
 async function tick(){
  if(stopped||paused)return;if(working){timer=setTimeout(tick,180);return;}
  if(video.readyState<2){timer=setTimeout(tick,180);return;}working=true;
  try{const index=await recognize(video,attempt++%2===0?'center':'whole');if(stopped||paused)return;if(index>=0&&index<count){pause();onFound(index);}else if(attempt%8===0)onStatus('물건 앞면을 중앙에 비춰주세요. 반사광은 피하고, 안 잡히면 아래 정밀 인식을 눌러주세요.');}
  catch(e){pause();if(!stopped)onStatus('인식을 완료하지 못했어요. 카메라를 닫고 다시 열어주세요.');}
  finally{working=false;if(!paused&&!stopped)timer=setTimeout(tick,180);}
 }
 async function capture(){
  if(stopped||video.readyState<2)return false;pause();while(working&&!stopped)await new Promise(r=>setTimeout(r,40));if(stopped)return false;working=true;
  frozen.width=video.videoWidth;frozen.height=video.videoHeight;frozen.getContext('2d').drawImage(video,0,0);frozen.hidden=false;
  try{
   const variants=[['center',false],['whole',false],['close',false],['center',true],['whole',true],['close',true]];
   for(let i=0;i<variants.length;i++){
    if(stopped)return false;onStatus(`사진 정밀 인식 중 · ${i+1}/${variants.length} · 잠시 기다려주세요`);
    const index=await recognize(frozen,...variants[i]);if(stopped)return false;
    if(index>=0&&index<count){onFound(index);return true;}
   }
   onStatus('이 사진에서는 찾지 못했어요. 반사광을 피하고 등록된 앞면이 크게 보이게 다시 비춰주세요.');return false;
  }catch(e){if(!stopped)onStatus('사진 인식을 완료하지 못했어요. 카메라를 다시 열어주세요.');return false;}
  finally{working=false;}
 }
 try{
  stream=await openCamera(video,local.signal,deviceId);
  onStatus('카메라 연결 완료 · 인식 준비 중');matcher=await createImageMatcher(blob,bundleVersion||blob);
  if(stopped)throw new DOMException('취소됨','AbortError');timer=setTimeout(tick,180);
 }catch(e){stop();throw e;}
 return {stop,pause,resume,capture,isWorking:()=>working,clear(){},show(){}};
}
