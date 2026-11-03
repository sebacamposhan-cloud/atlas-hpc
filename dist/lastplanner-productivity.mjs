import {apuRate} from './apu-model.mjs';
import {scheduleCapacity,comparableHistory} from './lastplanner-daily.mjs';
export function planningEstimate({apu,activities=[],attendance=[],criteria,rows,unit,quantity,validatedReferences=[]}){
 const history=comparableHistory(activities,attendance,{...criteria,partId:apu?.partId,operationId:apu?.operation?.id,apuVersion:apu?.version});
 let reference=apuRate(apu,validatedReferences);
 const observedCounts=history.flatMap(h=>h.peopleByDay.map(d=>d.people));
 const withinObservedStaffing=observedCounts.length&&rows.every(r=>r.people>=Math.min(...observedCounts)&&r.people<=Math.max(...observedCounts));
 if(history.length>=3&&withinObservedStaffing){reference={rate:history.reduce((n,r)=>n+r.quantity,0)/history.reduce((n,r)=>n+r.hours,0),unit,basis:'persona-hora',status:'observado',source:'Ejecución verificada de '+history.length+' actividades comparables',activityIds:history.map(r=>r.activityId),sampleSize:history.length,range:[Math.min(...history.map(r=>r.rate)),Math.max(...history.map(r=>r.rate))]};}
 if(!reference||reference.unit!==unit)return null;
 const capacity=scheduleCapacity(rows.map(({productivity,...r})=>r),reference,unit);if(!capacity.calculated)return null;
 const required=quantity/reference.rate,resource=reference.basis==='persona-hora'?capacity.personHours:reference.basis==='persona-dia'?capacity.personDays:reference.basis==='cuadrilla-dia'?capacity.crewDays:capacity.crewHours;
 let accumulated=0,completionDate=null;for(const [date,amount] of Object.entries(capacity.daily).sort(([a],[b])=>a.localeCompare(b))){accumulated+=amount;if(accumulated>=quantity){completionDate=date;break;}}
 return {reference,capacity,required,completionDate,missing:Math.max(0,required-resource),difference:capacity.production-quantity};
}
