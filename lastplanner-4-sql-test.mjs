import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cloudFixture,QA_ACTOR,requestFor} from './test-support/lastplanner-cloud.mjs';
import * as C from './dist/lastplanner-cycle-model.mjs';
const cloud=await cloudFixture();
try{
 const sql=fs.readFileSync('supabase/lastplanner-4.sql','utf8');await cloud.db.exec(sql);await cloud.db.exec(sql);assert.equal((await cloud.db.query("select public.atlas_lp_plan('{}'::jsonb) ? 'planificacion' as added")).rows[0].added,false);assert.equal(Object.hasOwn(C.planFields({}),'planificacion'),false);
 const values={actividad:'Planificación SQL 4',level:'N-1',responsable:'Supervisor',inicioPlan:'2026-11-02',finPlan:'2026-11-08',cantidad:100,unidad:'m²',recintos:[{id:'room',code:'R01'}],alcances:[{id:'location',roomId:'room',code:'R01',tipo:'recinto',locationOnly:true,geometry:{type:'polygon',points:[[0,0],[10,0],[10,10]]}}],planificacion:{version:1,partida:{name:'Pintura',family:'muros'},status:'provisional',rate:5,unit:'m²',basis:'persona-dia',source:'Ensayo'}};
 const a=C.createDraft(values,QA_ACTOR);await cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:a,expectedRemote:0}]));
 assert.throws(()=>C.publishWeek([a],a.semana,a.level,QA_ACTOR),/selección/);
 const forged=C.publishWeek([{...a,alcances:a.alcances.map(s=>({...s,locationOnly:false}))}],a.semana,a.level,QA_ACTOR).activities[0];forged.alcances=a.alcances;forged.compromisoOriginal={...forged.compromisoOriginal,...C.planFields(a)};await assert.rejects(()=>cloud.rpc(requestFor('publish',[{table:'actividades',id:a.id,data:forged,expectedRemote:1}])),/Publication must freeze/);
 const changed=C.editDraft(a,{...C.planFields(a),alcances:[{...a.alcances[0],id:'floor',tipo:'pavimentos',locationOnly:false}]},QA_ACTOR);await cloud.rpc(requestFor('draft',[{table:'actividades',id:a.id,data:changed,expectedRemote:1}]));assert.deepEqual((await cloud.rows())[0].data.planificacion,values.planificacion);
 console.log('Actualización SQL repetible, persistencia de productividad y rechazo de publicación sin superficies aprobados');
}finally{await cloud.close();}
