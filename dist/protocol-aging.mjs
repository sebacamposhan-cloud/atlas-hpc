import {matrixDate,normalize} from './protocol-values.mjs';
export const openStates=new Set(['ABIERTO','PENDIENTE']);
export function isoDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:null;}
export function chileToday(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=type=>parts.find(part=>part.type===type).value;return get('year')+'-'+get('month')+'-'+get('day');}
export function anniversary(day,years=1){if(!isoDay(day))return null;const [year,month,date]=day.split('-').map(Number),target=year+years,last=new Date(Date.UTC(target,month,0)).getUTCDate();return String(target).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(date,last)).padStart(2,'0');}
export function criticalAge(record,asOf,date1904=false){
 const state=(record.state||'').trim(),issued=isoDay(matrixDate(record.issued,date1904)),reference=isoDay(asOf),hasClose=!!String(record.closedDate??'').trim(),open=openStates.has(state);
 const unknown=open&&!hasClose&&!issued,critical=!!(open&&!hasClose&&issued&&reference&&reference>anniversary(issued));
 const days=issued&&reference?Math.floor((Date.parse(reference+'T00:00:00Z')-Date.parse(issued+'T00:00:00Z'))/86400000):null;
 const band=!critical?null:reference>anniversary(issued,3)?'over3':reference>anniversary(issued,2)?'2to3':'1to2';
 return {open,issued,critical,unknown,conflict:open&&hasClose,days,band};
}
export const ageBands=[{key:'1to2',name:'Más de 1 y hasta 2 años',color:'#ce983e'},{key:'2to3',name:'Más de 2 y hasta 3 años',color:'#c17540'},{key:'over3',name:'Más de 3 años',color:'#b24d48'}];
export const agingFields=['sourceRow','typeId','code','folio','level','receiver','issued','closedDate','state'];
export function decodeAgingIndex(index,catalog){
 if(index?.schema!==1||index.sourceSha256!==catalog.source.sha256||!Array.isArray(index.fields)||index.fields.length!==agingFields.length||!index.fields.every((field,i)=>field===agingFields[i])||!Array.isArray(index.strings)||!index.strings.every(value=>typeof value==='string')||!Array.isArray(index.rows)||index.rows.length!==catalog.aging?.count)throw Error('El índice de antigüedad no corresponde a la versión de la matriz.');
 const types=new Map(catalog.types.map(type=>[type.id,type])),seen=new Set();return index.rows.map(values=>{if(!Array.isArray(values)||values.length!==agingFields.length||!Number.isInteger(values[0])||values[0]<3||seen.has(values[0]))throw Error('Fila de antigüedad no válida.');seen.add(values[0]);const row={sourceRow:values[0],id:catalog.source.sha256.slice(0,16)+':'+catalog.source.registrySheetId+':'+values[0]};for(let i=1;i<values.length;i++){const value=values[i];if(value!==null&&(!Number.isInteger(value)||value<0||value>=index.strings.length))throw Error('Dato de antigüedad no válido.');row[agingFields[i]]=value===null?null:index.strings[value];}if(!types.has(row.typeId)||types.get(row.typeId).code!==row.code?.trim()||!openStates.has(row.state?.trim()))throw Error('Registro no compatible con el índice de abiertos.');return row;});
}
export function validDateRange(from='',to=''){return (!from||!!isoDay(from))&&(!to||!!isoDay(to))&&(!from||!to||from<=to);}
export function inDateRange(value,from='',to='',date1904=false){if(!from&&!to)return true;const day=isoDay(matrixDate(value,date1904));return !!day&&validDateRange(from,to)&&(!from||day>=from)&&(!to||day<=to);}
export function analyzeCritical(rows,catalog,{asOf=chileToday(),specialty='',level='',receiver='',query='',dateFrom='',dateTo=''}={}){
 const valid=!!isoDay(asOf)&&validDateRange(dateFrom,dateTo),typeMap=new Map(catalog.types.map(type=>[type.id,type])),wanted=value=>value==='~'?'':value,words=normalize(query).split(/\s+/).filter(Boolean);
 const scoped=!valid?[]:rows.filter(row=>{const type=typeMap.get(row.typeId);return type&&(!specialty||type.specialtyIds.includes(specialty))&&(!level||(row.level||'').trim()===wanted(level))&&(!receiver||(row.receiver||'').trim()===wanted(receiver))&&inDateRange(row.issued,dateFrom,dateTo,catalog.source.date1904)&&words.every(word=>normalize(type.code+' '+type.names.join(' ')).includes(word));});
 const evaluated=scoped.map(row=>({...row,age:criticalAge(row,asOf,catalog.source.date1904)})),critical=evaluated.filter(row=>row.age.critical).sort((a,b)=>a.age.issued.localeCompare(b.age.issued)||a.sourceRow-b.sourceRow),counts=new Map();for(const row of critical)counts.set(row.typeId,(counts.get(row.typeId)||0)+1);
 return {valid,open:scoped.length,missing:evaluated.filter(row=>row.age.unknown).length,conflicts:evaluated.filter(row=>row.age.conflict).length,critical,bands:ageBands.map(band=>({...band,n:critical.filter(row=>row.age.band===band.key).length})),types:[...counts].map(([id,n])=>({type:typeMap.get(id),n})).sort((a,b)=>b.n-a.n||a.type.code.localeCompare(b.type.code,'es'))};
}
