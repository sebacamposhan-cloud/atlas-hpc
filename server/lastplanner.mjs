import {createHash} from 'node:crypto';
import * as C from '../dist/lastplanner-cycle-model.mjs';
import {validarReunion} from '../dist/lastplanner-model.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error=(status,message)=>Object.assign(Error(message),{status});
const permission=action=>({migration:'revision',meeting:'attendance',reprogram:'draft'}[action]||action);
const digest=value=>createHash('sha256').update(C.canonical(value)).digest('hex');
export function validateOperations(ops,action,rows,actor){
 C.requirePermission(actor,permission(action));if(!Array.isArray(ops)||!ops.length||ops.length>500)throw error(400,'Lote de registros no válido.');
 const existing=new Map(rows.map(r=>[r.tipo+':'+r.id,r])),merged=Object.fromEntries(C.TABLES.map(t=>[t,rows.filter(r=>r.tipo===t).map(r=>r.data)]));
 const seen=new Set();
 for(const op of ops){
  const key=op.table+':'+op.data?.id;if(seen.has(key)||!C.TABLES.includes(op.table)||op.id!==op.data?.id||typeof op.id!=='string'||op.id.length>512||!Number.isSafeInteger(op.expectedRemote)||op.expectedRemote<0||!op.data||typeof op.data!=='object'||Array.isArray(op.data)||Buffer.byteLength(JSON.stringify(op.data))>2000000)throw error(400,'Registro repetido o inválido.');seen.add(key);
  const previous=existing.get(key);if((previous?.version||0)!==op.expectedRemote)throw error(409,'El registro cambió en otro equipo. Se conserva el lote pendiente para resolver el conflicto.');
  if(action==='migration'&&!previous){if(op.table==='actividades')C.validateActivity(op.data);}
  else C.validateMutation(op.table,previous?.data,op.data,action,actor);
  if(op.table==='reuniones')validarReunion(op.data);
  const index=merged[op.table].findIndex(r=>r.id===op.id);if(index<0)merged[op.table].push(op.data);else merged[op.table][index]=op.data;
 }
 for(const op of ops){const a=op.data,previous=existing.get(op.table+':'+op.id)?.data;
  if(op.table==='actividades'){
   if(a.restrictionIds.some(id=>!merged.restricciones.some(r=>r.id===id&&r.activityIds.includes(a.id))))throw error(400,'Restricción no vinculada al registro central.');
   if(a.alcances.some(s=>s.level&&s.level!==a.level))throw error(400,'Una superficie pertenece a otro piso.');
   if(previous&&action==='execution'){
    if(a.ejecuciones.length!==previous.ejecuciones.length&&a.ejecuciones.length!==previous.ejecuciones.length+1)throw error(400,'Registra cada avance una sola vez.');
    if(C.canonical(a.ejecuciones.slice(0,previous.ejecuciones.length))!==C.canonical(previous.ejecuciones))throw error(400,'La ejecución previa es inalterable; corrígela con un registro que la sustituya.');
    if(a.ejecuciones.length>previous.ejecuciones.length){const e=a.ejecuciones.at(-1);if(e.validacion?.estado!=='Pendiente')throw error(403,'Una captura de ejecución no puede validarse a sí misma.');C.recordExecution(previous,e,merged.asistencias,merged.restricciones,actor);}
    else C.startActivity(previous,merged.restricciones,actor,{date:a.inicioReal});
   }
   if(previous&&action==='verify'){
    if(a.ejecuciones.length!==previous.ejecuciones.length)throw error(400,'La revisión no agrega mediciones.');
    for(let i=0;i<a.ejecuciones.length;i++){const old=previous.ejecuciones[i],next=a.ejecuciones[i],without=v=>{const {validacion,...rest}=v;return rest;};if(C.canonical(without(old))!==C.canonical(without(next)))throw error(400,'La revisión no modifica cantidades ni superficies informadas.');if(C.canonical(old.validacion)!==C.canonical(next.validacion))C.validateExecution(previous,old.id,next.validacion,actor);}
    if(C.canonical(a.verificacion)!==C.canonical(previous.verificacion))C.reviewActivity({...previous,ejecuciones:a.ejecuciones},a.verificacion.resultado,a.verificacion,merged,actor);
   }
   if(previous&&action==='publish'){
    const original={...a.compromisoOriginal};delete original.publicada;delete original.autor;delete original.actor;
    if(previous.fase!=='borrador'||a.fase!=='publicada'||C.canonical(original)!==C.canonical(C.planFields(previous))||!a.alcances.length||a.legacyIncomplete)throw error(400,'El compromiso publicado debe ser una copia exacta del borrador completo.');
    if(a.compromisoOriginal.actor!==actor.id||a.compromisoOriginal.autor!==actor.email)throw error(403,'La publicación debe identificar al usuario autenticado.');
    if(!ops.some(o=>o.table==='semanas'&&o.data.activityIds.includes(a.id)))throw error(400,'Falta la emisión semanal.');
   }
   if(previous&&action==='revision'){
    const revision=a.revisiones?.at(-1);C.reviseCommitment(previous,C.planFields(a),revision?.motivo,actor);
    if(a.revisiones.length!==previous.revisiones.length+1||C.canonical(a.revisiones.slice(0,-1))!==C.canonical(previous.revisiones))throw error(400,'Las revisiones autorizadas son acumulativas.');
    if(revision.actor!==actor.id||revision.autor!==actor.email||C.canonical(revision.antes)!==C.canonical(C.planFields(previous))||C.canonical(revision.despues)!==C.canonical(C.planFields(a)))throw error(400,'La revisión debe conservar exactamente los valores anteriores y nuevos.');
   }
   if(previous&&action==='reprogram'&&a.saldoReprogramado!==previous.saldoReprogramado){const next=merged.actividades.find(t=>t.id===a.saldoReprogramado);if(!next||next.origen!==a.id)throw error(400,'Falta la relación con el saldo.');const expected=C.reprogramBalance(previous,next,actor,{newId:next.id});if(Math.abs(next.cantidad-expected.next.cantidad)>C.EPS)throw error(400,'El saldo duplica o altera la cantidad ejecutada.');}
   if(action==='close'&&!ops.some(o=>o.table==='semanas'&&o.data.cerrada&&o.data.activityIds.includes(a.id)))throw error(400,'El cierre de actividades pertenece a su cierre semanal atómico.');
  }
  if(op.table==='asistencias'){
   C.attendance(a,actor,previous);if(action!=='migration')C.validateAttendanceLinks(a,previous,merged.actividades);
  }
  if(op.table==='restricciones'){
   if(!Array.isArray(a.activityIds)||!a.activityIds.length||a.activityIds.some(id=>!merged.actividades.some(t=>t.id===id&&t.restrictionIds.includes(a.id))))throw error(400,'Restricción sin actividad asociada.');
   if(previous&&a.estado!==previous.estado)C.transitionRestriction(previous,a.estado,{nota:a.historial.at(-1)?.comentario},actor);
   if(!previous&&action!=='migration'){
    const activity=merged.actividades.find(t=>a.activityIds.includes(t.id));C.createRestriction(a,activity,actor);
    if(a.estado!=='Identificada')throw error(400,'Una restricción nueva comienza identificada.');
   }
  }
  if(op.table==='evidencias'&&action!=='migration'){
   const activity=merged.actividades.find(t=>t.id===a.activityId);if(!activity||activity.fase==='cerrada'||activity.verificacion.resultado!=='Pendiente de verificación')throw error(400,'La evidencia corresponde a una actividad abierta.');
   if(a.roomId&&!activity.recintos.some(r=>r.id===a.roomId)||a.scopeId&&!activity.alcances.some(s=>s.id===a.scopeId&&(!a.roomId||s.roomId===a.roomId)))throw error(400,'Evidencia ajena al recinto o superficie.');
  }
  if(op.table==='semanas'&&action!=='migration'){
   if(a.id!==a.level+'_'+a.semana||!Array.isArray(a.activityIds)||new Set(a.activityIds).size!==a.activityIds.length||a.activityIds.some(id=>!merged.actividades.some(t=>t.id===id&&t.fase!=='borrador'&&t.level===a.level&&t.semana===a.semana)))throw error(400,'La emisión debe contener sus compromisos del mismo piso y semana.');
   if(action==='publish'){
    const emission=a.publicaciones?.at(-1),published=ops.filter(o=>o.table==='actividades'&&o.data.level===a.level&&o.data.semana===a.semana);
    if(a.publicaciones.length!==(previous?.publicaciones.length||0)+1||!emission||emission.compromisos.length!==published.length||published.some(o=>!emission.compromisos.some(c=>c.id===o.id&&c.version===o.data.version&&C.canonical(c.plan)===C.canonical(o.data.compromisoOriginal))))throw error(400,'La emisión debe congelar exactamente todos los compromisos publicados.');
   }
  }
  if(op.table==='semanas'&&action==='close'){
   const expected=C.closeWeek(previous,merged.actividades,actor).plan.cierre.resultados,byId=rows=>Object.fromEntries(rows.map(r=>[r.id,r]));if(C.canonical(byId(expected))!==C.canonical(byId(a.cierre?.resultados||[])))throw error(400,'El cierre debe conservar los resultados y originales reales.');
  }
 }
 if(action==='draft')for(const root of new Set(ops.filter(o=>o.table==='actividades'&&o.data.grupo).map(o=>o.data.grupo.id))){const members=merged.actividades.filter(a=>a.grupo?.id===root),group=members[0].grupo;if(members.length!==group.total||Math.abs(members.reduce((n,a)=>n+a.cantidad,0)-group.cantidadTotal)>C.EPS)throw error(400,'La distribución semanal debe conservar el total del grupo.');}
 return ops;
}
export function createLastPlannerCloud(env,fetchImpl=fetch){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,''),key=env.SUPABASE_ANON_KEY,configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)&&!!key;
 return async(req,res,url)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   if(!configured)throw error(503,'La Nube de Atlas no está configurada. Los cambios locales permanecen guardados.');
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw error(403,'Origen no autorizado.');
   const token=req.headers['x-campo-session'];if(typeof token!=='string'||!token||token.length>8192)throw error(401,'Entra con tu cuenta personal de Atlas.');
   const call=async(path,{method='GET',body,mime,raw=false}={})=>{
    const response=await fetchImpl(base+path,{method,signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+token,...(body?{'Content-Type':mime||'application/json'}:{})},...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
    const data=raw&&response.ok?Buffer.from(await response.arrayBuffer()):await response.json().catch(()=>null);
    if(response.status===401||Number(data?.statusCode)===401)throw error(401,'La sesión terminó. Vuelve a entrar en Nube.');return {ok:response.ok,status:response.status,data};
   };
   const profile=await call('/auth/v1/user');if(!profile.ok)throw error(401,'Sesión no válida.');const user=profile.data,actor={id:user.id||user.email,email:user.email,role:user.app_metadata?.campo_role,permissions:user.app_metadata?.lastplanner_permissions==null?null:Array.isArray(user.app_metadata.lastplanner_permissions)?user.app_metadata.lastplanner_permissions:[]};
   if(!['editor','lector'].includes(actor.role))throw error(403,'La cuenta no tiene acceso a Atlas.');
   if(url.pathname==='/api/lastplanner/session'&&req.method==='GET')return send(200,{actor,permissions:C.PERMISSIONS.filter(p=>C.allowed(actor,p))});
   const read=async limit=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw error(413,'Envío demasiado grande.');chunks.push(chunk);}return Buffer.concat(chunks);};
   const list=async()=>{const rows=[];for(let offset=0;offset<100000;offset+=500){const r=await call('/rest/v1/atlas_lp_records?select=tipo,id,version,data,updated_at,updated_by&order=tipo.asc,id.asc&limit=500&offset='+offset);if(!r.ok)throw error(503,'Falta configurar Last Planner en Nube: ejecuta supabase/lastplanner-cycle.sql.');rows.push(...r.data);if(r.data.length<500)break;}return rows;};
   if(url.pathname==='/api/lastplanner/records'&&req.method==='GET')return send(200,{registros:await list()});
   if(url.pathname==='/api/lastplanner/records'&&req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw error(415,'Se requiere JSON.');let body;try{body=JSON.parse((await read(12000000)).toString('utf8'));}catch(e){throw e.status?e:error(400,'JSON inválido.');}
    if(!UUID.test(body.id||'')||!['draft','publish','execution','attendance','restriction','evidence','verify','close','revision','reprogram','migration','meeting'].includes(body.action))throw error(400,'Operación no válida.');
    C.requirePermission(actor,permission(body.action));const hash=digest({action:body.action,ops:body.ops}),done=await call('/rest/v1/atlas_lp_operaciones?id=eq.'+body.id+'&select=actor,huella,resultado');
    if(!done.ok)throw error(503,'Falta ejecutar la migración supabase/lastplanner-cycle.sql.');
    if(done.data?.length){const prior=done.data[0];if(prior.actor!==actor.id||prior.huella!==hash)throw error(409,'La identidad de la operación ya se usó para otros datos.');return send(200,prior.resultado);}
    const rows=await list();validateOperations(body.ops,body.action,rows,actor);
    for(const op of body.ops.filter(o=>o.table==='evidencias')){
     const evidence=op.data,file=await call('/storage/v1/object/authenticated/atlas-lp/'+op.id,{raw:true});
     if(!file.ok||file.data.length!==evidence.bytes||digestBytes(file.data)!==evidence.sha256)throw error(400,'La evidencia debe corresponder al archivo real guardado en Nube.');
    }
    const r=await call('/rest/v1/rpc/guardar_lote_atlas_lp',{method:'POST',body:{p_id:body.id,p_accion:body.action,p_huella:hash,p_ops:body.ops}});
    if(!r.ok){if(r.data?.code==='40001'||r.data?.code==='23505')throw error(409,'Conflicto con otro equipo. Se conserva el lote local completo.');if(/Unauthorized|permission|permiso/i.test(r.data?.message||''))throw error(403,'Tu cuenta no tiene permiso para esta operación.');throw error(400,r.data?.message||'No se pudo guardar el ciclo Last Planner.');}
    return send(200,r.data);
   }
   const match=url.pathname.match(/^\/api\/lastplanner\/files\/([0-9a-f-]{36})$/i);
   if(match&&UUID.test(match[1])){
    if(req.method==='PUT'){
     C.requirePermission(actor,'evidence');const mime=req.headers['content-type'],allowed=['image/jpeg','image/png','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(!allowed.includes(mime))throw error(415,'Formato de evidencia no permitido.');const bytes=await read(15728640);if(!bytes.length)throw error(400,'Archivo vacío.');
     if(mime==='image/jpeg'&&bytes.subarray(0,2).toString('hex')!=='ffd8'||mime==='image/png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||mime==='application/pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||mime.includes('wordprocessingml')&&!bytes.subarray(0,2).equals(Buffer.from('PK')))throw error(400,'El contenido no corresponde al formato declarado.');
     const r=await call('/storage/v1/object/atlas-lp/'+match[1],{method:'POST',body:bytes,mime});if(!r.ok&&r.status!==409&&Number(r.data?.statusCode)!==409)throw error(503,'No se pudo guardar la evidencia en Nube.');
     if(!r.ok){const current=await call('/storage/v1/object/authenticated/atlas-lp/'+match[1],{raw:true});if(!current.ok||digestBytes(current.data)!==digestBytes(bytes))throw error(409,'La evidencia ya existe con otros bytes.');}
     return send(200,{id:match[1],sha256:digestBytes(bytes)});
    }
    if(req.method==='GET'){const r=await call('/storage/v1/object/authenticated/atlas-lp/'+match[1],{raw:true});if(!r.ok)throw error(404,'Evidencia aún no disponible en Nube.');res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(r.data);}
   }
   throw error(404,'Ruta no disponible.');
  }catch(e){return send(e.status||(/permiso|sesión/.test(e.message)?403:400),{error:e.status?e.message:e.message||'No se pudo procesar Last Planner.'});}
 };
}
const digestBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
