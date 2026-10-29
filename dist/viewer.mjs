import {resolveFootprints} from './geometry-authority.mjs';
import {buildHitIndex} from './hit-index.mjs';
const ns='http://www.w3.org/2000/svg';
let map,atlas,svg,tiles,overview,requestedView,frame=0,tileTimer,geometry=new Map(),hit=()=>null;
const paths=new Map(),activeTiles=new Map();
let currentRooms,currentAliases,currentSelection,currentContornos=[];
// Capas del dibujo que se pueden apagar (mobiliario, ejes, relleno): teselas transparentes sobre la base, con mezcla multiplicar.
// La preferencia se guarda en este equipo y vale para todos los pisos.
const CLAVE_CAPAS='atlas-capas-dibujo';let capasVisibles={},grupos=new Map(),teselasCapa=new Map();
try{capasVisibles=JSON.parse(localStorage.getItem(CLAVE_CAPAS)||'{}')||{};}catch{}
const capaVisible=id=>capasVisibles[id]!==false;
export async function prepareViewer(a,rooms,aliases,runtime){
 atlas=a;svg=document.getElementById('svg');
 const m=runtime.map,s=runtime.selection;map=m;paths.clear();activeTiles.clear();
 currentRooms=new Map(rooms.map(r=>[r.id,r]));currentAliases=aliases;currentSelection=s;currentContornos=runtime.contornos||[];
 geometry=resolveFootprints(a,rooms,aliases,s,currentContornos);
 hit=buildHitIndex(geometry.values());
 const bg=document.getElementById('background');bg.replaceChildren();overview=document.createElementNS(ns,'image');overview.setAttribute('href',m.overview);overview.setAttribute('x',m.origin[0]);overview.setAttribute('y',m.origin[1]);overview.setAttribute('width',m.width);overview.setAttribute('height',m.height);bg.append(overview);
 for(const c of m.capas||[]){const el=document.createElementNS(ns,'image');el.dataset.capa=c.id;el.setAttribute('href',c.overview);el.setAttribute('x',m.origin[0]);el.setAttribute('y',m.origin[1]);el.setAttribute('width',m.width);el.setAttribute('height',m.height);el.style.mixBlendMode='multiply';if(!capaVisible(c.id))el.style.display='none';bg.append(el);}
 // Capas de dibujo opcionales del nivel (ejes, sectores), sobre el plano de fondo.
 for(const o of m.overlays||[]){const el=document.createElementNS(ns,'image');el.dataset.overlay=o.id;el.setAttribute('href',o.href);el.setAttribute('x',m.origin[0]);el.setAttribute('y',m.origin[1]);el.setAttribute('width',m.width);el.setAttribute('height',m.height);if(o.visible===false)el.style.display='none';bg.append(el);}
 tiles=document.getElementById('detailImage');tiles.replaceChildren();grupos=new Map();teselasCapa=new Map();
 const baseTiles=document.createElementNS(ns,'g');tiles.append(baseTiles);grupos.set('',baseTiles);
 for(const c of m.capas||[]){const g=document.createElementNS(ns,'g');g.dataset.capa=c.id;g.style.mixBlendMode='multiply';tiles.append(g);grupos.set(c.id,g);teselasCapa.set(c.id,new Set(Object.entries(c.teselas||{}).flatMap(([z,keys])=>keys.map(k=>z+'_'+k))));}
 return {coverage:geometry.size,method:s.method};
}
export function footprint(id){return geometry.get(id);}
export function hitRoom(p){return hit(p);}
export function updateFootprint(r){currentRooms.set(r.id,r);geometry=resolveFootprints(atlas,[...currentRooms.values()],currentAliases,currentSelection,currentContornos);paths.clear();hit=buildHitIndex(geometry.values());}
export function footprintPath(id){if(paths.has(id))return paths.get(id);const e=geometry.get(id);if(!e)return '';const ring=pts=>'M'+pts.map(p=>p.join(',')).join('L')+'Z';const d=e.rings.map(p=>ring(p.polygon)+p.holes.map(ring).join('')).join('');paths.set(id,d);return d;}
export function flushView(){if(frame){cancelAnimationFrame(frame);frame=0;}if(svg&&requestedView)svg.setAttribute('viewBox',requestedView.join(' '));}
export function mapView(v){requestedView=v;if(!svg)return;if(!frame)frame=requestAnimationFrame(()=>{frame=0;svg.setAttribute('viewBox',requestedView.join(' '));});clearTimeout(tileTimer);tileTimer=setTimeout(updateTiles,80);}
export function overlays(){return map?.overlays||[];}
export function capasDibujo(){return (map?.capas||[]).map(c=>({id:c.id,nombre:c.nombre,visible:capaVisible(c.id)}));}
export function mostrarCapa(id,visible){capasVisibles[id]=visible;try{localStorage.setItem(CLAVE_CAPAS,JSON.stringify(capasVisibles));}catch{}
 document.querySelectorAll('#background [data-capa="'+CSS.escape(id)+'"]').forEach(el=>el.style.display=visible?'':'none');
 if(!visible)for(const [key,el] of activeTiles)if(key.startsWith(id+':')){el.remove();activeTiles.delete(key);}
 updateTiles();}
export function showOverlay(id,visible){const el=document.querySelector('#background [data-overlay="'+CSS.escape(id)+'"]');if(el)el.style.display=visible?'':'none';}
export function updateTiles(){clearTimeout(tileTimer);tileTimer=0;if(!map||!svg||!map.levels.length)return;flushView();const rect=svg.getBoundingClientRect(),matrix=svg.getScreenCTM();if(!matrix)return;const inv=matrix.inverse(),a=new DOMPoint(rect.left,rect.top).matrixTransform(inv),b=new DOMPoint(rect.right,rect.bottom).matrixTransform(inv),density=matrix.a*Math.min(2,devicePixelRatio||1);if(density<.32){for(const g of grupos.values())g.replaceChildren();activeTiles.clear();return;}
 const level=map.levels.find(l=>l.scale>=density)||map.levels.at(-1),span=map.tileSize/level.scale,[ox,oy]=map.origin;
 const left=Math.max(0,Math.floor((a.x-ox)/span)),top=Math.max(0,Math.floor((a.y-oy)/span)),right=Math.min(level.columns-1,Math.floor((b.x-ox)/span)),bottom=Math.min(level.rows-1,Math.floor((b.y-oy)/span));const desired=new Set();
 const capas=[['',map.tilePath||'map/'],...(map.capas||[]).filter(c=>capaVisible(c.id)).map(c=>[c.id,c.tilePath])];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)for(const [capa,ruta] of capas){const tesela=level.z+'_'+x+'_'+y;if(capa&&!teselasCapa.get(capa)?.has(tesela))continue;const key=(capa?capa+':':'')+tesela;desired.add(key);if(activeTiles.has(key))continue;const el=document.createElementNS(ns,'image');el.dataset.tile=key;el.setAttribute('href',`${ruta}${level.z}/${x}_${y}.webp`);el.setAttribute('x',ox+x*span);el.setAttribute('y',oy+y*span);el.setAttribute('width',Math.min(span,map.width-x*span));el.setAttribute('height',Math.min(span,map.height-y*span));el.setAttribute('preserveAspectRatio','none');el.setAttribute('decoding','async');el.addEventListener('error',()=>{if(activeTiles.get(key)===el){activeTiles.delete(key);el.remove();}},{once:true});activeTiles.set(key,el);(grupos.get(capa)||tiles).append(el);}
 for(const [key,el] of activeTiles)if(!desired.has(key)){el.remove();activeTiles.delete(key);}
}
window.addEventListener('online',updateTiles);
export function exportMapURL(){return map.export;}
export function mapa(){return map;}
