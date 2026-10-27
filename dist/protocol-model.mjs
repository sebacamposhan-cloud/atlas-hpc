export const matrixFields=['sourceRow','item','specialty','process','code','folio','element','level','axes','rooms','issued','selfCheck','closed','closedDate','month','receiver','state'];
export const matrixStates=['ABIERTO','CERRADO','CERRADO POR AUTOCONTROL','NULO'];
export const stateLabels={ABIERTO:'Abierto',CERRADO:'Cerrado','CERRADO POR AUTOCONTROL':'Cerrado por autocontrol',NULO:'Nulo'};
export const stateColors={ABIERTO:'#c18b3f',CERRADO:'#4c806c','CERRADO POR AUTOCONTROL':'#557f9d',NULO:'#8a929b'};
export const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g,' ').trim();
const matches=(text,query)=>normalize(query).split(/\s+/).filter(Boolean).every(word=>normalize(text).includes(word));
export function selectTypes(catalog,{specialty='',query=''}={}){return catalog.types.filter(type=>(!specialty||type.specialtyIds.includes(specialty))&&matches([type.code,...type.names].join(' '),query));}
export function decodeMatrixRows(chunk,catalog,type){
 if(chunk?.schema!==1||chunk.sourceSha256!==catalog.source.sha256||chunk.typeId!==type.id||chunk.rows?.length!==type.count||chunk.fields?.length!==17||!chunk.fields.every((key,i)=>key===matrixFields[i])||!Array.isArray(chunk.strings)||!chunk.strings.every(value=>typeof value==='string'))throw Error('El detalle no corresponde a esta versión de la matriz. Actualiza la copia y reintenta.');
 const seen=new Set();return chunk.rows.map(row=>{
  if(!Array.isArray(row)||row.length!==17||!Number.isInteger(row[0])||row[0]<3||seen.has(row[0]))throw Error('Fila de matriz no válida.');seen.add(row[0]);
  const record={sourceRow:row[0],id:catalog.source.sha256.slice(0,16)+':'+catalog.source.registrySheetId+':'+row[0]};
  for(let i=1;i<row.length;i++){const key=chunk.fields[i],index=row[i];if(index!==null&&(!Number.isInteger(index)||index<0||index>=chunk.strings.length))throw Error('Valor de matriz no válido.');record[key]=index===null?null:chunk.strings[index];}
  if(record.code?.trim()!==type.code)throw Error('Código de protocolo no compatible con su detalle.');return record;
 });
}
export function selectMatrixRows(rows,{state='',level='',receiver='',query=''}={}){
 const wanted=value=>value==='~'?'':value;
 return rows.filter(row=>(!state||(row.state||'').trim()===state)&&(!level||(row.level||'').trim()===wanted(level))&&(!receiver||(row.receiver||'').trim()===wanted(receiver))&&matches([row.code,row.folio,row.element,row.level,row.axes,row.rooms,row.receiver,row.state].join(' '),query));
}
export function matrixDate(value,date1904=false){
 if(value===null||value===undefined||value==='')return null;
 if(!/^\d+(\.\d+)?$/.test(String(value)))return String(value);
 const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Number(value)*86400000);
 return Number.isNaN(date.getTime())?String(value):date.toISOString().slice(0,10);
}
export function matrixFacets(rows,field){const counts=new Map();for(const row of rows){const key=(row[field]||'').trim();counts.set(key,(counts.get(key)||0)+1);}return [...counts].sort(([a],[b])=>a.localeCompare(b,'es',{numeric:true}));}
export function matrixPage(rows,page=0,size=25){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));return {page:current,pages,rows:rows.slice(current*size,(current+1)*size)};}
