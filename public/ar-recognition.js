// Adapter for the pinned MindAR 1.2.5 engine. One crop per frame, as before.
export function scanPositions(width,height,size){
 if(![width,height,size].every(Number.isFinite)||size<=0||size>Math.min(width,height))return [];
 const axis=length=>{const end=length-size,n=Math.max(1,Math.ceil(end/(size*.75)));return Array.from({length:n+1},(_,i)=>Math.round(end*i/n));};
 const cx=Math.floor((width-size)/2),cy=Math.floor((height-size)/2);
 const positions=axis(height).flatMap(y=>axis(width).map(x=>[x,y]));
 positions.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cy)-Math.hypot(b[0]-cx,b[1]-cy));
 return [[cx,cy],...positions.filter(([x,y],i,all)=>(x!==cx||y!==cy)&&all.findIndex(p=>p[0]===x&&p[1]===y)===i)];
}
export function widenRecognition(controller){
 const detector=controller?.cropDetector;
 if(!detector||typeof detector._detect!=='function'||typeof detector.detectMoving!=='function')return false;
 const positions=scanPositions(detector.width,detector.height,detector.cropSize);
 if(!positions.length)return false;
 let index=0;
 detector.detectMoving=function(input){const [x,y]=positions[index];index=(index+1)%positions.length;return this._detect(input,x,y);};
 return true;
}
export async function tuneCamera(video,signal){
 const track=video?.srcObject?.getVideoTracks?.()[0];
 const check=()=>{if(signal.aborted){video?.srcObject?.getTracks().forEach(t=>t.stop());throw new Error('탐색이 취소됐어요.');}};
 check();if(!track?.applyConstraints)return;
 const settings=track.getSettings?.()||{};
 // Request HD only on lower-resolution streams. Ideal constraints keep older phones usable.
 if((settings.width||0)*(settings.height||0)<1280*720){
  try{await track.applyConstraints({width:{ideal:1280},height:{ideal:720}});}catch{}
  check();
  const next=track.getSettings?.()||{};
  for(let i=0;i<20&&next.width&&next.height&&(video.videoWidth!==next.width||video.videoHeight!==next.height);i++){await new Promise(r=>setTimeout(r,50));check();}
 }
 try{if(track.getCapabilities?.().focusMode?.includes('continuous'))await track.applyConstraints({...track.getConstraints?.(),advanced:[{focusMode:'continuous'}]});}catch{}
 check();
 video.setAttribute('width',video.videoWidth);video.setAttribute('height',video.videoHeight);
}
