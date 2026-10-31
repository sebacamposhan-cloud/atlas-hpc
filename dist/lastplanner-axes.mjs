// Reference axes derived from the selected geometry and Atlas's existing floor grid.
import {crearGrilla,ubicarEjes} from './protocol-ejes.mjs';
import {pisos,nivel} from './level.mjs';
const EPS=0.15;
const clone=v=>structuredClone(v),dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const axisData=e=>({id:e.id,tipo:e.tipo,a:[...e.a],b:[...e.b]});
const rangeLabel=r=>r.desde.id===r.hasta.id?r.desde.id:r.desde.id+'–'+r.hasta.id;
function familyRange(points,grid,type){
 const rows=[...grid.ejes.values()].filter(e=>e.tipo===type);if(!rows.length)return null;
 let normal=[-rows[0].u[1],rows[0].u[0]];if(Math.abs(normal[0])>=Math.abs(normal[1])?normal[0]<0:normal[1]<0)normal=normal.map(v=>-v);normal=normal.map(v=>Object.is(v,-0)?0:v);
 if(rows.some(e=>Math.abs(dot(e.u,normal))>1e-5))return null;
 const values=points.map(p=>dot(p,normal)),min=Math.min(...values),max=Math.max(...values),ordered=rows.map(e=>({...axisData(e),pos:dot(e.a,normal)})).sort((a,b)=>a.pos-b.pos);
 const lower=ordered.filter(e=>e.pos<=min+EPS).at(-1),upper=ordered.find(e=>e.pos>=max-EPS);
 return {normal,min,max,desde:lower||null,hasta:upper||null};
}
function finishAxes(value){
 const complete=value.letras?.desde&&value.letras?.hasta&&value.numeros?.desde&&value.numeros?.hasta;
 if(!complete)return {...value,estado:'fuera-grilla',etiqueta:null,marco:null};
 const etiqueta=rangeLabel(value.letras)+' / '+rangeLabel(value.numeros);
 const limits=[value.letras.desde,value.letras.hasta,value.numeros.desde,value.numeros.hasta],grid=crearGrilla({ejes:[...new Map(limits.map(e=>[e.id,axisData(e)])).values()]});
 const located=ubicarEjes(etiqueta,grid);
 if(located.estado!=='ok')return {...value,estado:'grilla-incompatible',etiqueta:null,marco:null};
 return {...value,estado:'ok',etiqueta,marco:{tipo:located.tipo,poligono:located.poligono,linea:located.linea,punto:located.punto,caja:located.caja}};
}
export function scopeAxes(scope,rawGrid,reference={}){
 const base={schema:1,nivel:reference.nivel||scope.level||null,referencia:{archivo:reference.archivo||null,sha256:reference.sha256||null,fuente:rawGrid?.fuente||null},estado:'sin-grilla',etiqueta:null,marco:null};
 if(!Array.isArray(rawGrid?.ejes)||!rawGrid.ejes.length)return base;
 if(!scope.geometry||!['line','polygon'].includes(scope.geometry.type)||!Array.isArray(scope.geometry.points)||scope.geometry.points.length<2||!scope.geometry.points.every(finitePoint))return {...base,estado:'sin-geometria'};
 const valid=rawGrid.ejes.every(e=>typeof e.id==='string'&&finitePoint(e.a)&&finitePoint(e.b));if(!valid)return base;
 const grid=crearGrilla(rawGrid),letras=familyRange(scope.geometry.points,grid,'letra'),numeros=familyRange(scope.geometry.points,grid,'numero');
 if(!letras||!numeros)return {...base,estado:'grilla-incompatible'};
 return finishAxes({...base,letras,numeros});
}
export function selectionAxes(scopes=[]){
 if(!scopes.length)return {estado:'vacia',etiqueta:null,marco:null,total:0};
 const rows=scopes.map(s=>s.ejes),known=rows.filter(Boolean);if(known.length!==scopes.length)return {estado:'pendiente',etiqueta:null,marco:null,total:scopes.length};
 if(known.some(r=>r.nivel!==known[0].nivel||r.referencia?.sha256!==known[0].referencia?.sha256))return {estado:'fuentes-distintas',etiqueta:null,marco:null,total:scopes.length};
 const invalid=known.find(r=>r.estado!=='ok');if(invalid)return {...clone(invalid),total:scopes.length};
 if(known.some(r=>['letras','numeros'].some(k=>!finitePoint(r[k]?.normal)||!Number.isFinite(r[k].min)||!Number.isFinite(r[k].max)||['desde','hasta'].some(e=>!r[k][e]||typeof r[k][e].id!=='string'||!Number.isFinite(r[k][e].pos)||!finitePoint(r[k][e].a)||!finitePoint(r[k][e].b)))))return {estado:'grilla-incompatible',etiqueta:null,marco:null,total:scopes.length};
 const range=key=>{const entries=known.map(r=>r[key]),normal=entries[0].normal;if(entries.some(r=>r.normal.some((v,i)=>Math.abs(v-normal[i])>1e-6)))return null;return {normal:[...normal],min:Math.min(...entries.map(r=>r.min)),max:Math.max(...entries.map(r=>r.max)),desde:clone(entries.map(r=>r.desde).sort((a,b)=>a.pos-b.pos)[0]),hasta:clone(entries.map(r=>r.hasta).sort((a,b)=>b.pos-a.pos)[0])};};
 const letras=range('letras'),numeros=range('numeros');if(!letras||!numeros)return {estado:'grilla-incompatible',etiqueta:null,marco:null,total:scopes.length};
 return finishAxes({schema:1,nivel:known[0].nivel,referencia:clone(known[0].referencia),letras,numeros,total:scopes.length});
}
export function axesText(value){
 if(value?.estado==='ok')return value.etiqueta;
 return {vacia:'Selecciona recintos en el plano',pendiente:'Ejes pendientes de calcular','sin-grilla':'Grilla de ejes no disponible','sin-geometria':'Contorno pendiente para ubicar los ejes','fuera-grilla':'La selección se extiende fuera de los ejes disponibles','fuentes-distintas':'Las superficies usan grillas distintas; revisa la selección','grilla-incompatible':'La grilla requiere revisión para ubicar esta selección'}[value?.estado]||'Ejes sin registrar';
}
const pending=new Map();
export async function loadAxesGrid(level){
 const floor=pisos.find(p=>p.id===level)||(nivel.id===level?nivel:null);if(!floor)throw Error('Piso no disponible para calcular sus ejes.');
 const file='./'+(floor.datos||'')+'ejes.json';
 if(!pending.has(file))pending.set(file,(async()=>{const response=await fetch(file);if(!response.ok)throw Error('Descarga la grilla de este piso o vuelve a intentarlo con conexión.');const text=await response.text(),grid=JSON.parse(text),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');return {grid,reference:{nivel:level,archivo:file,sha256}};})().catch(error=>{pending.delete(file);throw error;}));
 return pending.get(file);
}
export async function attachScopeAxes(scopes,level){const {grid,reference}=await loadAxesGrid(level);return scopes.map(s=>({...clone(s),ejes:scopeAxes(s,grid,reference)}));}
export function axesMarkup(value,esc,{fontSize=35}={}){
 if(value?.estado!=='ok'||!value.marco)return '';
 const m=value.marco,points=m.poligono||m.linea||(m.punto?[m.punto]:[]);if(!points.length||!points.every(finitePoint)||!Array.isArray(m.caja)||m.caja.length!==4||!m.caja.every(Number.isFinite))return '';
 const path='M'+points.map(p=>p.join(',')).join('L')+(m.poligono?'Z':''),[x,y,w]=m.caja,offset=fontSize*.5;
 const labels=[{x:x+w/2,y:y-offset,text:value.etiqueta}];
 return `<g class="lpAxesReference" pointer-events="none"><path data-lp-axes-frame d="${esc(path)}" fill="none" stroke="#1b2a56" stroke-width="1.8" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"><title>${esc('Ejes de referencia: '+value.etiqueta)}</title></path>${labels.map(label=>`<text data-lp-axis-label x="${label.x}" y="${label.y}" text-anchor="middle" font-size="${fontSize}" fill="#1b2a56" stroke="#fff" stroke-width="${fontSize*.18}" paint-order="stroke" font-weight="700">${esc(label.text)}</text>`).join('')}</g>`;
}
