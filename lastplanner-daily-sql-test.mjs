import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cloudFixture,QA_ACTOR,requestFor} from './test-support/lastplanner-cloud.mjs';
import {createDraft,editDraft,planFields} from './dist/lastplanner-cycle-model.mjs';
import {putAssignment} from './dist/lastplanner-daily.mjs';
const cloud=await cloudFixture();
try{
 const sql=fs.readFileSync('supabase/lastplanner-daily.sql','utf8');await cloud.db.exec(sql);await cloud.db.exec(sql);
 const schedule=putAssignment([],{date:'2026-11-02',contractor:'Quijote',teamName:'Pintura 1',people:2,fraction:1});
 const a=createDraft({actividad:'SQL daily QA',level:'N-1',responsable:'QA',inicioPlan:'2026-11-02',finPlan:'2026-11-08',cantidad:100,unidad:'m²',planificacion:{schedule}},QA_ACTOR);
 await cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:a,expectedRemote:0}]));assert.deepEqual((await cloud.rows())[0].data.planificacion.schedule,schedule);
 const edit=editDraft(a,{...planFields(a),planificacion:{schedule:putAssignment(schedule,{...schedule[0],people:4})}},QA_ACTOR);
 for(const mutate of [r=>({...r,people:-1}),r=>({...r,date:'2026-11-09',id:'2026-11-09|'+r.teamId}),r=>({...r,hours:25,referenceHours:8}),r=>({...r,teamId:'forged'})]){
  const invalid=structuredClone(edit);invalid.planificacion.schedule=invalid.planificacion.schedule.map(mutate);await assert.rejects(()=>cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:invalid,expectedRemote:1}])));
 }
 const duplicate=structuredClone(edit);duplicate.planificacion.schedule.push(duplicate.planificacion.schedule[0]);await assert.rejects(()=>cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:duplicate,expectedRemote:1}])),/Duplicate/);
 await cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:edit,expectedRemote:1}]));assert.equal((await cloud.rows())[0].data.planificacion.schedule[0].people,4);
 console.log('SQL diario: migración repetible, persistencia, edición y rechazo de duplicados, fechas, horas y personas inválidas');
}finally{await cloud.close();}
