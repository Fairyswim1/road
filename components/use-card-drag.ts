"use client";
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent} from "react";

export type CardDrop = number|"inventory"|null;
type Gesture={id:string;pointer:number;startX:number;startY:number;x:number;y:number;active:boolean;version:number;source:HTMLElement};
export function useCardDrag(enabled:boolean,version:number,onDrop:(id:string,target:Exclude<CardDrop,null>,version:number)=>void,touchDrag=false){
 const root=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),frame=useRef(0),ignoreClickUntil=useRef(0);
 const callback=useRef(onDrop);callback.current=onDrop;
 const [drag,setDrag]=useState<{id:string;x:number;y:number;target:CardDrop}|null>(null);
 function targetAt(x:number,y:number):CardDrop{
  const el=document.elementFromPoint(x,y);if(!el||!root.current?.contains(el))return null;
  const cell=el.closest<HTMLElement>("[data-road-cell]");if(cell)return Number(cell.dataset.roadCell);
  return el.closest("[data-road-inventory]")?"inventory":null;
 }
 function show(g:Gesture){setDrag({id:g.id,x:g.x,y:g.y,target:targetAt(g.x,g.y)});}
 function clear(){const g=gesture.current;gesture.current=null;cancelAnimationFrame(frame.current);if(g?.source.hasPointerCapture(g.pointer))g.source.releasePointerCapture(g.pointer);setDrag(null);}
 function cancel(){if(gesture.current?.active)ignoreClickUntil.current=Date.now()+500;clear();}
 function scroll(){
  const g=gesture.current;if(!g?.active)return;
  const scroller=root.current?.querySelector<HTMLElement>("[data-road-scroll]");
  if(scroller){const r=scroller.getBoundingClientRect();if(g.x>=r.left&&g.x<=r.right&&g.y>=r.top&&g.y<=r.bottom){const dy=g.y<r.top+36?-10:g.y>r.bottom-36?10:0;scroller.scrollBy(0,dy);}}
  const dy=g.y<60?-12:g.y>window.innerHeight-60?12:0;if(dy)window.scrollBy(0,dy);
  show(g);frame.current=requestAnimationFrame(scroll);
 }
 function start(e:ReactPointerEvent<HTMLElement>,id:string){
  if((e.pointerType==="touch"&&!touchDrag)||!enabled||!e.isPrimary||e.button!==0||gesture.current)return;
  ignoreClickUntil.current=0;
  gesture.current={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,version,source:e.currentTarget};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:ReactPointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;g.x=e.clientX;g.y=e.clientY;
  if(!g.active&&Math.hypot(g.x-g.startX,g.y-g.startY)>=8){g.active=true;frame.current=requestAnimationFrame(scroll);}
  if(g.active){e.preventDefault();show(g);}
 }
 function end(e:ReactPointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  const target=targetAt(e.clientX,e.clientY);if(g.active){e.preventDefault();ignoreClickUntil.current=Date.now()+500;}
  clear();if(g.active&&enabled&&target!==null)callback.current(g.id,target,g.version);
 }
 function click(e:ReactMouseEvent){if(e.detail!==0&&Date.now()<ignoreClickUntil.current){e.preventDefault();e.stopPropagation();ignoreClickUntil.current=0;}}
 useEffect(()=>{if(!enabled)cancel();},[enabled]);
 useEffect(()=>{function key(e:KeyboardEvent){if(e.key==="Escape")cancel();}window.addEventListener("blur",cancel);window.addEventListener("keydown",key);return()=>{cancelAnimationFrame(frame.current);const g=gesture.current;gesture.current=null;if(g?.source.hasPointerCapture(g.pointer))g.source.releasePointerCapture(g.pointer);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key);};},[]);
 return {root,drag,start,move,end,cancel,click};
}
