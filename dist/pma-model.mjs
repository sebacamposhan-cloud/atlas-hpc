// PMA is documentary evidence, separate from drawing observations and executed work.
export const pmaFields=['code','roomType','category','unit','name','area','level','change','PAV','CIE','M1','M2','M3','M4','asepsis','wallType','projected','reference','comparison','comments','observation','response'];
export const pmaLevels={'N-1':'A-S01','N01':'A-N01','N02':'A-N02','N03':'A-N03'};
export const pmaNormalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const code=v=>String(v??'').trim();
export function decodePma(bundle){
 if(bundle?.schema!==1||!/^([a-f0-9]{64})$/.test(bundle.source?.sha256)||!Array.isArray(bundle.strings)||bundle.strings.some(s=>typeof s!=='string'))throw Error('Versión PMA no compatible. Actualiza Atlas.');
 const {source,strings}=bundle,datasets={};
 for(const name of [source.mainSheet,source.referenceSheet,source.reviewSheet]){
  const set=bundle.datasets?.[name],expected=name===source.mainSheet?22:name===source.referenceSheet?21:14;
  if(!set||!Array.isArray(set.fields)||set.fields.length!==expected||!Array.isArray(set.rows)||set.count!==set.rows.length||set.headers?.length!==expected||new Set(set.fields).size!==expected)throw Error('Estructura PMA inválida.');
  if(name===source.mainSheet&&JSON.stringify(set.fields)!==JSON.stringify(pmaFields))throw Error('Campos PMA no compatibles.');
  const seen=new Set();
  datasets[name]=set.rows.map(row=>{
   if(!Array.isArray(row)||row.length!==expected+1||!Number.isInteger(row[0])||row[0]<1||seen.has(row[0])||row.slice(1).some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>=strings.length)))throw Error('Registro PMA inválido.');
   seen.add(row[0]);return {id:source.sha256.slice(0,16)+':'+name+':'+row[0],sourceRow:row[0],...Object.fromEntries(set.fields.map((key,i)=>[key,row[i+1]===null?null:strings[row[i+1]]]))};
  });
 }
 const main=datasets[source.mainSheet],byCode=new Map(),reviews=new Map(),references=new Map();
 for(const row of main){const k=code(row.code);if(!k||byCode.has(k))throw Error('Correspondencia PMA ambigua.');byCode.set(k,row);}
 for(const [name,map] of [[source.reviewSheet,reviews],[source.referenceSheet,references]]){
  for(const row of datasets[name]){const k=code(row.A);if(!byCode.has(k)||map.has(k))throw Error('Hojas PMA incompatibles.');map.set(k,row);}
  if(map.size!==main.length)throw Error('Hojas PMA incompletas.');
 }
 for(const row of main)if(references.get(code(row.code)).G!==row.level||reviews.get(code(row.code)).F!==row.level)throw Error('Niveles PMA incompatibles.');
 const materials=new Map((bundle.legends||[]).filter(r=>r.sheet==='CODIGOS TERMINACIONES'&&r.cells?.A&&r.cells?.C&&r.cells.A!=='CODIGO HPC').map(r=>[code(r.cells.A),r.cells.C]));
 return {source,main,byCode,reviews,references,datasets,materials,headers:bundle.datasets,audit:bundle.audit,legends:bundle.legends};
}
export function matchPma(model,room,levelId){
 const row=model.byCode.get(code(room.code)),level=pmaLevels[levelId];
 if(!row)return {state:'missing',row:null};
 if(row.level==='Recintos Eliminados')return {state:'eliminated',row};
 if(!level||row.level!==level)return {state:'level-mismatch',row};
 return {state:'matched',row};
}
export function pmaDifferences(room,row){
 return ['PAV','CIE','M1','M2','M3','M4'].map(field=>({field,plan:room.finishes?.find(f=>f.field===field)?.code??null,pma:row[field]})).filter(v=>code(v.plan)!==code(v.pma));
}
export function pmaReview(model,row,family){return String(model.reviews.get(code(row.code))?.[{PAV:'J',CIE:'K',walls:'L'}[family]]??'').trim()||'Sin revisión documentada';}
export function pmaWarnings(model,row){return ['PAV','CIE','walls'].some(f=>(pmaReview(model,row,f)==='Recinto Eliminado')!==(row.level==='Recintos Eliminados'))?['Las hojas PMA discrepan sobre la eliminación del recinto. Se conservan ambas versiones para revisión.']:[];}
export function selectPma(model,{query='',level='',family='CIE',state='',changes=false,visibility='all',conflicts=false}={}){
 const words=pmaNormalize(query).split(/\s+/).filter(Boolean);
 return model.main.filter(row=>(!level||row.level===level)&&(!state||pmaReview(model,row,family)===state)&&(!changes||row.comparison==='X')&&(!conflicts||pmaWarnings(model,row).length)&&(visibility!=='active'||row.level!=='Recintos Eliminados')&&(visibility!=='eliminated'||row.level==='Recintos Eliminados')&&words.every(word=>pmaNormalize([...Object.values(row),...['PAV','CIE','M1','M2','M3','M4'].map(f=>model.materials.get(code(row[f]))||''),...['PAV','CIE','walls'].map(f=>pmaReview(model,row,f))].join(' ')).includes(word)));
}
