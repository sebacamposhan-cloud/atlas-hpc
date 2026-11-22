import {resolveFootprints} from './geometry-authority.mjs';
import {buildHitIndex} from './hit-index.mjs';
import {combinarContornos} from './contornos-nube.mjs';
import {nivel} from './level.mjs';
const ns='http://www.w3.org/2000/svg';
const mobilePlan=window.matchMedia('(max-width: 1023px), (pointer: coarse)');
const MOBILE_TILES=24;
const overviewImages=new Map(), missingMobileOverviews=new Set();
let map,architectureMap,drawingMap,atlas,svg,tiles,requestedView,frame=0,tileTimer,geometry=new Map(),hit=()=>null;
const paths=new Map(),activeTiles=new Map();
let currentRooms,currentAliases,currentSelection,currentContornos=[],contornosArchivo=null;
// Un contorno guardado en la nube desde el editor (en este u otro equipo) redibuja el plano sin recargar.
if(typeof window!=='undefined')window.addEventListener('atlas-contornos-nube',()=>{if(!currentRooms||!contornosArchivo)return;currentContornos=combinarContornos(contornosArchivo,nivel.id);geometry=resolveFootprints(atlas,[...currentRooms.values()],currentAliases,currentSelection,currentContornos);paths.clear();hit=buildHitIndex(geometry.values());window.dispatchEvent(new CustomEvent('atlas-geometry-changed'));});
// Capas del dibujo que se pueden apagar (mobiliario, ejes, relleno): teselas transparentes sobre la base, con mezcla multiplicar.
// La preferencia se guarda en este equipo y vale para todos los pisos.
const CLAVE_CAPAS='atlas-capas-dibujo';let capasVisibles={},grupos=new Map(),teselasCapa=new Map();
try{capasVisibles=JSON.parse(localStorage.getItem(CLAVE_CAPAS)||'{}')||{};}catch{}
const capaVisible=id=>capasVisibles[id]!==false;
export async function prepareViewer(a,rooms,aliases,runtime){
 atlas=a;svg=document.getElementById('svg');
 architectureMap=runtime.map;
 const s=runtime.selection;paths.clear();
 currentRooms=new Map(rooms.map(r=>[r.id,r]));currentAliases=aliases;currentSelection=s;currentContornos=runtime.contornos||[];contornosArchivo=runtime.contornosArchivo||null;
 geometry=resolveFootprints(a,rooms,aliases,s,currentContornos);
 hit=buildHitIndex(geometry.values());
 mountDrawing(drawingMap||architectureMap);
 return {coverage:geometry.size,method:s.method};
}
export function setDrawingMap(drawing=null){
 drawingMap=drawing;
 const next=drawingMap||architectureMap;
 if(!next||map===next)return;
 mountDrawing(next);
 updateTiles();
}
function mountDrawing(m){
 map=m;clearTiles();
 const bg=document.getElementById('background');
 bg.replaceChildren();overviewImages.clear();
 for(const {id='',overview:url} of [m,...(m.capas||[])]){
  const image=document.createElementNS(ns,'image');
  image.setAttribute('x',m.origin[0]);image.setAttribute('y',m.origin[1]);
  image.setAttribute('width',m.width);image.setAttribute('height',m.height);
  if(id){image.dataset.capa=id;image.style.mixBlendMode='multiply';}
  const mobileUrl=url.replace(/overview\.webp$/,'overview-mobile.webp');
  image.addEventListener('error',()=>{
   if(!image.isConnected)return;
   if(mobileUrl!==url&&image.getAttribute('href')===mobileUrl){
    missingMobileOverviews.add(mobileUrl);
    image.setAttribute('href',url);
   }else if(!id&&m===drawingMap){
    window.dispatchEvent(new Event('atlas-teselas-faltan'));
   }
  });
  overviewImages.set(id,{image,url,mobileUrl});
  bg.append(image);
 }
 updateOverviews();
 // Capas de dibujo opcionales del nivel (bordes de láminas y de sectores): van en su propio grupo, encima de las teselas de
 // detalle (que son opacas y las tapaban) y debajo de los contornos de los recintos.
 let sobre=document.getElementById('capasSobre');if(!sobre){sobre=document.createElementNS(ns,'g');sobre.id='capasSobre';sobre.setAttribute('pointer-events','none');document.getElementById('detailImage').after(sobre);}
 sobre.setAttribute('clip-path','url(#scopeClip)');sobre.replaceChildren();
 for(const o of m.overlays||[]){const el=document.createElementNS(ns,'image');el.dataset.overlay=o.id;el.setAttribute('href',o.href);el.setAttribute('x',m.origin[0]);el.setAttribute('y',m.origin[1]);el.setAttribute('width',m.width);el.setAttribute('height',m.height);if(o.visible===false)el.style.display='none';sobre.append(el);}
 tiles=document.getElementById('detailImage');tiles.replaceChildren();grupos=new Map();teselasCapa=new Map();
 const baseTiles=document.createElementNS(ns,'g');tiles.append(baseTiles);grupos.set('',baseTiles);
 for(const c of m.capas||[]){const g=document.createElementNS(ns,'g');g.dataset.capa=c.id;g.style.mixBlendMode='multiply';tiles.append(g);grupos.set(c.id,g);teselasCapa.set(c.id,new Set(Object.entries(c.teselas||{}).flatMap(([z,keys])=>keys.map(k=>z+'_'+k))));}
}
export function footprint(id){return geometry.get(id);}
export function hitRoom(p){return hit(p);}
export function hitRoomCandidates(p){return hit.candidates?.(p) ?? [];}
export function updateFootprint(r){currentRooms.set(r.id,r);geometry=resolveFootprints(atlas,[...currentRooms.values()],currentAliases,currentSelection,currentContornos);paths.clear();hit=buildHitIndex(geometry.values());}
export function footprintPath(id){if(paths.has(id))return paths.get(id);const e=geometry.get(id);if(!e)return '';const ring=pts=>'M'+pts.map(p=>p.join(',')).join('L')+'Z';const d=e.rings.map(p=>ring(p.polygon)+p.holes.map(ring).join('')).join('');paths.set(id,d);return d;}
export function flushView(){if(frame){cancelAnimationFrame(frame);frame=0;}if(svg&&requestedView)svg.setAttribute('viewBox',requestedView.join(' '));}
export function mapView(v){requestedView=v;if(!svg)return;if(!frame)frame=requestAnimationFrame(()=>{frame=0;svg.setAttribute('viewBox',requestedView.join(' '));});clearTimeout(tileTimer);tileTimer=setTimeout(updateTiles,80);}
export function overlays(){return map?.overlays||[];}
export function capasDibujo(){return (map?.capas||[]).map(c=>({id:c.id,nombre:c.nombre,visible:capaVisible(c.id)}));}
function updateOverviews(){
 for(const [id,{image,url,mobileUrl}] of overviewImages){
  if(id&&!capaVisible(id)){image.removeAttribute('href');continue;}
  const desired=mobilePlan.matches&&!missingMobileOverviews.has(mobileUrl)?mobileUrl:url;
  if(image.getAttribute('href')!==desired)image.setAttribute('href',desired);
 }
}
export function mostrarCapa(id,visible){
 capasVisibles[id]=visible;
 try{localStorage.setItem(CLAVE_CAPAS,JSON.stringify(capasVisibles));}catch{}
 updateOverviews();
 updateTiles();
}
export function showOverlay(id,visible){const el=document.querySelector('#capasSobre [data-overlay="'+CSS.escape(id)+'"]');if(el)el.style.display=visible?'':'none';}
function clearTiles(){
 for(const tile of activeTiles.values())tile.remove();
 activeTiles.clear();
}
function tilesFor(level,a,b,capas,limit){
 const span=map.tileSize/level.scale,[ox,oy]=map.origin;
 const left=Math.max(0,Math.floor((a.x-ox)/span)),top=Math.max(0,Math.floor((a.y-oy)/span));
 const right=Math.min(level.columns-1,Math.floor((b.x-ox)/span)),bottom=Math.min(level.rows-1,Math.floor((b.y-oy)/span));
 const desired=new Map();
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)for(const [capa,ruta] of capas){
  const name=level.z+'_'+x+'_'+y;
  if(capa&&!teselasCapa.get(capa)?.has(name))continue;
  if(desired.size>=limit)return null;
  const key=capa?capa+':'+name:name;
  desired.set(key,{capa,url:`${ruta}${level.z}/${x}_${y}.webp`,x:ox+x*span,y:oy+y*span,
   w:Math.min(span,map.width-x*span),h:Math.min(span,map.height-y*span)});
 }
 return desired;
}
export function updateTiles(){
 clearTimeout(tileTimer);tileTimer=0;
 if(!map||!svg||!map.levels.length)return;
 flushView();
 const rect=svg.getBoundingClientRect(),matrix=svg.getScreenCTM();
 if(!matrix||document.hidden||document.body.classList.contains('floorHome')||!rect.width||!rect.height||getComputedStyle(svg).visibility==='hidden'){
  clearTiles();
  return;
 }
 const inv=matrix.inverse(),a=new DOMPoint(rect.left,rect.top).matrixTransform(inv),b=new DOMPoint(rect.right,rect.bottom).matrixTransform(inv);
 const mobile=mobilePlan.matches,density=matrix.a*Math.min(mobile?1.5:2,devicePixelRatio||1);
 if(density<.32){clearTiles();return;}
 const capas=[['',map.tilePath||'map/'],...(map.capas||[]).filter(c=>capaVisible(c.id)).map(c=>[c.id,c.tilePath])];
 let index=map.levels.findIndex(level=>level.scale>=density);
 if(index===-1)index=map.levels.length-1;
 let desired;
 // If a dense viewport exceeds the budget, pick a coarser level with complete coverage.
 for(;index>=0&&!desired;index--)desired=tilesFor(map.levels[index],a,b,capas,mobile?MOBILE_TILES:Infinity);
 if(!desired){clearTiles();return;}
 // Detach tiles from the previous viewport before adding the next set.
 for(const [key,tile] of activeTiles)if(!desired.has(key)){tile.remove();activeTiles.delete(key);}
 for(const [key,{capa,url,x,y,w,h}] of desired){
  if(activeTiles.has(key)||Date.now()-(teselasFallidas.get(url)||0)<TESELA_PAUSA)continue;
  const image=document.createElementNS(ns,'image');
  image.dataset.tile=key;
  for(const [attr,val] of Object.entries({x,y,width:w,height:h,preserveAspectRatio:'none',decoding:'async'}))image.setAttribute(attr,val);
  image.addEventListener('error',()=>{
   if(activeTiles.get(key)!==image)return;
   teselasFallidas.set(url,Date.now());avisarTeselaFaltante();
   activeTiles.delete(key);image.remove();
  },{once:true});
  activeTiles.set(key,image);
  (grupos.get(capa)||tiles).append(image);
  image.setAttribute('href',url);
 }
}
mobilePlan.addEventListener('change',()=>{updateOverviews();updateTiles();});
document.addEventListener('visibilitychange',updateTiles);
window.addEventListener('atlas-floor-home',clearTiles);
window.addEventListener('atlas-floor-resume',updateTiles);
// Una tesela que no cargó (sin señal y piso sin guardar) no se vuelve a pedir en cada movimiento del plano: antes se
// pedía de nuevo al instante y, con señal débil, cada pedido esperaba la red y el plano se trababa. Vuelve a intentarse
// al minuto o cuando vuelve la señal. offline.mjs escucha «atlas-teselas-faltan» para avisar que falta guardar el piso.
const TESELA_PAUSA=60000,teselasFallidas=new Map();let avisoTesela=0;
function avisarTeselaFaltante(){if(Date.now()-avisoTesela<5000)return;avisoTesela=Date.now();window.dispatchEvent(new Event('atlas-teselas-faltan'));}
window.addEventListener('online',()=>{teselasFallidas.clear();updateTiles();});
export function exportMapURL(){return map.export;}
export function mapa(){return map;}
