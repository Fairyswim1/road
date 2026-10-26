// Frame geometry for recognition without continuous 3D tracking.
export function frameRect(width,height,mode='center'){
 if(!(width>0&&height>0))throw new Error('카메라 영상을 기다려주세요.');
 if(mode==='whole')return {x:0,y:0,width,height};
 const size=Math.min(width,height)/(mode==='close'?1.5:1);
 return {x:(width-size)/2,y:(height-size)/2,width:size,height:size};
}
export function drawRecognitionFrame(source,canvas,mode='center',contrast=false){
 const width=source.videoWidth||source.naturalWidth||source.width,height=source.videoHeight||source.naturalHeight||source.height;
 const r=frameRect(width,height,mode),ctx=canvas.getContext('2d',{willReadFrequently:true});
 // MindAR's 1024x1024 input uses its native 512px center detector. Fill that entire crop.
 canvas.width=1024;canvas.height=1024;ctx.fillStyle='#777';ctx.fillRect(0,0,1024,1024);
 const scale=Math.min(512/r.width,512/r.height),w=r.width*scale,h=r.height*scale;
 ctx.drawImage(source,r.x,r.y,r.width,r.height,512-w/2,512-h/2,w,h);
 if(contrast){const pixels=ctx.getImageData(256,256,512,512);normalizeContrast(pixels.data);ctx.putImageData(pixels,256,256);}
 return canvas;
}
export function normalizeContrast(data){
 const bins=new Uint32Array(256);for(let i=0;i<data.length;i+=4)bins[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
 const count=data.length/4;let lo=0,hi=255,n=0;
 for(let i=0;i<256;i++){n+=bins[i];if(n>=count*.03){lo=i;break;}}
 n=0;for(let i=255;i>=0;i--){n+=bins[i];if(n>=count*.03){hi=i;break;}}
 if(hi-lo<15)return;
 const gain=Math.min(2,255/(hi-lo));for(let i=0;i<data.length;i+=4)for(let j=0;j<3;j++)data[i+j]=Math.max(0,Math.min(255,(data[i+j]-lo)*gain));
}
// Serializes GPU/worker access. Cancellation invalidates results, including an in-flight match.
export function serialMatcher(match){let tail=Promise.resolve();return (input,signal)=>{const run=tail.then(async()=>{if(signal.aborted)throw new DOMException('취소됨','AbortError');const result=await match(input);if(signal.aborted)throw new DOMException('취소됨','AbortError');return result;});tail=run.catch(()=>{});return run;};}
export async function openCamera(video,signal,deviceId){
 const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
 if(signal.aborted){stream.getTracks().forEach(t=>t.stop());throw new DOMException('취소됨','AbortError');}
 const stop=()=>stream.getTracks().forEach(t=>t.stop());signal.addEventListener('abort',stop,{once:true});
 try{video.srcObject=stream;await video.play();const track=stream.getVideoTracks()[0];
  try{if(track.getCapabilities?.().focusMode?.includes('continuous'))await track.applyConstraints({...track.getConstraints?.(),advanced:[{focusMode:'continuous'}]});}catch{}
  if(signal.aborted)throw new DOMException('취소됨','AbortError');return stream;
 }catch(e){stop();throw e;}
}
