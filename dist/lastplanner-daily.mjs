import {semanaDe,rangoSemana,sumarDias,esFecha} from './lastplanner-model.mjs';
export const teamKey=(contractor,name)=>[contractor,name].map(s=>String(s).trim().toLocaleLowerCase('es')).join('|');
export function weekDays(date){const start=rangoSemana(semanaDe(date)).desde;return Array.from({length:7},(_,i)=>sumarDias(start,i));}
const positive=n=>Number.isFinite(n)&&n>0;
export function putAssignment(rows,row){
 if(typeof row.teamName!=='string'||!row.teamName.trim()||typeof row.contractor!=='string'||!row.contractor.trim()||!Number.isSafeInteger(row.people)||row.people<1||!positive(row.fraction)||row.fraction>1||!esFecha(row.date))throw Error('Completa empresa, equipo, personas y jornada.');
 if(row.hours!=null&&(!positive(row.hours)||row.hours>24||!positive(row.referenceHours)||row.referenceHours>24))throw Error('Indica horas válidas y la duración de referencia.');
 if(row.crews!=null&&(!Number.isSafeInteger(row.crews)||row.crews<1))throw Error('Indica un número entero positivo de cuadrillas.');
 if(row.productivity&&(!positive(row.productivity.rate)||!row.productivity.unit))throw Error('Rendimiento específico inválido.');
 const teamId=teamKey(row.contractor,row.teamName),id=row.date+'|'+teamId;
 return [...rows.filter(r=>r.id!==id),{...row,teamName:row.teamName.trim(),contractor:row.contractor.trim(),teamId,id}];
}
export function validateSchedule(rows,start,end){
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Programación diaria inválida.');
 const keys=new Set();for(const row of rows){const normalized=putAssignment([],row)[0];if(row.id!==normalized.id||row.teamId!==normalized.teamId||keys.has(normalized.id))throw Error('Equipo repetido o identificador de asignación inválido.');if(row.date<start||row.date>end)throw Error('Hay personal programado fuera del período de la actividad. Ajusta las fechas o elimina esas asignaciones.');keys.add(normalized.id);}
 return rows;
}
export function scheduleCapacity(rows,reference,unit){
 let personDays=0,personHours=0,crewDays=0,crewHours=0,production=0,unknown=0;const daily={};
 for(const r of rows){
  const ref=r.productivity||reference,factor=r.hours!=null?(positive(r.referenceHours)?r.hours/r.referenceHours:null):r.fraction;
  personDays+=factor==null?0:r.people*factor;personHours+=positive(r.hours)?r.people*r.hours:0;let q=null;
  if(ref?.unit===unit&&positive(ref.rate)){
   if(ref.basis==='persona-dia'&&factor!=null)q=r.people*factor*ref.rate;
   if(ref.basis==='persona-hora'&&positive(r.hours))q=r.people*r.hours*ref.rate;
   const crewSize=ref.crew?.length&&ref.crew.every(m=>m.role&&Number.isSafeInteger(m.count)&&m.count>0)?ref.crew.reduce((n,m)=>n+m.count,0):null;
   // Headcount alone cannot prove technical crew composition: require explicit confirmation.
   if(crewSize&&r.crewConfirmed&&Number.isSafeInteger(r.crews)&&r.crews>0&&r.people>=r.crews*crewSize){
    crewDays+=factor==null?0:r.crews*factor;crewHours+=positive(r.hours)?r.crews*r.hours:0;
    if(ref.basis==='cuadrilla-dia'&&factor!=null)q=r.crews*factor*ref.rate;
    if(ref.basis==='cuadrilla-hora'&&positive(r.hours))q=r.crews*r.hours*ref.rate;
   }
  }
  if(q==null||!Number.isFinite(q))unknown++;else{production+=q;daily[r.date]=(daily[r.date]||0)+q;}
 }
 return {personDays,personHours,crewDays,crewHours,production,unknown,calculated:rows.length-unknown,daily};
}
// Observations are derived from closed, verified execution and actual allocated labor hours.
export function observedYield(activity,attendance){
 if(activity.fase!=='cerrada'||!['Cumplida','Incumplida'].includes(activity.verificacion?.resultado))return null;
 const entries=(activity.ejecuciones||[]).filter(e=>!activity.ejecuciones.some(n=>n.sustituye===e.id));
 if(!entries.length||entries.some(e=>e.validacion?.estado!=='Validada'||!e.asistenciaIds?.length))return null;
 const ids=new Set(entries.flatMap(e=>e.asistenciaIds)),records=attendance.filter(r=>r.estado==='Presente'&&(ids.has(r.id)||(r.activityIds?.includes(activity.id)&&positive(r.asignacionHoras?.[activity.id]))));
 if([...ids].some(id=>!records.some(r=>r.id===id))||records.some(r=>!positive(r.horas)||!positive(r.asignacionHoras?.[activity.id])||r.asignacionHoras[activity.id]>r.horas))return null;
 const hours=records.reduce((n,r)=>n+r.asignacionHoras[activity.id],0),quantity=entries.reduce((n,e)=>n+e.cantidad,0);
 if(!positive(hours)||!positive(quantity))return null;
 return {activityId:activity.id,partida:activity.planificacion?.partida?.name||null,unit:activity.unidad,contractor:new Set(records.map(r=>r.contratista)).size===1?records[0].contratista:null,teams:[...new Set(records.map(r=>r.cuadrilla))],quantity,hours,rate:quantity/hours,basis:'persona-hora',sourceIds:records.map(r=>r.id),conditions:activity.planificacion?.notes||''};
}
export function comparableHistory(activities,attendance,criteria){return activities.map(a=>observedYield(a,attendance)).filter(r=>r&&r.partida&&r.partida===criteria.partida&&r.unit===criteria.unit&&r.contractor===criteria.contractor&&r.conditions===(criteria.conditions||'')&&(!criteria.teams?.length||JSON.stringify([...r.teams].sort())===JSON.stringify([...criteria.teams].sort())));}
