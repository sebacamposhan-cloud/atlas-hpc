import {progressFloors,progressRooms,progressFloor} from './progress-scope.mjs';
import {matchPma,pmaWarnings,pmaDifferences} from './pma-model.mjs';
export const installation=['Sin registrar','No iniciado','En proceso','Instalado'];
export const quality=['Sin revisar','Con observaciones','Conforme'];
export const fields={PAV:'Pavimento',CIE:'Cielo',M1:'Muro norte',M2:'Muro oriente',M3:'Muro sur',M4:'Muro poniente'};
// Muros como uno (las cuadrillas avanzan en los cuatro a la vez): la ficha y Control de obra muestran pavimento, cielo y
// muros; los registros se siguen guardando por muro.
export const CAMPOS={PAV:'Pavimento',CIE:'Cielo',M:'Muros'};
export const esMuro=campo=>/^M\d$/.test(campo);
export function combinarMuros(ts){const ins=ts.map(t=>t.installation),cal=ts.map(t=>t.quality);
 const installation=ins.every(x=>x==='Sin registrar')?'Sin registrar':ins.every(x=>x==='Instalado')?'Instalado':ins.every(x=>x==='No iniciado'||x==='Sin registrar')?'No iniciado':'En proceso';
 return {installation,quality:cal.includes('Con observaciones')?'Con observaciones':cal.every(x=>x==='Conforme')?'Conforme':'Sin revisar'};}
// Terminación «Muros» de una fila: los muros que aplican, con sus códigos; estado desde las partidas (derivado) o combinando lo marcado.
export function muroUnico(tasks,derivado=null){const aplican=tasks.filter(t=>esMuro(t.field)&&t.applicable);if(!aplican.length)return null;
 const documented=aplican.every(t=>t.documented),estado=derivado||(documented?combinarMuros(aplican):{installation:'Sin registrar',quality:'Sin revisar'});
 return {field:'M',name:'Muros',code:[...new Set(aplican.map(t=>t.code))].join(' / '),description:[...new Set(aplican.map(t=>t.description))].join(' / '),applicable:true,documented,asepsis:aplican[0].asepsis,
  ...estado,missing:'',notes:'',stale:!derivado&&aplican.some(t=>t.stale),derivada:!!derivado,muros:aplican.map(t=>t.field)};}
// Reporte con los cuatro muros en una sola terminación. derivar(room,'M'): estado desde las partidas de los cuatro muros.
export function agruparMuros(report,derivar=null){
 const rows=report.rows.map(r=>{const m=muroUnico(r.tasks,derivar?.(r.room,'M')||null),tasks=[...r.tasks.filter(t=>!esMuro(t.field)),...(m?[m]:[])];
  return {...r,tasks,complete:tasks.length>0&&tasks.every(t=>t.documented&&t.installation==='Instalado'&&t.quality==='Conforme')};});
 const tasks=rows.flatMap(r=>r.tasks),eligible=tasks.filter(t=>t.documented);
 return {...report,rows,tasks:eligible,unknown:tasks.filter(t=>!t.documented).length,total:eligible.length,installed:eligible.filter(t=>t.installation==='Instalado').length,accepted:eligible.filter(t=>t.installation==='Instalado'&&t.quality==='Conforme').length,observed:eligible.filter(t=>t.quality==='Con observaciones').length,complete:rows.filter(r=>r.complete).length};}
export const keyFor=(code,level='N-1')=>level+'|'+code.trim();
export function tasksFor(model,room,level='N-1'){if(progressFloor(room.level)!==level)return [];const match=matchPma(model,room,level);if(match.state!=='matched')return [];return Object.entries(fields).map(([field,name])=>{const code=String(match.row[field]??'').trim();return {field,name,code,description:model.materials.get(code)||'Descripción pendiente',applicable:!['N/A','-'].includes(code),documented:!!code&&model.materials.has(code),asepsis:match.row.asepsis};});}
export function validateRecord(r){if(!progressFloors[r?.level]||typeof r.code!=='string'||r.key!==keyFor(r.code,r.level)||!Number.isInteger(r.version)||r.version<1||!r.responsible?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||!/^[a-f0-9]{64}$/.test(r.sourceSha)||typeof r.notes!=='string'||r.notes.length>10000||!r.fields||typeof r.at!=='string')throw Error('Registro de avance incompleto.');for(const [f,v] of Object.entries(r.fields)){if(!fields[f]||!installation.includes(v.installation)||!quality.includes(v.quality)||typeof v.code!=='string'||typeof v.missing!=='string'||typeof v.notes!=='string'||v.notes.length>5000||v.missing.length>5000||v.quality==='Conforme'&&v.installation!=='Instalado')throw Error('Revisa estado, condición y observaciones de '+(fields[f]||f));}return r;}
// Estado de ejecución de una partida para el rombo y la tabla de avance: lo observado manda, luego lo conforme.
export const ESTADOS_PARTIDA=['Sin registrar','No iniciado','En proceso','Instalado · por revisar','Con observaciones','Instalado y conforme','No aplica','Sin definición'];
export const COLOR_PARTIDA={'Sin registrar':'#ffffff','No iniciado':'#8c8c8c','En proceso':'#c26a00','Instalado · por revisar':'#0f5499','Con observaciones':'#c21f1f','Instalado y conforme':'#1a7f37','No aplica':'#ffffff','Sin definición':'#ffffff'};
export function estadoPartida(t){if(!t)return 'Sin definición';if(!t.applicable)return 'No aplica';if(!t.documented)return 'Sin definición';if(t.quality==='Con observaciones')return 'Con observaciones';if(t.installation==='Instalado')return t.quality==='Conforme'?'Instalado y conforme':'Instalado · por revisar';return t.installation||'Sin registrar';}
// Registro nuevo del recinto con una sola terminación cambiada desde el rombo (las que no tienen partidas en el avance);
// las demás conservan lo guardado para la fuente vigente. Bajar de «Instalado» quita la conformidad y «Conforme» exige
// instalado. Solo se marcan estados: el detalle de lo observado va en las observaciones con foto.
export function actualizarPartida(model,room,level,current,field,cambio,{responsible,date,sourceReviewed=false,at=new Date().toISOString()}){
 if(!String(responsible||'').trim())throw Error('Indica el responsable del registro.');
 const tasks=tasksFor(model,room,level).filter(t=>t.applicable&&t.documented),task=tasks.find(t=>t.field===field);if(!task)throw Error('La partida no tiene definición documental en el PMA; no se puede registrar.');
 const vigente=t=>{const v=current?.sourceSha===model.source.sha256&&current.fields?.[t.field]?.code===t.code?current.fields[t.field]:null;return {code:t.code,installation:v?.installation||'Sin registrar',quality:v?.quality||'Sin revisar',missing:v?.missing||'',notes:v?.notes||''};};
 const nuevo={...vigente(task),...cambio,code:task.code};
 if(cambio.installation&&cambio.installation!=='Instalado'&&nuevo.quality==='Conforme')nuevo.quality='Sin revisar';
 if(nuevo.quality==='Conforme'&&nuevo.installation!=='Instalado')throw Error('Solo una partida instalada puede quedar conforme.');
 return validateRecord({key:keyFor(room.code,level),code:room.code,level,sourceSha:model.source.sha256,version:(current?.version||0)+1,responsible:String(responsible||'').trim(),date,sourceReviewed,notes:current?.notes||'',fields:Object.fromEntries(tasks.map(t=>[t.field,t.field===field?nuevo:vigente(t)])),at});
}
// derivar(room, campo): estado de la terminación calculado desde sus partidas del avance ({installation, quality}) o null;
// cuando existe, manda sobre lo marcado directamente en el rombo.
export function reportProgress(model,rooms,records,level='N-1',derivar=null){const index=new Map(records.filter(r=>r.level===level&&r.key===keyFor(r.code,level)).map(r=>[r.key,r])),rows=progressRooms(rooms,level).map(room=>{const record=index.get(keyFor(room.code,level)),tasks=tasksFor(model,room,level).filter(t=>t.applicable).map(t=>{const d=t.documented?derivar?.(room,t.field):null;if(d)return {...t,installation:d.installation,quality:d.quality,missing:'',notes:'',stale:false,derivada:true};const saved=record?.fields[t.field],current=record?.sourceSha===model.source.sha256&&saved?.code===t.code;return {...t,installation:current?saved.installation:'Sin registrar',quality:current?saved.quality:'Sin revisar',missing:saved?.missing||'',notes:saved?.notes||'',stale:!!saved&&!current};});const complete=tasks.length>0&&tasks.every(t=>t.documented&&t.installation==='Instalado'&&t.quality==='Conforme');const pma=matchPma(model,room,level);return {room,record,tasks,complete,pmaState:pma.state,warnings:pma.row?[...pmaWarnings(model,pma.row),...(pmaDifferences(room,pma.row).length?['PMA y plano tienen códigos diferentes: cotejar antes de ejecutar.']:[])]:['Sin correspondencia PMA']};});const tasks=rows.flatMap(r=>r.tasks),eligible=tasks.filter(t=>t.documented);return {level,rows,withoutPma:rows.filter(r=>r.pmaState!=='matched').length,tasks:eligible,unknown:tasks.filter(t=>!t.documented).length,total:eligible.length,installed:eligible.filter(t=>t.installation==='Instalado').length,accepted:eligible.filter(t=>t.installation==='Instalado'&&t.quality==='Conforme').length,observed:eligible.filter(t=>t.quality==='Con observaciones').length,complete:rows.filter(r=>r.complete).length};}
