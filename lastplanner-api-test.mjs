import assert from 'node:assert/strict';
import * as C from './dist/lastplanner-cycle-model.mjs';
import {validateOperations} from './server/lastplanner.mjs';
import {createAtlasServer} from './server/groq-server.mjs';
const actor={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.test',role:'editor'};
const values={actividad:'Pintura API',level:'N-1',responsable:'Quijote',inicioPlan:'2026-10-19',finPlan:'2026-10-25',cantidad:120,unidad:'m²',recintos:[{id:'r1',code:'R1'}],alcances:[{id:'s1',roomId:'r1',code:'R1',tipo:'muros',geometry:{type:'line',points:[[0,0],[100,0]]}}]};
const draft=C.createDraft(values,actor),pub=C.publishWeek([draft],draft.semana,draft.level,actor),activity=pub.activities[0],record=(data,version=data.version)=>({tipo:'actividades',id:data.id,version,data}),op=(data,expectedRemote=data.version-1,table='actividades')=>({table,id:data.id,data,expectedRemote});
assert.equal(validateOperations([op(draft)],'draft',[],actor).length,1);
assert.throws(()=>validateOperations([op(draft)],'draft',[],{...actor,role:'lector'}),/permiso/);
assert.throws(()=>validateOperations([op(draft)],'draft',[record(draft)],actor),/cambió/);
assert.throws(()=>validateOperations([op(C.changed(activity,{...activity,cantidad:90},actor,'Cambio silencioso'))],'execution',[record(activity)],actor),/permiso|revisión/);
assert.throws(()=>validateOperations([op(C.changed(activity,{...activity,ejecucionHistorica:{cantidad:120,verificada:true}},actor,'Inventar historial'))],'execution',[record(activity)],actor),/permiso/);
assert.throws(()=>validateOperations([op({...draft,fase:'cerrada'})],'draft',[],actor),/compromiso|borrador/);
assert.throws(()=>validateOperations([op({...draft,id:'s1'},0,'evidencias')],'draft',[],actor),/colección/);
assert.throws(()=>validateOperations([op(C.changed(activity,{...activity,verificacion:{resultado:'Cumplida'}},actor,'Cumplimiento sin medición'))],'verify',[record(activity)],actor),/100/);
const plan=pub.plan,badPlan=C.changed(plan,{...plan,activityIds:[]},actor,'Excluir compromiso del PPC');assert.throws(()=>validateOperations([op(badPlan,1,'semanas')],'publish',[{tipo:'semanas',id:plan.id,version:1,data:plan}],actor),/excluir/);
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-test',SUPABASE_URL:'https://isolated.supabase.co',SUPABASE_ANON_KEY:'isolated'},fetchImpl:async url=>url.endsWith('/auth/v1/user')?Response.json({id:actor.id,email:actor.email,app_metadata:{campo_role:'lector'}}):Response.json([])});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{const headers={Authorization:'Basic '+Buffer.from('atlas:isolated-test').toString('base64')};assert.equal((await fetch(base+'/api/lastplanner/session',{headers})).status,401);headers['X-Campo-Session']='isolated-token';const session=await fetch(base+'/api/lastplanner/session',{headers});assert.equal(session.status,200);assert.deepEqual((await session.json()).permissions,[]);assert.equal((await fetch(base+'/api/lastplanner/records',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),action:'draft',ops:[op(draft)]})})).status,403);assert.equal((await fetch(base+'/api/lastplanner/files/'+crypto.randomUUID(),{method:'PUT',headers:{...headers,'Content-Type':'text/plain'},body:'not allowed'})).status,403);console.log('Last Planner API: permisos, sesión personal, inmutabilidad, PPC y auditoría aprobados.');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
