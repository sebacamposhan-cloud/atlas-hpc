export const ART_STATES={sin_registro:'Sin verificar',no_instalado:'No instalado',instalado:'Instalado'};
export const ultimoArtefacto=(doc,roomId,code,unit,cut='9999-12-31')=>(doc?.artifactHistory||[]).filter(e=>e.roomId===roomId&&e.artifact===code&&e.unit===unit&&e.date<=cut).sort((a,b)=>a.date.localeCompare(b.date)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id)).at(-1)||null;
export function validarArtefactos(history){
 if(history===undefined)return;
 if(!Array.isArray(history)||history.length>30000)throw Error('Historial de artefactos inválido.');
 const ids=new Set();for(const e of history){if(typeof e.id!=='string'||ids.has(e.id)||typeof e.roomId!=='string'||typeof e.code!=='string'||!ART_STATES[e.state]||!/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date||!Number.isFinite(Date.parse(e.at))||!e.author?.trim()||!Number.isInteger(e.unit)||e.unit<1||!e.artifact||!/^[a-f0-9]{64}$/.test(e.sourceSha256||''))throw Error('Registro de artefacto inválido.');ids.add(e.id);}
}
export function registrarArtefactos(doc,room,items,values,source,{author,date,at=new Date().toISOString(),uid=()=>crypto.randomUUID()}){
 const events=[];
 for(const a of items)for(let unit=1;unit<=a.quantity;unit++){
  const state=values[a.code+':'+unit];if(!ART_STATES[state])throw Error('Estado de instalación inválido.');
  const previous=ultimoArtefacto(doc,room.id,a.code,unit);
  if((previous?.state||'sin_registro')===state)continue;
  events.push({id:uid(),roomId:room.id,code:room.code,artifact:a.code,unit,state,date,at,author,sourceSha256:source.sha256,sourceCell:a.cell});
 }
 if(!events.length)return doc;
 const next={...doc,artifactHistory:[...(doc.artifactHistory||[]),...events],updatedAt:at};validarArtefactos(next.artifactHistory);return next;
}
