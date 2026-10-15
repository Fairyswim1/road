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
export async function startVision({container,blob,count,onFound,onLost,signal}){
 const cardArt=new Image();cardArt.src="/art/card-slate.webp";await Promise.allSettled([cardArt.decode(),document.fonts.load('800 132px "Road Myeongjo"')]);
 const [{MindARThree},THREE]=await Promise.all([import(CDN+'mindar-image-three.prod.js'),import('three')]);
 if(signal.aborted)throw new Error('탐색이 취소됐어요.');
 const url=URL.createObjectURL(blob),ar=new MindARThree({container,imageTargetSrc:url,maxTrack:1,uiLoading:'no',uiScanning:'no',uiError:'no',warmupTolerance:5,missTolerance:5});
 ar.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 const anchors=Array.from({length:count},(_,index)=>{const a=ar.addAnchor(index);a.onTargetFound=()=>onFound(index);a.onTargetLost=()=>onLost(index);return a;});
 let mesh=null,disposed=false;
 function clear(){if(mesh){mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();mesh=null;}}
 function stop(){disposed=true;clear();ar.renderer.setAnimationLoop(null);try{ar.controller?.stopProcessVideo();}catch{}ar.video?.srcObject?.getTracks().forEach(t=>t.stop());ar.video?.remove();ar.renderer.dispose();URL.revokeObjectURL(url);container.replaceChildren();}
 signal.addEventListener('abort',stop,{once:true});
 let timer;try{await Promise.race([ar.start().then(()=>{if(disposed)stop();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('카메라를 준비하지 못했습니다. Safari 카메라 권한을 확인하고 다시 시도하세요.')),60000);})]);}catch(e){stop();throw e;}finally{clearTimeout(timer);}
 if(disposed)throw new Error('탐색이 취소됐어요.');
 ar.renderer.setAnimationLoop(()=>ar.renderer.render(ar.scene,ar.camera));
 return {stop,clear,show(index,card){clear();if(disposed||!anchors[index])return;const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');const fill=c.createLinearGradient(0,0,512,512);fill.addColorStop(0,'#242123');fill.addColorStop(1,'#09090b');c.fillStyle=fill;c.fillRect(0,0,512,512);if(cardArt.complete&&cardArt.naturalWidth)c.drawImage(cardArt,0,0,512,512);c.strokeStyle='#96908a';c.lineWidth=4;c.strokeRect(3,3,506,506);const ports={N:[256,0],S:[256,512],E:[512,256],W:[0,256]};c.strokeStyle='#e66369';c.lineWidth=17;c.lineCap='butt';for(const d of card.shape){c.beginPath();c.moveTo(256,256);c.lineTo(...ports[d]);c.stroke();}c.fillStyle='#fffaf2';c.font='800 132px \"Road Myeongjo\",Georgia,serif';c.textAlign='right';c.textBaseline='top';c.shadowColor='#000';c.shadowBlur=8;c.fillText(card.value,455,57);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;mesh=new THREE.Mesh(new THREE.PlaneGeometry(.65,.65),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));mesh.position.z=.04;anchors[index].group.add(mesh);}};
}
