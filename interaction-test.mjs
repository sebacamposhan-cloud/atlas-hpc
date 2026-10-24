import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startPan,panView,startPinch,pinchView} from './dist/gestures.mjs';

const view=[100,200,1000,800],matrix={a:.5,d:.5,e:-40,f:-80};
const pan=startPan(view,matrix,{x:110,y:120});
assert.deepEqual(panView(pan,{x:160,y:90}),[0,260,1000,800]);
const pinch=startPinch(view,matrix,{x:110,y:120},{x:210,y:120});
assert.deepEqual(pinchView(pinch,{x:60,y:120},{x:260,y:120},2000),[250,300,500,400]);
assert.deepEqual(pinchView(pinch,{x:80,y:150},{x:280,y:150},2000),[230,270,500,400]);
for(let i=0;i<100;i++)pinchView(pinch,{x:i,y:100},{x:300-i,y:140},2000);
assert.deepEqual(pinchView(pinch,{x:110,y:120},{x:210,y:120},2000),view,'returning fingers to their start must restore the exact view');
assert.equal(pinchView(pinch,{x:160,y:120},{x:160,y:120},2000)[2],2000);
assert.equal(pinchView(pinch,{x:-10000,y:120},{x:10000,y:120},2000)[2],40);
const continued=startPan([250,300,500,400],{a:1,d:1,e:-240,f:-280},{x:160,y:120});
assert.deepEqual(panView(continued,{x:180,y:150}),[230,270,500,400],'lifting one finger can continue panning without a jump');

// Exercise the actual tile renderer with a minimal SVG adapter. In particular,
// offscreen removals must not skip items in a live children collection.
class Element {
  constructor(){this.attrs={};this.dataset={};this.children=[];this.events={};}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(el){el.parent=this;this.children.push(el);}
  replaceChildren(){for(const el of this.children)el.parent=null;this.children=[];}
  remove(){if(this.parent){const p=this.parent;p.children.splice(p.children.indexOf(this),1);this.parent=null;}}
  addEventListener(k,v){this.events[k]=v;}
}
const svg=new Element(),background=new Element(),detailImage=new Element(),events={};
svg.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:600});
svg.getScreenCTM=()=>{
  const [x,y,w,h]=svg.attrs.viewBox.split(' ').map(Number),a=Math.min(800/w,600/h),e=(800-w*a)/2-x*a,f=(600-h*a)/2-y*a;
  return {a,d:a,e,f,inverse:()=>({a:1/a,d:1/a,e:-e/a,f:-f/a})};
};
globalThis.document={getElementById:id=>({svg,background,detailImage}[id]),createElementNS:()=>new Element()};
globalThis.window={addEventListener:(name,fn)=>events[name]=fn};
globalThis.devicePixelRatio=1;
globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(m){return{x:this.x*m.a+m.e,y:this.y*m.d+m.f};}};
let frames=new Map(),nextFrame=0;
globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const {prepareViewer,mapView,updateTiles}=await import('./dist/viewer.mjs');
const map=JSON.parse(fs.readFileSync('dist/map/index.json'));
await prepareViewer({tiles:[]},[],new Map(),{map,selection:{rooms:[]}});
const [ox,oy]=map.origin;
for(let i=0;i<12;i++){
  const col=(i*3)%5,row=(i*2)%8;
  mapView([ox+col*768,oy+row*768,800,600]);updateTiles();
  assert.deepEqual(detailImage.children.map(e=>e.dataset.tile).sort(),[`1_${col}_${row}`,`1_${col+1}_${row}`].sort(),'only the two visible tiles remain');
  const before=detailImage.children.slice();updateTiles();assert.deepEqual(detailImage.children,before,'unchanged views reuse existing images');
}
const broken=detailImage.children[0];broken.events.error();assert.equal(detailImage.children.length,1);
events.online();assert.equal(detailImage.children.length,2,'failed images retry after connectivity returns');
for(let i=0;i<50;i++)mapView([ox+i,oy,800,600]);
assert.equal(frames.size,1,'multiple movement events coalesce into one display frame');
mapView([ox,oy,8000,6000]);updateTiles();assert.equal(detailImage.children.length,0);assert.equal(frames.size,0);
console.log('Gesture anchoring, pinch/pan continuity, frame coalescing, tile cleanup and connection recovery: passed');
