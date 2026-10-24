// Shared documentary categories. Empty fields never acquire a fabricated finish.
export const UNKNOWN='Pendiente de identificación';
export const layerNames={asepsis:'Asepsia',PAV:'Pavimentos',paint:'Pinturas',CIE:'Cielos',walls:'Muros',status:'Validación',sector:'Sectores',selected:'Selección'};
export function categories(r,type){
 let values=[];
 if(type==='asepsis')values=r.asepsis||[];
 else if(type==='status')values=[r.status];
 else if(type==='sector')values=[r.sector];
 else if(type==='selected')values=[r.id];
 else values=(r.finishes||[]).filter(f=>type==='walls'?/^M[1-4]$/.test(f.field):type==='paint'?/^M[1-4]$/.test(f.field)&&/pintura|esmalte/i.test(f.description):f.field===type).map(f=>f.code);
 return [...new Set(values.filter(v=>v!==undefined&&v!==null&&String(v).trim()))].sort().length?[...new Set(values.filter(v=>v!==undefined&&v!==null&&String(v).trim()))].sort(): [type==='paint'?'Sin pintura explícita en muros':UNKNOWN];
}
export function distribution(rooms,type){const counts=new Map();for(const r of rooms)for(const key of categories(r,type))counts.set(key,(counts.get(key)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));}
export function matchesLayers(room,filters){return Object.entries(filters).every(([type,values])=>!values.length||categories(room,type).some(k=>values.includes(k)));}
const palette=['#4f7898','#8a76a7','#a88a54','#578c83','#b46f75','#788650','#7a8dba','#a27893','#697c88','#a98c75','#688e70'];
export function categoryColor(type,key,custom={}){const saved=custom[type+'|'+key];if(/^#[0-9a-f]{6}$/i.test(saved||''))return saved;if(type==='asepsis')return {baja:'#35a66b',media:'#387bd4',alta:'#cb8852'}[key]||'#8b959e';if(type==='status')return key==='Validado'?'#35a66b':'#b18a51';if(key===UNKNOWN||key==='-')return '#8b959e';let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;return palette[h%palette.length];}
export function auditRoom(r,hasGeometry){const issues=[];if(!r.code?.trim())issues.push('Sin código');if(!r.name?.trim())issues.push('Sin nombre');if(!hasGeometry)issues.push('Sin superficie de consulta');if(r.geometry_status!=='Validado')issues.push('Contorno técnico pendiente');if(r.finishes?.length!==6||r.finishes.some(f=>!f.code||/sin (descripción|identificar|información)/i.test(f.description||'')))issues.push('Terminaciones incompletas');return issues;}
