export const documentaryStates = {
  validated: 'Documentado y validado',
  documented_pending: 'Documentado, pendiente de revisión',
  source_unextracted: 'Fuente disponible, dato aún no extraído',
  association_unverified: 'Extraído, pero sin asociación verificada',
  reviewed_not_found: 'No encontrado tras revisar las fuentes correspondientes',
  not_applicable: 'No aplica',
  conflict: 'Conflicto entre documentos o revisiones',
};
// Absence in a JSON payload is never evidence of absence from the document.
export function attributeState({value, validated=false, associationVerified=false, reviewedNotFound=false, notApplicable=false, conflict=false}) {
  if(conflict)return 'conflict';
  if(notApplicable)return 'not_applicable';
  const present=Array.isArray(value)?value.length>0:value!==null&&value!==undefined&&String(value).trim()!=='';
  if(present)return validated?'validated':associationVerified?'documented_pending':'association_unverified';
  return reviewedNotFound?'reviewed_not_found':'source_unextracted';
}
export function deriveAsepsis(finishes=[]) {
  return [...new Set(finishes.filter(f=>/^M[1-4]$/.test(f.field)).map(f=>f.asepsis).filter(Boolean))].sort();
}
export function asepsisEvidence(room,source) {
  const walls=(room.finishes||[]).filter(f=>/^M[1-4]$/.test(f.field)),values=deriveAsepsis(walls);
  let state=room.status==='Validado'&&values.length?'validated':'documented_pending';
  let reason='Las terminaciones de muros están extraídas; su catálogo no asigna una categoría de asepsia. Revisar el alcance de la terminación.';
  if(values.length)reason='Categoría explícita del catálogo para las terminaciones M1–M4; no certifica la condición sanitaria del recinto.';
  else if(walls.length===4&&walls.every(f=>f.code==='N/A')){state='not_applicable';reason='Los cuatro campos de muro indican N/A. Este estado se refiere a sus terminaciones, no a la condición sanitaria.';}
  else if(walls.some(f=>f.code==='15'))reason='El código 15 documenta porcelanato y pintura, pero no especifica el tipo de pintura ni su asepsia.';
  else if(walls.some(f=>f.code==='S/E'))reason='El rombo incluye S/E: terminación sin especificar. Requiere revisión documental.';
  if(walls.length!==4){state='source_unextracted';reason='Faltan campos de muro en la extracción; revisar el rombo original.';}
  return {state,label:documentaryStates[state],values,reason,sourceId:source?.id||room.document_id,revision:source?.revision,page:source?.page||1,sha256:source?.sha256,fields:walls.map(f=>({field:f.field,code:f.code,bbox:f.bbox}))};
}
export function ceilingFieldEvidence(observation,key) {
  if(!observation)return {state:'association_unverified',label:'Observación sin seleccionar · asociación pendiente'};
  const state=attributeState({value:observation[key],validated:!!observation.verification});
  return {state,label:documentaryStates[state]};
}
