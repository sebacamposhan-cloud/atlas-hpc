import {deriveAsepsis} from './documentary-evidence.mjs';
// Shared documentary categories. Empty fields never acquire a fabricated finish.
export const UNKNOWN='Pendiente de identificación';
export const layerNames={asepsis:'Asepsia',PAV:'Pavimentos',paint:'Pinturas',CIE:'Cielos',walls:'Muros',status:'Validación',sector:'Sectores',selected:'Selección'};
// Capas calculadas por otros módulos (p. ej. avance de obra u observaciones): {nombre, categories(r), color(key), opacity}.
export const dynamicLayers={};
export function registerLayer(type,layer){dynamicLayers[type]=layer;layerNames[type]=layer.nombre;}
export function categories(r,type){
 let values=[];
 if(dynamicLayers[type])values=dynamicLayers[type].categories(r);
 else if(type==='asepsis')values=deriveAsepsis(r.finishes);
 else if(type==='status')values=[r.status];
 else if(type==='sector')values=[r.sector];
 else if(type==='selected')values=[r.id];
 else values=(r.finishes||[]).filter(f=>type==='walls'?/^M[1-4]$/.test(f.field):type==='paint'?/^M[1-4]$/.test(f.field)&&/pintura|esmalte/i.test(f.description):f.field===type).map(f=>f.code);
 return [...new Set(values.filter(v=>v!==undefined&&v!==null&&String(v).trim()))].sort().length?[...new Set(values.filter(v=>v!==undefined&&v!==null&&String(v).trim()))].sort(): [type==='paint'?'Sin pintura explícita en muros':UNKNOWN];
}
export function distribution(rooms,type){const counts=new Map();for(const r of rooms)for(const key of categories(r,type))counts.set(key,(counts.get(key)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));}
export function matchesLayers(room,filters){return Object.entries(filters).every(([type,values])=>!values.length||categories(room,type).some(k=>values.includes(k)));}
// Paleta viva y sólida, encabezada por el cian. Sin magenta: el magenta queda para el contorno de «Recintos con retorno».
export const PALETA=['#00b8d9','#ffb000','#2ecc40','#7b61ff','#ff6a00','#0057ff','#00c2a8','#8bc34a','#a0522d','#00e5ff','#ffd60a','#e53935'];
// Orden de las categorías de cada capa en el piso (workspace.mjs): cada código toma un color distinto de la paleta, en orden.
const ordenes={};
export function ordenarPaleta(type,keys){ordenes[type]=new Map(keys.filter(k=>k!==UNKNOWN&&k!=='-').map((k,i)=>[k,i]));}
export function categoryColor(type,key,custom={}){const saved=custom[type+'|'+key];if(/^#[0-9a-f]{6}$/i.test(saved||''))return saved;if(dynamicLayers[type]?.color)return dynamicLayers[type].color(key);if(type==='asepsis')return {baja:'#2ecc40',media:'#0057ff',alta:'#ff6a00'}[key]||'#8b959e';if(type==='status')return key==='Validado'?'#2ecc40':'#ffb000';if(key===UNKNOWN||key==='-')return '#8b959e';const i=ordenes[type]?.get(key);if(i!==undefined)return PALETA[i%PALETA.length];let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;return PALETA[h%PALETA.length];}
// Borde de un recinto filtrado: el mismo tono del color, oscurecido para que se lea sobre el plano.
export function tonoOscuro(color,f=.45){const m=/^#?([0-9a-f]{6})$/i.exec(String(color||""));if(!m)return "#1b2a56";const n=parseInt(m[1],16),c=k=>Math.round(((n>>k)&255)*(1-f)).toString(16).padStart(2,"0");return "#"+c(16)+c(8)+c(0);}
// Rellenos sólidos (85%) y sin mezcla con el fondo, para que los colores se vean fuertes y limpios en todos los planos.
// Los grises y blancos de «sin datos» quedan suaves para no tapar el plano.
export const OPACIDAD=.85,OPACIDAD_NEUTRA=.35;
export const OPACIDAD_FILTRO=OPACIDAD;
export function esNeutro(color){const m=/^#?([0-9a-f]{6})$/i.exec(String(color||''));if(!m)return false;const n=parseInt(m[1],16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,max=Math.max(r,g,b),min=Math.min(r,g,b);return max-min<24;}
export function categoryAppearance(type,key,custom={}){
 const color=categoryColor(type,key,custom),personal=/^#[0-9a-f]{6}$/i.test(custom[type+'|'+key]||'');
 return {color,fill:color,pattern:null,kind:personal?'custom':'consultation',opacity:esNeutro(color)?OPACIDAD_NEUTRA:OPACIDAD,blend:'normal'};
}
export function auditRoom(r,hasGeometry){const issues=[];if(!r.code?.trim())issues.push('Sin código');if(!r.name?.trim())issues.push('Sin nombre');if(!hasGeometry)issues.push('Sin superficie de consulta');if(r.geometry_status!=='Validado')issues.push('Contorno técnico pendiente');if(r.finishes?.length!==6||r.finishes.some(f=>!f.code||/sin (descripción|identificar|información)/i.test(f.description||'')))issues.push('Terminaciones incompletas');return issues;}
