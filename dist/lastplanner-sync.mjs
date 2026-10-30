// Offline queue for the existing Last Planner database, using the existing personal Nube session.
import {abrirLP} from './lastplanner-store.mjs';
import {TABLES,canonical,validateActivity} from './lastplanner-cycle-model.mjs';
const req=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
async function read(table){const db=await abrirLP();try{return await req(db.transaction(table).objectStore(table).getAll());}finally{db.close();}}
async function commit(changes){const db=await abrirLP();try{await new Promise((resolve,reject)=>{const tx=db.transaction([...new Set(changes.map(c=>c.table))],'readwrite');for(const change of changes){const table=tx.objectStore(change.table);if(change.remove)table.delete(change.id);else table.put(change.data);}tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
let running=null;
export function syncLastPlanner(api,role){if(running)return running;running=sync(api,role).finally(()=>{running=null;});return running;}
async function sync(api,role){
 const result={subidos:0,bajados:0,conflictos:0,archivos:0};
 try{
  let remote=(await api('GET','/api/lastplanner/records')).registros;
  const metadata=new Map((await read('sync')).filter(r=>r.id!=='status').map(r=>[r.id,r]));
  const jobs=(await read('pendientes')).sort((a,b)=>a.order-b.order);
  if(role==='editor')for(const job of jobs){
   const adopted=[];
   const pending=job.ops.filter(op=>{if(job.action!=='migration')return true;const row=remote.find(r=>r.tipo===op.table&&r.id===op.data.id);if(!row||canonical(row.data)!==canonical(op.data))return true;const meta={id:row.tipo+':'+row.id,remoteVersion:row.version,lastData:row.data};metadata.set(meta.id,meta);adopted.push({table:'sync',data:meta});return false;});
   if(!pending.length){await commit([...adopted,{table:'pendientes',remove:true,id:job.order}]);continue;}
   const ops=pending.map(op=>({table:op.table,id:op.data.id,expectedRemote:metadata.get(op.table+':'+op.data.id)?.remoteVersion||0,data:op.data}));
   for(const op of ops.filter(o=>o.table==='evidencias')){
    const file=(await read('archivos')).find(f=>f.id===op.id);if(!file)throw Error('Faltan bytes de evidencia local. Restaura su respaldo antes de sincronizar.');
    const uploaded=await api('PUT','/api/lastplanner/files/'+op.id,file.bytes,{tipo:op.data.mime});if(uploaded.sha256!==op.data.sha256)throw Error('La huella de la evidencia subida no coincide.');
   }
   let ack;try{ack=await api('POST','/api/lastplanner/records',{id:job.id,action:job.action,ops});}catch(error){if(error.status===409){result.conflictos++;await commit([{table:'sync',data:{id:'status',state:'conflict',message:error.message,jobId:job.id,at:new Date().toISOString()}}]);return result;}throw error;}
   const changes=[...adopted,{table:'pendientes',remove:true,id:job.order}];for(const row of ack){const op=ops.find(op=>op.table===row.tipo&&op.id===row.id),meta={id:row.tipo+':'+row.id,remoteVersion:row.version,lastData:op.data};metadata.set(meta.id,meta);changes.push({table:'sync',data:meta});}await commit(changes);result.subidos+=ops.length;
  }
  remote=(await api('GET','/api/lastplanner/records')).registros;
  const pendingKeys=new Set((await read('pendientes')).flatMap(job=>job.ops.map(op=>op.table+':'+op.data.id))),local={};for(const table of TABLES)local[table]=new Map((await read(table)).map(r=>[r.id,r]));
  let changed=false;
  for(const row of remote){
   if(!TABLES.includes(row.tipo)||row.data?.id!==row.id)throw Error('Nube devolvió un registro Last Planner incompatible.');
   if(row.tipo==='actividades')validateActivity(row.data);
   const key=row.tipo+':'+row.id,record=local[row.tipo].get(row.id),meta=metadata.get(key);
   if(pendingKeys.has(key)){if(meta?.remoteVersion!==row.version)result.conflictos++;continue;}
   if(record&&canonical(record)!==canonical(row.data)&&(!meta||canonical(record)!==canonical(meta.lastData))){result.conflictos++;await commit([{table:'sync',data:{id:key,...meta,conflict:{remote:row,local:record}}}]);continue;}
   const changes=[{table:'sync',data:{id:key,remoteVersion:row.version,lastData:row.data}}];if(canonical(record)!==canonical(row.data)){changes.push({table:row.tipo,data:row.data});result.bajados++;changed=true;}await commit(changes);
  }
  const files=new Set((await read('archivos')).map(file=>file.id));for(const row of remote.filter(r=>r.tipo==='evidencias'&&!files.has(r.id))){const bytes=await api('GET','/api/lastplanner/files/'+row.id,null,{binario:true});if(await sha(bytes)!==row.data.sha256)throw Error('La evidencia descargada no coincide con su huella.');await commit([{table:'archivos',data:{id:row.id,bytes,mime:row.data.mime,sha256:row.data.sha256}}]);result.archivos++;}
  await commit([{table:'sync',data:{id:'status',state:result.conflictos?'conflict':'ready',at:new Date().toISOString(),result}}]);
  if(changed||result.archivos)window.dispatchEvent(new CustomEvent('atlas-lastplanner-changed',{detail:{origen:'nube'}}));
  return result;
 }catch(error){await commit([{table:'sync',data:{id:'status',state:'error',message:error.message,at:new Date().toISOString()}}]);throw error;}
}
