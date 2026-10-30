import {abrirLP} from './lastplanner-store.mjs';
import * as C from './lastplanner-cycle-model.mjs';
import {authenticatedActor} from './lastplanner-session.mjs';
import {validarReunion} from './lastplanner-model.mjs';
const request=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
const notify=origen=>window.dispatchEvent(new CustomEvent('atlas-lastplanner-changed',{detail:{origen:origen||'local'}}));
export async function readWorkflow(){
 const db=await abrirLP();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(C.TABLES),result={};for(const table of C.TABLES){const q=tx.objectStore(table).getAll();q.onsuccess=()=>{result[table]=q.result;};}tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
export async function readLPFile(id){const db=await abrirLP();try{return await request(db.transaction('archivos').objectStore('archivos').get(id));}finally{db.close();}}
export async function commitWorkflow(ops,{action,actor,files=[],origen='local',queue=true}={}){
 if(!ops.length)return;
 if(ops.length>500||new TextEncoder().encode(JSON.stringify(ops)).length>10000000||ops.some(o=>new TextEncoder().encode(JSON.stringify(o.data)).length>2000000))throw Error('El alcance supera el tamaño de una operación compartida. Divide la planificación en menos semanas o superficies.');
 if(new Set(ops.map(o=>o.table+':'+o.data.id)).size!==ops.length)throw Error('Registro repetido en la operación.');
 const db=await abrirLP();try{await new Promise((resolve,reject)=>{
  const tx=db.transaction([...new Set([...ops.map(o=>o.table),'archivos','pendientes'])],'readwrite');let reason,pending=ops.length;
  const abort=error=>{reason=error;try{tx.abort();}catch{}};
  const previous=new Map();
  for(const op of ops){const q=tx.objectStore(op.table).get(op.data.id);q.onsuccess=()=>{try{
   const old=q.result;if((old?.version||0)!==op.expected)throw Error('El registro cambió en otra pestaña o equipo. Conserva el formulario y vuelve a abrirlo.');
   if(origen!=='nube')C.validateMutation(op.table,old,op.data,action,actor);previous.set(op.table+':'+op.data.id,old);
   if(--pending)return;
   for(const item of ops)tx.objectStore(item.table).put(item.data);
   for(const file of files)tx.objectStore('archivos').add(file);
   if(queue)tx.objectStore('pendientes').add({id:crypto.randomUUID(),at:new Date().toISOString(),action,actor:actor?.id,ops:structuredClone(ops)});
  }catch(error){abort(error);}};}
  tx.oncomplete=resolve;tx.onabort=()=>reject(reason||tx.error||Error('No se pudo guardar.'));tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}notify(origen);
}
const op=(table,data,expected=data.version-1)=>({table,data,expected});
const find=(data,id)=>{const a=data.actividades.find(a=>a.id===id);if(!a)throw Error('Actividad no disponible.');return a;};
export async function saveDraft(values,{activityId=null,expected=null,allocations=[],restrictions=[]}={}){
 const actor=authenticatedActor('draft'),data=await readWorkflow();let activities;
 if(activityId){const previous=find(data,activityId);if(expected!==null&&previous.version!==expected)throw Error('La actividad cambió. Conserva el borrador y recarga.');activities=[C.editDraft(previous,values,actor)];}
 else activities=C.createSegments(values,allocations,actor);
 const newRestrictions=restrictions.map(value=>({...C.createRestriction(value,activities[0],actor),activityIds:activities.map(a=>a.id)}));
 activities=activities.map(a=>({...a,restrictionIds:[...new Set([...a.restrictionIds,...newRestrictions.map(r=>r.id)])]}));
 await commitWorkflow([...activities.map(a=>op('actividades',a,activityId?expected??a.version-1:0)),...newRestrictions.map(r=>op('restricciones',r,0))],{action:'draft',actor});return activities;
}
export async function redistribute(groupId,quantities){const actor=authenticatedActor('draft'),data=await readWorkflow(),rows=data.actividades.filter(a=>a.grupo?.id===groupId).sort((a,b)=>a.grupo.indice-b.grupo.indice),next=C.redistributeGroup(rows,quantities,actor);await commitWorkflow(next.map(a=>op('actividades',a)),{action:'draft',actor});return next;}
export async function publishPlan(week,level){
 const actor=authenticatedActor('publish'),data=await readWorkflow(),plan=data.semanas.find(s=>s.id===level+'_'+week),next=C.publishWeek(data.actividades,week,level,actor,plan);
 await commitWorkflow([...next.activities.map(a=>op('actividades',a)),op('semanas',next.plan)],{action:'publish',actor});return next;
}
export async function revisePlan(activityId,values,reason,expected){
 const actor=authenticatedActor('revision'),data=await readWorkflow(),a=find(data,activityId);if(a.version!==expected)throw Error('El compromiso cambió; vuelve a cargarlo.');
 const next=C.reviseCommitment(a,values,reason,actor);await commitWorkflow([op('actividades',next)],{action:'revision',actor});return next;
}
export async function start(activityId,date){const actor=authenticatedActor('execution'),data=await readWorkflow(),a=find(data,activityId),next=C.startActivity(a,data.restricciones,actor,{date});await commitWorkflow([op('actividades',next)],{action:'execution',actor});return next;}
export async function addRestriction(activityId,values){
 const actor=authenticatedActor('restriction'),data=await readWorkflow(),a=find(data,activityId);
 const duplicate=data.restricciones.find(r=>r.activityIds.includes(activityId)&&C.pendingRestriction(r)&&r.descripcion.trim().toLocaleLowerCase('es')===values.descripcion.trim().toLocaleLowerCase('es')&&C.canonical(r.scopeIds||[])===C.canonical(values.scopeIds||[]));if(duplicate)throw Error('Esa restricción ya existe. Actualiza su estado en el registro central.');
 const r=C.createRestriction(values,a,actor),next=C.changed(a,{...a,restrictionIds:[...a.restrictionIds,r.id]},actor,'Vincular restricción',{restriccion:r.id});
 await commitWorkflow([op('actividades',next),op('restricciones',r)],{action:'restriction',actor});return r;
}
export async function changeRestriction(id,state,values){const actor=authenticatedActor('restriction'),data=await readWorkflow(),r=data.restricciones.find(r=>r.id===id);if(!r)throw Error('Restricción no disponible.');const next=C.transitionRestriction(r,state,values,actor);await commitWorkflow([op('restricciones',next)],{action:'restriction',actor});return next;}
export async function saveAttendance(values){
 const actor=authenticatedActor('attendance'),data=await readWorkflow(),key=C.attendanceKey(values.personId,values.fecha,values.turno),previous=data.asistencias.find(r=>r.id===key);
 const lockedHours=Object.fromEntries(Object.entries(previous?.asignacionHoras||{}).filter(([id])=>find(data,id).fase==='cerrada'));
 const next=C.attendance({...values,asignacionHoras:{...lockedHours,...values.asignacionHoras}},actor,previous);C.validateAttendanceLinks(next,previous,data.actividades);await commitWorkflow([op('asistencias',next)],{action:'attendance',actor});return next;
}
export async function saveExecution(activityId,values,expected){
 const actor=authenticatedActor('execution'),data=await readWorkflow(),a=find(data,activityId);if(a.version!==expected)throw Error('La actividad cambió. Conserva el registro y recarga antes de guardarlo.');
 const next=C.recordExecution(a,values,data.asistencias,data.restricciones,actor);await commitWorkflow([op('actividades',next)],{action:'execution',actor});return next;
}
export async function verifyExecution(activityId,entryId,values){const actor=authenticatedActor('verify'),data=await readWorkflow(),next=C.validateExecution(find(data,activityId),entryId,values,actor);await commitWorkflow([op('actividades',next)],{action:'verify',actor});return next;}
export async function review(activityId,result,values){const actor=authenticatedActor('verify'),data=await readWorkflow(),next=C.reviewActivity(find(data,activityId),result,values,data,actor);await commitWorkflow([op('actividades',next)],{action:'verify',actor});return next;}
export async function reprogram(activityId,dates){
 const actor=authenticatedActor('draft'),data=await readWorkflow(),a=find(data,activityId),result=C.reprogramBalance(a,dates,actor);
 const restrictions=data.restricciones.filter(r=>a.restrictionIds.includes(r.id)).map(r=>C.changed(r,{...r,activityIds:[...new Set([...r.activityIds,result.next.id])]},actor,'Vincular saldo reprogramado',{origen:a.id,destino:result.next.id}));
 await commitWorkflow([op('actividades',result.previous),op('actividades',result.next,0),...restrictions.map(r=>op('restricciones',r))],{action:'reprogram',actor});return result;
}
export async function close(week,level){const actor=authenticatedActor('close'),data=await readWorkflow(),p=data.semanas.find(p=>p.id===level+'_'+week),next=C.closeWeek(p,data.actividades,actor);await commitWorkflow([...next.activities.map(a=>op('actividades',a)),op('semanas',next.plan)],{action:'close',actor});return next;}
export async function saveEvidence(activityId,file,{roomId=null,scopeId=null,notes=''}={}){
 const actor=authenticatedActor('evidence'),data=await readWorkflow(),a=find(data,activityId);if(a.fase==='cerrada'||a.verificacion.resultado!=='Pendiente de verificación')throw Error('El compromiso está cerrado o revisado.');
 const types=['image/jpeg','image/png','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
 if(!types.includes(file.type)||file.size>15*1024*1024||!file.size)throw Error('Adjunta una fotografía, PDF, DOCX o texto de hasta 15 MB.');
 if(roomId&&!a.recintos.some(r=>r.id===roomId)||scopeId&&!a.alcances.some(s=>s.id===scopeId&&(!roomId||s.roomId===roomId)))throw Error('La evidencia debe corresponder al alcance de la actividad.');
 const bytes=await file.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const evidence=C.changed(null,{id:crypto.randomUUID(),activityId,roomId,scopeId,notas:notes,nombre:file.name,mime:file.type,bytes:file.size,sha256,fecha:C.isoToday()},actor,'Adjuntar evidencia');
 await commitWorkflow([op('evidencias',evidence,0)],{action:'evidence',actor,files:[{id:evidence.id,bytes,mime:file.type,sha256}]});return evidence;
}
export async function exportWorkflow(){
 const data=await readWorkflow(),db=await abrirLP();let files;try{files=await request(db.transaction('archivos').objectStore('archivos').getAll());}finally{db.close();}
 const encode=bytes=>{let text='';for(const n of new Uint8Array(bytes))text+=String.fromCharCode(n);return btoa(text);};
 return {format:'atlas-lastplanner-v1',schema:2,at:new Date().toISOString(),...data,archivos:files.map(f=>({...f,bytes:encode(f.bytes)}))};
}
export async function importWorkflow(value){
 const actor=authenticatedActor('revision');if(value?.format!=='atlas-lastplanner-v1'||value.schema!==2)throw Error('Respaldo del ciclo Last Planner no válido.');
 const current=await readWorkflow(),ops=[];for(const table of C.TABLES){if(!Array.isArray(value[table]))throw Error('Falta la colección '+table);const seen=new Set();for(const record of value[table]){if(seen.has(record.id))throw Error('Identidades repetidas.');seen.add(record.id);const old=current[table].find(r=>r.id===record.id);if(old&&C.canonical(old)!==C.canonical(record))throw Error('Hay una versión distinta en el equipo. Se conserva todo sin sobrescribir.');if(!old){if(table==='actividades')C.validateActivity(record);ops.push(op(table,record,0));}}}
 if(ops.length>500||new TextEncoder().encode(JSON.stringify(ops)).length>10000000||ops.some(o=>new TextEncoder().encode(JSON.stringify(o.data)).length>2000000))throw Error('El respaldo supera el tamaño de un lote compartido. Divídelo por períodos conservando sus relaciones antes de importarlo.');
 const merged=Object.fromEntries(C.TABLES.map(t=>[t,[...current[t],...ops.filter(o=>o.table===t).map(o=>o.data)]]));
 for(const record of merged.reuniones)validarReunion(record);
 for(const a of merged.actividades)if(a.restrictionIds.some(id=>!merged.restricciones.some(r=>r.id===id&&r.activityIds.includes(a.id))))throw Error('El respaldo tiene restricciones sin su registro central.');
 for(const r of merged.restricciones)if(!C.RESTRICTION_STATES.includes(r.estado)||r.activityIds.some(id=>!merged.actividades.some(a=>a.id===id&&a.restrictionIds.includes(r.id))))throw Error('El respaldo tiene restricciones sin actividad.');
 for(const a of merged.asistencias){if(a.id!==C.attendanceKey(a.personId,a.fecha,a.turno)||a.activityIds.some(id=>!merged.actividades.some(t=>t.id===id)))throw Error('Asistencia repetida o sin actividad en el respaldo.');}
 const files=[];const fileIds=new Set();for(const f of value.archivos||[]){
  if(fileIds.has(f.id))throw Error('El respaldo repite archivos de evidencia.');fileIds.add(f.id);
  const bytes=Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)).buffer,sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),evidence=merged.evidencias.find(e=>e.id===f.id);
  if(!evidence||bytes.byteLength!==evidence.bytes||sha256!==evidence.sha256||f.sha256!==sha256)throw Error('Una evidencia del respaldo no coincide con sus bytes originales.');
  const previous=await readLPFile(f.id);if(previous&&previous.sha256!==sha256)throw Error('Existe una evidencia distinta con la misma identidad. Se conserva el archivo local.');
  files.push({...f,bytes});
 }
 for(const e of merged.evidencias){if(!merged.actividades.some(a=>a.id===e.activityId))throw Error('Evidencia sin actividad.');if(!fileIds.has(e.id)&&!await readLPFile(e.id))throw Error('Faltan los archivos de evidencia en el respaldo.');}
 // Imported versions are historical snapshots; preserve their exact versions and original audit trail.
 const db=await abrirLP();try{await new Promise((resolve,reject)=>{const tx=db.transaction([...C.TABLES,'archivos','pendientes'],'readwrite');for(const item of ops)tx.objectStore(item.table).add(item.data);for(const file of files){const q=tx.objectStore('archivos').get(file.id);q.onsuccess=()=>{if(!q.result)tx.objectStore('archivos').add(file);};}if(ops.length)tx.objectStore('pendientes').add({id:crypto.randomUUID(),at:new Date().toISOString(),action:'migration',actor:actor.id,ops});tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}notify();return ops.length;
}
export async function syncState(){const db=await abrirLP();try{return await request(db.transaction('sync').objectStore('sync').get('status'));}finally{db.close();}}
export async function archiveDraft(activityId){const actor=authenticatedActor('draft'),data=await readWorkflow(),a=find(data,activityId);if(a.fase!=='borrador')throw Error('Solo se archivan borradores.');const next=C.changed(a,{...a,archivada:true},actor,'Archivar borrador');await commitWorkflow([op('actividades',next)],{action:'draft',actor});}
