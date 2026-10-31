// Production cycle of the existing Last Planner. Pure rules shared by the UI, storage and server.
import {semanaDe,rangoSemana,sumarDias,esFecha,esSemana,CAUSAS,TIPOS_RESTRICCION,DEPARTAMENTOS} from './lastplanner-model.mjs';
import {withinGeometry} from './lastplanner-geometry.mjs';
export {semanaDe,rangoSemana,sumarDias,esFecha,esSemana,CAUSAS,TIPOS_RESTRICCION,DEPARTAMENTOS};
export const PERMISSIONS=['draft','publish','execution','attendance','restriction','evidence','verify','close','revision'];
const PERMISSION_LABELS={draft:'crear o modificar borradores',publish:'publicar la planificación',execution:'registrar ejecución',attendance:'registrar asistencia',restriction:'gestionar restricciones',evidence:'adjuntar evidencia',verify:'verificar el cumplimiento',close:'cerrar la semana',revision:'autorizar revisiones'};
export const RESTRICTION_STATES=['Identificada','En gestión','Bloqueando ejecución','Liberada','Cerrada'];
export const TABLES=['actividades','reuniones','restricciones','asistencias','semanas','evidencias'];
export const ACTION_TABLES={draft:['actividades','restricciones'],publish:['actividades','semanas'],execution:['actividades'],attendance:['asistencias'],restriction:['actividades','restricciones'],evidence:['evidencias'],verify:['actividades'],close:['actividades','semanas'],revision:['actividades'],reprogram:['actividades','restricciones'],meeting:['reuniones'],migration:TABLES};
export const ACTIVITY_CHANGES={draft:['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen','observaciones','notas','rendimientoPlan','dotacion','restrictionIds','legacyIncomplete','archivada'],publish:['fase','compromisoOriginal','publicada'],execution:['estado','inicioReal','finReal','cantidadEjecutada','ejecuciones'],restriction:['restrictionIds'],verify:['ejecuciones','verificacion','estado','causa','causaNota'],close:['fase'],revision:['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen','observaciones','notas','rendimientoPlan','dotacion','revisiones','legacyIncomplete'],reprogram:['saldoReprogramado','reprogramada']};
export const EPS=0.000001;
const copy=v=>structuredClone(v),id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const fail=m=>{throw Error(m);};
const text=(v,max=1000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export const isoToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const canonical=v=>JSON.stringify(v===undefined?null:Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export function allowed(actor,permission){return !!actor?.id&&actor.role==='editor'&&(actor.permissions==null||actor.permissions.includes(permission));}
export function requirePermission(actor,permission){if(!allowed(actor,permission))fail('Tu sesión no tiene permiso para '+(PERMISSION_LABELS[permission]||'realizar esta operación')+'. Entra con una cuenta autorizada en Nube.');}
const audit=(actor,operation,details={},at=now())=>({id:id(),at,autor:actor.email,actor:actor.id,operacion:operation,detalle:operation,...copy(details)});
export function changed(previous,next,actor,operation,details={},at=now()){
 return {...copy(next),version:(previous?.version||0)+1,actualizada:at,autor:previous?.autor||actor.email,creada:previous?.creada||at,historial:[...(previous?.historial||[]),audit(actor,operation,details,at)]};
}
export function weeksForDates(start,end){
 if(!esFecha(start)||!esFecha(end)||end<start)fail('Indica un inicio y un término planificados válidos.');
 if(Date.parse(end)-Date.parse(start)>366*864e5)fail('Distribuye los compromisos en un horizonte de hasta un año.');
 const result=[];let cursor=start;
 while(cursor<=end){const week=semanaDe(cursor),last=rangoSemana(week).hasta,finish=last<end?last:end;result.push({semana:week,inicioPlan:cursor,finPlan:finish});cursor=sumarDias(finish,1);}
 return result;
}
export const weekLabel=week=>{const r=rangoSemana(week);return `Semana ${Number(week.slice(6))} de ${week.slice(0,4)} · ${r.desde} al ${r.hasta}`;};
export const planFields=a=>Object.fromEntries(['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen'].filter(k=>k!=='planificacion'||a[k]!=null).map(k=>[k,copy(a[k]??null)]));
export function validateScope(scope){
 if(!text(scope?.id,200)||!text(scope.roomId,160)||!text(scope.code,160)||!['recinto','muros','cielos','pavimentos'].includes(scope.tipo))fail('Superficie sin recinto o tipo válido.');
 if(scope.geometry){const g=scope.geometry;if(!['polygon','line'].includes(g.type)||!Array.isArray(g.points)||g.points.length<(g.type==='line'?2:3)||g.points.length>3000||g.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))fail('Geometría de intervención no válida.');}
 if(scope.geometry?.holes&&(!Array.isArray(scope.geometry.holes)||scope.geometry.holes.some(r=>!Array.isArray(r)||r.length<3||r.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))))fail('Límites interiores de superficie inválidos.');
 if(scope.measurement&&(!finite(scope.measurement.value)||!text(scope.measurement.source)||!['m²','ml'].includes(scope.measurement.unit)))fail('Medición sin unidad o fuente.');
 return scope;
}
export function validateActivity(a){
 if(a?.schema!==2||!text(a.id,100)||!text(a.actividad,200)||!text(a.responsable,160)||!text(a.level,30)||!Number.isSafeInteger(a.version)||a.version<1)fail('Actividad incompleta.');
 if(!['borrador','publicada','cerrada'].includes(a.fase)||(!a.legacyIncomplete&&(!finite(a.cantidad)||a.cantidad<=0||!text(a.unidad,20))))fail('Indica una cantidad positiva y su unidad.');
 if(!a.legacyIncomplete){const weeks=weeksForDates(a.inicioPlan,a.finPlan);if(weeks.length!==1||a.semana!==weeks[0].semana)fail('La semana se calcula desde las fechas; distribuye los trabajos de varias semanas.');}
 if(!Array.isArray(a.alcances)||a.alcances.length>600||new Set(a.alcances.map(s=>s.id)).size!==a.alcances.length)fail('Superficies repetidas o inválidas.');a.alcances.forEach(validateScope);
 if(!Array.isArray(a.recintos)||new Set(a.recintos.map(r=>r.id)).size!==a.recintos.length||a.alcances.some(s=>!a.recintos.some(r=>r.id===s.roomId)))fail('Cada superficie debe vincularse a un recinto de la actividad.');
 if(!Array.isArray(a.ejecuciones)||!Array.isArray(a.restrictionIds)||new Set(a.restrictionIds).size!==a.restrictionIds.length||!Array.isArray(a.historial))fail('Registros operativos inválidos.');
 if(a.fase!=='borrador'&&!a.compromisoOriginal)fail('Falta la versión publicada del compromiso.');
 if(finite(a.cantidad)&&executed(a)>a.cantidad+EPS)fail('La ejecución supera el compromiso vigente. Registra una revisión autorizada antes de ampliar el alcance.');
 return a;
}
export function migrateActivity(old){
 if(old.schema===2)return copy(old);
 const dates=esFecha(old.inicioPlan)&&esFecha(old.finPlan)&&old.finPlan>=old.inicioPlan;
 const week=dates?semanaDe(old.inicioPlan):old.semana;
 const same=dates&&semanaDe(old.finPlan)===week&&(!old.semana||old.semana===week);
 const alcances=(old.recintos||[]).map(r=>({id:'legacy-'+r.id,roomId:r.id,code:r.code,name:r.name,tipo:'recinto',geometry:null,legacy:true}));
 const fase=old.semana?'publicada':'borrador';
 const a={...copy(old),schema:2,legacyOriginal:copy(old),legacyIncomplete:!same||!(old.cantidad>0)||!old.unidad,semana:old.semana||week||null,fase,
  cantidad:old.cantidad??null,unidad:old.unidad||'',origenCantidad:'manual',especialidad:'Sin especialidad registrada',contratista:old.responsable,
  alcances,ejecucionHistorica:{cantidad:Number(old.cantidadEjecutada)||0,verificada:old.estado==='Cumplida',inicio:old.inicioReal,fin:old.finReal},restrictionIds:(old.restricciones||[]).map(r=>r.id),ejecuciones:[],evidenciaIds:[],revisiones:[],grupo:null,
  verificacion:{resultado:'Pendiente de verificación'},migrada:true};
 // Preserve historical outcomes without inventing daily attendance, scope or evidence.
 if(['Cumplida','No cumplida'].includes(old.estado))a.verificacion={resultado:old.estado==='Cumplida'?'Cumplida':'Incumplida',legacy:true,fecha:old.finReal||old.actualizada?.slice(0,10),autor:old.autor,causa:old.causa,causas:old.causa?[old.causa]:[],nota:old.causaNota||''};
 if(fase==='publicada')a.compromisoOriginal={...planFields(a),semana:old.semana,publicada:old.creada,autor:old.autor,historica:true};
 return a;
}
export function migrateRestrictions(activities){
 const map=new Map();for(const a of activities)for(const r of a.legacyOriginal?.restricciones||a.restricciones||[]){const previous=map.get(r.id),activityIds=[...new Set([...(previous?.activityIds||[]),a.id])];
  if(!previous)map.set(r.id,{...copy(r),id:r.id,version:1,activityIds,scopeIds:[],etapa:'PRE',estado:r.estado==='Liberada'?'Liberada':'Identificada',critica:false,registrada:r.registrada||a.creada.slice(0,10),creada:a.creada,actualizada:a.actualizada,autor:a.autor,historial:[],bloqueos:[],legacy:true});else previous.activityIds=activityIds;}
 return [...map.values()];
}
export function migrateWeeks(activities){
 const groups=new Map();for(const a of activities.filter(a=>a.fase!=='borrador'&&esSemana(a.semana)&&!a.id.startsWith('demo-'))){const key=a.level+'_'+a.semana;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 return [...groups].map(([id,rows])=>({id,semana:rows[0].semana,level:rows[0].level,cerrada:false,historica:true,activityIds:rows.map(a=>a.id),publicaciones:[{id:'legacy-'+id,historica:true,at:rows[0].creada,autor:rows[0].autor,compromisos:rows.map(a=>({id:a.id,version:a.version,plan:copy(a.compromisoOriginal)}))}],version:1,creada:rows[0].creada,actualizada:rows[0].actualizada,autor:rows[0].autor,historial:[]}));
}
export function createDraft(values,actor,{activityId=id(),at=now()}={}){
 requirePermission(actor,'draft');const dates=weeksForDates(values.inicioPlan,values.finPlan);if(dates.length!==1)fail('Distribuye la cantidad entre los tramos semanales.');
 const a={...copy(values),schema:2,id:activityId,semana:dates[0].semana,fase:'borrador',estado:'Planificada',sector:values.sector||null,frente:values.frente||null,especialidad:values.especialidad||'Otra',contratista:values.contratista||values.responsable,
  recintos:values.recintos||[],alcances:values.alcances||[],origenCantidad:values.origenCantidad||'manual',restrictionIds:values.restrictionIds||[],restricciones:[],ejecuciones:[],evidenciaIds:[],revisiones:[],compromisoOriginal:null,verificacion:{resultado:'Pendiente de verificación'},inicioReal:null,finReal:null,cantidadEjecutada:0,causa:null,causaNota:null,origen:values.origen||null,reprogramada:null,grupo:values.grupo||null};
 return validateActivity(changed(null,a,actor,'Crear borrador',{},at));
}
export function createSegments(values,allocations,actor,options={}){
 const weeks=weeksForDates(values.inicioPlan,values.finPlan);
 if(weeks.length===1)return [createDraft(values,actor,options)];
 if(!Array.isArray(allocations)||allocations.length!==weeks.length||allocations.some(n=>!finite(n)||n<=0)||Math.abs(allocations.reduce((s,n)=>s+n,0)-values.cantidad)>EPS)fail('Las cantidades de los tramos deben sumar exactamente el compromiso total.');
 const root=options.activityId||id();return weeks.map((dates,i)=>createDraft({...values,...dates,cantidad:allocations[i],grupo:{id:root,indice:i,total:weeks.length,cantidadTotal:values.cantidad,inicio:values.inicioPlan,fin:values.finPlan}},actor,{...options,activityId:i?id():root}));
}
export function editDraft(a,values,actor,{at=now()}={}){
 requirePermission(actor,'draft');if(a.fase!=='borrador')fail('El compromiso está publicado. Usa una revisión autorizada con motivo.');
 if(a.grupo&&Math.abs((values.cantidad??a.cantidad)-a.cantidad)>EPS)fail('Un tramo conserva la cantidad distribuida de su grupo. Revisa el grupo completo para redistribuirla.');
 const weeks=weeksForDates(values.inicioPlan,values.finPlan);if(weeks.length!==1)fail('Divide la actividad en tramos semanales antes de guardarla.');
 return validateActivity(changed(a,{...a,...copy(values),id:a.id,semana:weeks[0].semana,legacyIncomplete:false},actor,'Modificar borrador',{antes:planFields(a),despues:values},at));
}
export function redistributeGroup(activities,quantities,actor,{at=now()}={}){
 requirePermission(actor,'draft');const group=activities[0]?.grupo;
 if(!group||activities.length!==group.total||activities.some(a=>a.grupo?.id!==group.id||a.fase!=='borrador'||a.archivada))fail('La redistribución requiere todos los tramos como borradores sin publicar.');
 if(quantities.length!==activities.length||quantities.some(v=>!finite(v)||v<=0)||Math.abs(quantities.reduce((n,v)=>n+v,0)-group.cantidadTotal)>EPS)fail('Los tramos deben sumar el total del grupo.');
 return activities.map((a,i)=>validateActivity(changed(a,{...a,cantidad:quantities[i]},actor,'Redistribuir tramos semanales',{grupo:group.id,antes:a.cantidad,despues:quantities[i]},at)));
}
export const pendingRestriction=r=>!['Liberada','Cerrada'].includes(r.estado);
export const blockers=(a,restrictions)=>restrictions.filter(r=>a.restrictionIds.includes(r.id)&&pendingRestriction(r));
export function publishWeek(activities,week,level,actor,previous=null,{at=now()}={}){
 requirePermission(actor,'publish');if(!esSemana(week))fail('Período de publicación no válido.');if(previous?.cerrada)fail('La semana está cerrada.');
 const drafts=activities.filter(a=>!a.archivada&&!a.id.startsWith('demo-')&&a.semana===week&&a.level===level&&a.fase==='borrador');if(!drafts.length)fail('No hay borradores para publicar en ese piso y período.');
 const next=drafts.map(a=>{validateActivity(a);if(a.legacyIncomplete||!a.alcances.length||a.alcances.some(s=>s.locationOnly))fail('Completa fechas y selección espacial antes de publicar.');return validateActivity(changed(a,{...a,fase:'publicada',compromisoOriginal:{...planFields(a),publicada:at,autor:actor.email,actor:actor.id},publicada:at},actor,'Publicar compromiso',{},at));});
 const plan=changed(previous,{...(previous||{}),id:level+'_'+week,semana:week,level,cerrada:false,activityIds:[...new Set([...(previous?.activityIds||[]),...next.map(a=>a.id)])],publicaciones:[...(previous?.publicaciones||[]),{id:id(),at,actor:actor.id,autor:actor.email,compromisos:next.map(a=>({id:a.id,version:a.version,plan:copy(a.compromisoOriginal)}))}]},actor,'Emitir planificación semanal',{},at);
 return {activities:next,plan};
}
export function reviseCommitment(a,values,reason,actor,{at=now()}={}){
 requirePermission(actor,'revision');if(a.fase!=='publicada'||a.verificacion.resultado!=='Pendiente de verificación')fail('Solo se revisan compromisos publicados pendientes de verificación.');if(!text(reason,2000))fail('Indica el motivo de la revisión autorizada.');
 const next={...a,...copy(values),id:a.id,semana:semanaDe(values.inicioPlan||a.inicioPlan),compromisoOriginal:copy(a.compromisoOriginal),revisiones:[...a.revisiones,{id:id(),at,actor:actor.id,autor:actor.email,motivo:reason,antes:planFields(a),despues:planFields({...a,...values})}]};
 if(a.unidad&&next.unidad!==a.unidad)fail('La unidad publicada se conserva para comparar con el compromiso original. Registra otra actividad si cambia la unidad.');
 if(a.ejecuciones.length&&activeExecutions(a).some(e=>e.alcances.some(s=>!next.alcances.some(t=>t.id===s.scopeId))))fail('Conserva las superficies que ya tienen ejecución; corrige las mediciones mediante su historial.');
 if(next.semana!==a.semana)fail('Conserva el período publicado; traslada el saldo mediante reprogramación.');
 return validateActivity(changed(a,next,actor,'Revisión autorizada del compromiso',{motivo:reason,antes:planFields(a),despues:planFields(next)},at));
}
export function createRestriction(values,activity,actor,{restrictionId=id(),at=now()}={}){
 requirePermission(actor,values.etapa==='PRE'&&activity.fase==='borrador'?'draft':'restriction');if(activity.fase==='cerrada')fail('La semana está cerrada.');
 if(!text(values.descripcion,1000)||!text(values.responsable,160)||!text(values.accion,1000)||!esFecha(values.compromiso)||!TIPOS_RESTRICCION.includes(values.tipo))fail('Completa descripción, categoría, responsable, acción y fecha de liberación.');
 if((values.scopeIds||[]).some(s=>!activity.alcances.some(a=>a.id===s)))fail('La restricción debe pertenecer a una superficie de la actividad.');
 const r=changed(null,{...copy(values),id:restrictionId,activityIds:[activity.id],scopeIds:values.scopeIds||[],etapa:values.etapa||'PRE',estado:'Identificada',registrada:at.slice(0,10),critica:!!values.critica,requiereITO:!!values.requiereITO,bloqueos:[],evidenciaIds:[]},actor,'Identificar restricción',{},at);
 return r;
}
export function transitionRestriction(r,state,values,actor,{at=now()}={}){
 requirePermission(actor,'restriction');const transitions={'Identificada':['En gestión','Bloqueando ejecución','Liberada'],'En gestión':['Bloqueando ejecución','Liberada'],'Bloqueando ejecución':['En gestión','Liberada'],'Liberada':['Cerrada','En gestión'],'Cerrada':['En gestión']};
 if(!transitions[r.estado]?.includes(state))fail('Transición de restricción no permitida.');if(!text(values?.nota,2000))fail('Registra la acción o evidencia que justifica el cambio de estado.');
 const bloqueos=copy(r.bloqueos||[]),open=bloqueos.find(b=>!b.hasta);if(state==='Bloqueando ejecución'&&!open)bloqueos.push({desde:at,hasta:null});if(state!=='Bloqueando ejecución'&&open)open.hasta=at;
 return changed(r,{...r,estado:state,bloqueos,liberada:['Liberada','Cerrada'].includes(state)?at.slice(0,10):null,evidenciaIds:[...new Set([...(r.evidenciaIds||[]),...(values.evidenciaIds||[])])]},actor,'Restricción: '+r.estado+' → '+state,{comentario:values.nota},at);
}
export function startActivity(a,restrictions,actor,{date=isoToday(),at=now()}={}){
 requirePermission(actor,'execution');if(a.fase!=='publicada'||a.verificacion.resultado!=='Pendiente de verificación')fail('Publica la actividad antes de iniciarla.');if(blockers(a,restrictions).some(r=>r.critica))fail('La actividad tiene restricciones críticas pendientes; requiere su liberación antes de iniciar.');
 if(!esFecha(date)||date>isoToday())fail('Inicio real no válido.');return changed(a,{...a,estado:'En ejecución',inicioReal:a.inicioReal||date},actor,'Iniciar ejecución',{},at);
}
export const personKey=person=>{const normalized=person.trim().normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g,' '),rut=normalized.replace(/[.\s-]/g,'');return /^\d{7,8}[\dk]$/.test(rut)?rut:normalized;};
export const attendanceKey=(person,date,shift)=>date+'_'+encodeURIComponent(shift.trim().toLocaleLowerCase('es'))+'_'+encodeURIComponent(personKey(person));
export function attendance(values,actor,previous=null,{at=now()}={}){
 requirePermission(actor,'attendance');if(!text(values.personId,100)||!text(values.nombre,160)||!esFecha(values.fecha)||!text(values.turno,40)||!text(values.cuadrilla,160)||!text(values.contratista,160)||!['Presente','Ausente'].includes(values.estado))fail('Completa persona, fecha, turno, cuadrilla, contratista y asistencia.');
 if(values.fecha>isoToday()||!finite(values.horas)||values.horas>24||values.estado==='Ausente'&&values.horas!==0)fail('Las horas y fecha de asistencia no son válidas.');
 if(Object.values(values.asignacionHoras||{}).some(h=>!finite(h))||Object.values(values.asignacionHoras||{}).reduce((n,h)=>n+h,0)>values.horas+EPS)fail('Las horas asignadas superan la jornada.');
 const key=attendanceKey(values.personId,values.fecha,values.turno);if(previous&&previous.id!==key)fail('La identidad de una asistencia no se puede cambiar.');
 return changed(previous,{...copy(values),personId:previous?.personId||values.personId,id:key,activityIds:[...new Set([...(previous?.activityIds||[]),...(values.activityIds||[])])]},actor,previous?'Actualizar asistencia y asignaciones':'Registrar asistencia diaria',{},at);
}
export function validateAttendanceLinks(next,previous,activities){
 if(!Array.isArray(next.activityIds)||new Set(next.activityIds).size!==next.activityIds.length||next.activityIds.some(id=>!activities.some(a=>a.id===id&&(a.fase==='publicada'||a.fase==='cerrada'&&previous?.activityIds.includes(id)))))fail('La asistencia se asigna a compromisos publicados; no se agregan asignaciones a semanas cerradas.');
 const closed=(previous?.activityIds||[]).filter(id=>activities.some(a=>a.id===id&&a.fase==='cerrada'));
 if(closed.length){const stable=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['activityIds','asignacionHoras','version','actualizada','historial'].includes(key)));if(canonical(stable(next))!==canonical(stable(previous))||closed.some(id=>next.asignacionHoras?.[id]!==previous.asignacionHoras?.[id]))fail('La asistencia de una semana cerrada se conserva; solo se pueden agregar asignaciones abiertas sin alterar la jornada original.');}
}
export function activeExecutions(a){const replaced=new Set(a.ejecuciones.map(e=>e.sustituye).filter(Boolean));return a.ejecuciones.filter(e=>!replaced.has(e.id));}
export function executed(a,{verified=false,asOf=null}={}){
 if(a.schema!==2)return Number(a.cantidadEjecutada)||0;
 const historical=a.ejecucionHistorica;const base=historical&&(!verified||historical.verificada)&&(!asOf||historical.fin&&historical.fin<=asOf)?historical.cantidad:0;
 return base+activeExecutions(a).filter(e=>(!verified||e.validacion?.estado==='Validada')&&(!asOf||e.finReal<=asOf)).reduce((n,e)=>n+e.cantidad,0);
}
export function recordExecution(a,values,allAttendance,restrictions,actor,{at=now()}={}){
 requirePermission(actor,'execution');if(a.fase!=='publicada'||a.verificacion.resultado!=='Pendiente de verificación')fail('La actividad no admite registros: publica el compromiso o revisa su cierre.');
 if(blockers(a,restrictions).some(r=>r.critica))fail('Resuelve las restricciones críticas antes de informar ejecución.');
 if(!esFecha(values.inicioReal)||!esFecha(values.finReal)||values.finReal<values.inicioReal||values.finReal>isoToday()||!finite(values.cantidad)||values.unidad!==a.unidad)fail('Revisa fechas reales, cantidad y unidad de ejecución.');
 if(!Array.isArray(values.alcances)||values.alcances.some(s=>!a.alcances.some(t=>t.id===s.scopeId)||!finite(s.cantidad)||!finite(s.avance)||s.avance>1)||new Set(values.alcances.map(s=>s.scopeId)).size!==values.alcances.length)fail('Selecciona superficies del compromiso y su avance entre 0 y 100 %.');
 for(const scope of values.alcances){const planned=a.alcances.find(s=>s.id===scope.scopeId);if((scope.geometry||[]).some(g=>!withinGeometry(planned.geometry,g)))fail('La intervención real debe quedar dentro de la superficie planificada.');}
 if(Math.abs(values.alcances.reduce((n,s)=>n+s.cantidad,0)-values.cantidad)>EPS)fail('Las cantidades por superficie deben sumar la cantidad ejecutada del registro.');
 const selected=allAttendance.filter(r=>(values.asistenciaIds||[]).includes(r.id));
 if(values.cantidad>0&&(!selected.length||selected.length!==(values.asistenciaIds||[]).length||selected.some(r=>r.estado!=='Presente'||r.fecha<values.inicioReal||r.fecha>values.finReal||!r.activityIds.includes(a.id))))fail('Vincula asistencia presente, de las fechas ejecutadas y asignada a esta actividad.');
 if(values.sustituye&&!activeExecutions(a).some(e=>e.id===values.sustituye))fail('El registro a corregir ya cambió.');if(values.sustituye&&!text(values.motivo,2000))fail('Una corrección de medición requiere motivo.');
 const e={...copy(values),id:values.id||id(),autor:actor.email,actor:actor.id,at,validacion:{estado:'Pendiente'}};
 if(a.ejecuciones.some(v=>v.id===e.id))fail('Ese registro de ejecución ya fue guardado.');
 const next={...a,estado:'En ejecución',ejecuciones:[...a.ejecuciones,e],inicioReal:a.inicioReal||values.inicioReal};next.cantidadEjecutada=executed(next);next.finReal=activeExecutions(next).map(e=>e.finReal).sort().at(-1)||null;
 return validateActivity(changed(a,next,actor,'Registrar avance físico',{registro:e.id,sustituye:e.sustituye||null,motivo:e.motivo||null},at));
}
export function validateExecution(a,entryId,values,actor,{at=now()}={}){
 requirePermission(actor,'verify');if(a.fase!=='publicada'||a.verificacion.resultado!=='Pendiente de verificación')fail('La actividad ya fue revisada o cerrada.');
 const e=activeExecutions(a).find(e=>e.id===entryId);if(!e)fail('Registro de ejecución no vigente.');
 if(!values.ubicacion||!values.cantidad||!values.restricciones||!text(values.nota,2000))fail('Comprueba ubicación, cantidad y restricciones e indica la verificación realizada.');
 const entries=a.ejecuciones.map(e=>e.id===entryId?{...e,validacion:{estado:'Validada',at,actor:actor.id,autor:actor.email,nota:values.nota,ubicacion:true,cantidad:true,restricciones:true}}:e);
 return changed(a,{...a,ejecuciones:entries},actor,'Verificar medición y superficies',{registro:entryId,nota:values.nota},at);
}
export function scopeProgress(a,scopeId,{verified=false}={}){
 const scopes=activeExecutions(a).filter(e=>!verified||e.validacion?.estado==='Validada').flatMap(e=>e.alcances.filter(s=>s.scopeId===scopeId));
 return {cantidad:scopes.reduce((n,s)=>n+s.cantidad,0),avance:scopes.length?Math.max(...scopes.map(s=>s.avance)):0};
}
export function checklist(a,data){
 const entries=activeExecutions(a),att=new Set(data.asistencias.filter(r=>r.activityIds.includes(a.id)).map(r=>r.id)),evidence=data.evidencias.filter(e=>e.activityId===a.id);
 return [{id:'attendance',label:'Asistencia registrada',state:att.size?'Registrada':'Pendiente',count:att.size},{id:'execution',label:'Avance físico informado',state:entries.length?'Registrado':'Pendiente',count:entries.length},
 {id:'verification',label:'Recintos y superficies verificados',state:entries.length&&entries.every(e=>e.validacion?.estado==='Validada')?'Validada':'Pendiente',count:entries.filter(e=>e.validacion?.estado==='Validada').length},
 {id:'restrictions',label:'Restricciones y bloqueos revisados',state:blockers(a,data.restricciones).length?'Con pendientes':entries.some(e=>e.validacion?.restricciones)?'Revisadas':'Pendiente de revisión',count:data.restricciones.filter(r=>a.restrictionIds.includes(r.id)).length},
 {id:'evidence',label:'Evidencia adjuntada',state:evidence.length?'Registrada':'Pendiente',count:evidence.length},
 {id:'verification',label:'Cantidad ejecutada comprobada',state:entries.length&&entries.every(e=>e.validacion?.estado==='Validada')?'Validada':'Pendiente',count:entries.filter(e=>e.validacion?.estado==='Validada').length},
 {id:'review',label:'Cumplimiento del compromiso validado',state:a.verificacion.resultado,count:a.verificacion.resultado==='Pendiente de verificación'?0:1}];
}
export function reviewActivity(a,result,values,data,actor,{at=now(),today=isoToday()}={}){
 requirePermission(actor,'verify');if(a.fase!=='publicada'||a.verificacion.resultado!=='Pendiente de verificación')fail('La actividad ya tiene una revisión final.');
 if(!['Cumplida','Incumplida'].includes(result))fail('Resultado de revisión no válido.');
 const original=a.compromisoOriginal,quantity=executed(a,{verified:true,asOf:original.finPlan}),entries=activeExecutions(a);
 if(result==='Incumplida'&&today<=original.finPlan)fail('El plazo original sigue vigente. Mantén el avance parcial y revisa el incumplimiento después de su término.');
 if(result==='Cumplida'){
  if(!original.inicioPlan||!original.finPlan||quantity+EPS<original.cantidad||entries.some(e=>e.validacion?.estado!=='Validada'||e.inicioReal<original.inicioPlan||e.finReal>original.finPlan))fail('El compromiso no está ejecutado y verificado al 100 % dentro de su plazo original.');
  if(original.alcances.some(s=>scopeProgress(a,s.id,{verified:true}).avance<1-EPS)||blockers(a,data.restricciones).some(r=>r.critica))fail('Quedan superficies o restricciones críticas sin verificar.');
  if(!data.evidencias.some(e=>e.activityId===a.id))fail('Adjunta evidencia real antes de validar el cumplimiento.');
 }
 if(result==='Incumplida'&&(!CAUSAS.includes(values.causa)||!text(values.nota,2000)))fail('Indica una causa principal y su explicación.');
 const verification={resultado:result,at,autor:actor.email,actor:actor.id,causa:result==='Incumplida'?values.causa:null,causas:result==='Incumplida'?[...new Set([values.causa,...(values.causas||[])])]:[],nota:values.nota||'',cantidadValidada:quantity,corte:original.finPlan};
 return changed(a,{...a,verificacion:verification,estado:result==='Cumplida'?'Cumplida':'No cumplida',causa:verification.causa,causaNota:verification.nota},actor,'Revisar compromiso: '+result,{resultado:verification},at);
}
export function reprogramBalance(a,dates,actor,{newId=id(),at=now()}={}){
 requirePermission(actor,'draft');if(a.verificacion.resultado!=='Incumplida')fail('Revisa el incumplimiento antes de reprogramar el saldo.');if(a.saldoReprogramado||a.reprogramada)fail('El saldo ya fue reprogramado. Consulta el registro histórico antes de trasladarlo nuevamente.');
 const balance=Math.max(0,a.cantidad-executed(a));if(balance<=EPS)fail('No queda cantidad pendiente para reprogramar.');const weeks=weeksForDates(dates.inicioPlan,dates.finPlan);if(weeks.length!==1||weeks[0].semana<=a.semana)fail('El saldo debe programarse en una semana posterior.');
 const pending=a.alcances.filter(s=>scopeProgress(a,s.id,{verified:true}).avance<1-EPS).map(s=>({...copy(s),origenScopeId:s.id,fraccionOriginalDesde:scopeProgress(a,s.id,{verified:true}).avance}));
 const next=createDraft({...planFields(a),...dates,cantidad:balance,alcances:pending.length?pending:copy(a.alcances),grupo:null,origen:a.id,restrictionIds:copy(a.restrictionIds)},actor,{activityId:newId,at});
 const previous=changed(a,{...a,saldoReprogramado:next.id,reprogramada:next.semana},actor,'Reprogramar saldo',{actividadDestino:next.id,cantidad:balance},at);
 return {previous,next};
}
export function closeWeek(plan,activities,actor,{at=now(),today=isoToday()}={}){
 requirePermission(actor,'close');if(!plan||plan.cerrada)fail('La semana no está publicada o ya está cerrada.');if(today<=rangoSemana(plan.semana).hasta)fail('El cierre semanal se realiza después del domingo del período.');
 const selected=activities.filter(a=>plan.activityIds.includes(a.id));if(selected.length!==plan.activityIds.length||selected.some(a=>a.verificacion.resultado==='Pendiente de verificación'))fail('Verifica todos los compromisos antes de cerrar la semana.');
 return {plan:changed(plan,{...plan,cerrada:true,cierre:{at,actor:actor.id,autor:actor.email,resultados:selected.map(a=>({id:a.id,resultado:copy(a.verificacion),original:copy(a.compromisoOriginal)}))}},actor,'Cerrar semana',{},at),activities:selected.map(a=>changed(a,{...a,fase:'cerrada'},actor,'Cerrar semana',{},at))};
}
export function executive(data,filters={}){
 const activities=data.actividades.filter(a=>!a.archivada&&!String(a.id).startsWith('demo-')&&(!filters.level||a.level===filters.level)&&(!filters.semana||a.semana===filters.semana)&&(!filters.responsable||a.responsable===filters.responsable)&&(!filters.especialidad||a.especialidad===filters.especialidad)&&(!filters.contratista||a.contratista===filters.contratista)),committed=activities.filter(a=>a.fase!=='borrador'),fulfilled=committed.filter(a=>a.verificacion.resultado==='Cumplida'),failed=committed.filter(a=>a.verificacion.resultado==='Incumplida');
 const activityIds=new Set(activities.map(a=>a.id)),attendanceActivityIds=new Set(data.actividades.filter(a=>!a.archivada&&!a.id.startsWith('demo-')&&(!filters.level||a.level===filters.level)&&(!filters.responsable||a.responsable===filters.responsable)&&(!filters.especialidad||a.especialidad===filters.especialidad)&&(!filters.contratista||a.contratista===filters.contratista)).map(a=>a.id)),attendanceRows=data.asistencias.filter(r=>(!filters.semana||semanaDe(r.fecha)===filters.semana)&&r.activityIds.some(a=>attendanceActivityIds.has(a))&&(!filters.especialidad||r.especialidad===filters.especialidad)&&(!filters.contratista||r.contratista===filters.contratista)),unique=new Map(attendanceRows.map(r=>[r.id,r]));
 const restrictions=data.restricciones.filter(r=>r.activityIds.some(a=>activityIds.has(a))),byUnit=new Map();for(const a of committed){if(!finite(a.compromisoOriginal?.cantidad??a.cantidad)||!a.unidad)continue;const row=byUnit.get(a.unidad)||{unit:a.unidad,planned:0,executed:0,verified:0};row.planned+=a.compromisoOriginal?.cantidad||a.cantidad;row.executed+=executed(a);row.verified+=executed(a,{verified:true});byUnit.set(a.unidad,row);}
 const group=(rows,key)=>[...new Map(rows.map(r=>[key(r),0])).keys()].map(label=>({label,n:rows.filter(r=>key(r)===label).length}));
 const daily=group([...unique.values()],r=>r.fecha).map(row=>({...row,present:[...unique.values()].filter(r=>r.fecha===row.label&&r.estado==='Presente').length,absent:[...unique.values()].filter(r=>r.fecha===row.label&&r.estado==='Ausente').length}));
 return {activities,committed:committed.length,fulfilled:fulfilled.length,failed:failed.length,pending:committed.length-fulfilled.length-failed.length,ppc:committed.length?100*fulfilled.length/committed.length:null,physical:[...byUnit.values()],attendance:[...unique.values()],present:[...unique.values()].filter(r=>r.estado==='Presente').length,daily,
  restrictions,openRestrictions:restrictions.filter(pendingRestriction).length,released:restrictions.filter(r=>!pendingRestriction(r)).length,activeBlocks:restrictions.filter(r=>r.estado==='Bloqueando ejecución').length,resolvedBlocks:restrictions.filter(r=>(r.bloqueos||[]).some(b=>b.hasta)).length,
  causes:group(failed,a=>a.verificacion.causa||'Sin causa histórica'),specialties:group([...unique.values()].filter(r=>r.estado==='Presente'),r=>r.especialidad||'Sin especialidad'),responsibles:group(committed,a=>a.responsable).map(r=>({...r,fulfilled:fulfilled.filter(a=>a.responsable===r.label).length})),reprogrammed:activities.filter(a=>a.origen).length};
}

export function validateMutation(table,previous,next,action,actor){
 const permission={reprogram:'draft',migration:'revision',meeting:'attendance'}[action]||action;requirePermission(actor,permission);
 if(!ACTION_TABLES[action]?.includes(table))fail('Esta operación no permite modificar esa colección.');
 if(!TABLES.includes(table)||!next?.id||!Number.isSafeInteger(next.version)||next.version<1)fail('Registro inválido.');
 if(previous){
  if(next.id!==previous.id||next.version!==previous.version+1)fail('La versión del registro cambió. Vuelve a abrirlo conservando tu borrador.');
  if(canonical((next.historial||[]).slice(0,previous.historial?.length||0))!==canonical(previous.historial||[]))fail('El historial es inalterable.');
  if(next.creada!==previous.creada||next.autor!==previous.autor)fail('La autoría original es inalterable.');
 }
 if(action!=='migration'){
  const entry=next.historial?.at(-1);if(next.historial?.length!==(previous?.historial?.length||0)+1||entry?.actor!==actor.id||entry?.autor!==actor.email||!entry.at||next.actualizada!==entry.at)fail('La operación debe conservar su usuario y fecha de auditoría.');
 }
 if(table==='actividades'){
  validateActivity(next);
  if(previous){
   const allowedKeys=new Set([...(ACTIVITY_CHANGES[action]||[]),'version','actualizada','historial']);
   const unchanged=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!allowedKeys.has(key)));
   if(canonical(unchanged(previous))!==canonical(unchanged(next)))fail('La operación intenta modificar información ajena a su permiso.');
   if(previous.fase!=='borrador'){
    if(canonical(previous.compromisoOriginal)!==canonical(next.compromisoOriginal))fail('El compromiso original es inalterable.');
    if(canonical(planFields(previous))!==canonical(planFields(next))&&action!=='revision')fail('Modificar un compromiso publicado requiere revisión autorizada.');
    if(previous.fase==='cerrada'&&action!=='reprogram')fail('Una semana cerrada no se puede modificar.');
    if(previous.verificacion.resultado!=='Pendiente de verificación'&&action!=='reprogram'&&action!=='close')fail('La revisión final no se modifica retroactivamente.');
   }
   if(previous.fase==='borrador'&&next.fase!=='borrador'&&action!=='publish')fail('Publicar exige el permiso correspondiente.');
   if(canonical(previous.verificacion)!==canonical(next.verificacion)&&action!=='verify')fail('Verificar cumplimiento requiere permiso de revisión.');
   if(canonical(previous.ejecuciones)!==canonical(next.ejecuciones)&&!['execution','verify'].includes(action))fail('Operación de ejecución no autorizada.');
   if(next.fase==='cerrada'&&previous.fase!=='cerrada'&&action!=='close')fail('El cierre requiere su permiso.');
  }else if(action!=='migration'&&(next.fase!=='borrador'||next.ejecuciones.length||next.verificacion.resultado!=='Pendiente de verificación'||next.ejecucionHistorica||next.legacyOriginal||next.legacyIncomplete||next.revisiones?.length||next.saldoReprogramado))fail('Primero crea el borrador y publica la planificación, sin ejecución ni resultados previos.');
 }
 if(table==='asistencias'&&next.id!==attendanceKey(next.personId,next.fecha,next.turno))fail('Identidad de asistencia inválida.');
 if(table==='evidencias'&&(previous||!next.activityId||!text(next.sha256,64)||!finite(next.bytes)||!text(next.nombre,240)))fail('La evidencia es inalterable y debe contener sus bytes originales.');
 if(table==='semanas'&&previous){
  if(next.semana!==previous.semana||next.level!==previous.level)fail('El período y piso de una emisión son inalterables.');
  if(previous.cerrada)fail('El cierre semanal es inalterable.');
  if(canonical((next.publicaciones||[]).slice(0,previous.publicaciones?.length||0))!==canonical(previous.publicaciones||[]))fail('Las versiones publicadas son inalterables.');
  if(previous.activityIds.some(id=>!next.activityIds.includes(id)))fail('No se pueden excluir compromisos de la base semanal del PPC.');
  if(action==='close'&&(canonical(next.activityIds)!==canonical(previous.activityIds)||canonical(next.publicaciones)!==canonical(previous.publicaciones)))fail('El cierre conserva todos los compromisos y emisiones originales.');
 }
 return next;
}
