import assert from 'node:assert/strict';
import {frameRect,normalizeContrast,serialMatcher,openCamera} from '../public/ar-recognition.js';
for(const [w,h] of [[640,480],[720,1280],[1920,1080]])for(const mode of ['center','whole','close']){const r=frameRect(w,h,mode);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h);if(mode==='whole')assert.deepEqual(r,{x:0,y:0,width:w,height:h});}
assert.throws(()=>frameRect(0,0));
const blank=new Uint8ClampedArray([255,255,255,255,255,255,255,255]);normalizeContrast(blank);assert.deepEqual([...blank],[255,255,255,255,255,255,255,255]);
const gray=new Uint8ClampedArray([80,80,80,255,180,180,180,255]);normalizeContrast(gray);assert.ok(gray[4]-gray[0]>100);assert.equal(gray[3],255);
let active=0,max=0;const seen=[];
const run=serialMatcher(async x=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,15));seen.push(x);active--;return x;});
const a=new AbortController(),b=new AbortController();const first=run(1,a.signal),second=run(2,b.signal);b.abort();assert.deepEqual(await Promise.allSettled([first,second]),[{status:'fulfilled',value:1},{status:'rejected',reason:await second.catch(e=>e)}]);assert.deepEqual(seen,[1]);assert.equal(max,1);
const c=new AbortController();const pending=run(3,c.signal);setTimeout(()=>c.abort(),3);await assert.rejects(pending,{name:'AbortError'});assert.equal(await run(4,a.signal),4);
let requested,stops=0;const abort=new AbortController();
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(options){requested=options;abort.abort();return {getTracks:()=>[{stop:()=>stops++}]};}}}});
await assert.rejects(openCamera({},abort.signal),{name:'AbortError'});assert.equal(stops,1);assert.equal(requested.video.width.ideal,640);assert.equal(requested.video.facingMode.ideal,'environment');
console.log('PASS frame coverage, bounded contrast, serialized matches, queued/in-flight cancellation, rear-camera constraints and late-stream cleanup');
