import assert from 'node:assert/strict';
import {scanPositions,widenRecognition,tuneCamera} from '../public/ar-recognition.js';
for(const [w,h,size] of [[640,480,256],[1280,720,256],[720,1280,256],[1920,1080,512]]){
 const points=scanPositions(w,h,size);
 assert.deepEqual(points[0],[Math.floor((w-size)/2),Math.floor((h-size)/2)]);
 for(const [x,y] of points){assert.ok(x>=0&&y>=0&&x+size<=w&&y+size<=h);}
 for(let x=0;x<w;x+=16)for(let y=0;y<h;y+=16)assert.ok(points.some(([a,b])=>x>=a&&x<a+size&&y>=b&&y<b+size),`missed ${x},${y}`);
 let calls=0;const cropDetector={width:w,height:h,cropSize:size,detectMoving(){},_detect(input,x,y){calls++;return [x,y];}};
 assert.equal(widenRecognition({cropDetector}),true);
 for(const point of points)assert.deepEqual(cropDetector.detectMoving('frame'),point);
 assert.deepEqual(cropDetector.detectMoving('frame'),points[0]);assert.equal(calls,points.length+1);
}
assert.equal(widenRecognition({}),false);assert.deepEqual(scanPositions(100,100,256),[]);
function camera({reject=false,abort=false,width=640,height=480}={}){
 const controller=new AbortController(),calls=[],attrs={},settings={width,height};let stopped=0;
 const video={videoWidth:width,videoHeight:height,setAttribute:(k,v)=>attrs[k]=v};
 const track={getSettings:()=>settings,getCapabilities:()=>({focusMode:['continuous']}),getConstraints:()=>({width:{ideal:1280},height:{ideal:720}}),stop:()=>stopped++,async applyConstraints(c){calls.push(c);if(abort)controller.abort();if(reject)throw Error('unsupported');if(c.width){settings.width=1280;settings.height=720;video.videoWidth=1280;video.videoHeight=720;}}};
 video.srcObject={getVideoTracks:()=>[track],getTracks:()=>[track]};return {video,controller,calls,attrs,stopped:()=>stopped};
}
const hd=camera();await tuneCamera(hd.video,hd.controller.signal);assert.equal(hd.calls[0].width.ideal,1280);assert.equal(hd.attrs.width,1280);assert.equal(hd.calls[1].width.ideal,1280);
const fallback=camera({reject:true});await tuneCamera(fallback.video,fallback.controller.signal);assert.equal(fallback.attrs.width,640);
const cancelled=camera({abort:true});await assert.rejects(tuneCamera(cancelled.video,cancelled.controller.signal),/취소/);assert.equal(cancelled.stopped(),1);
console.log('PASS landscape/portrait full-frame coverage, one crop per frame, camera HD/focus, unsupported fallback and cancellation cleanup');
