// Almacenamiento local del Last Planner: IndexedDB «atlas-lastplanner» con actividades (de todos los pisos) y reuniones.
// Guardado atómico con versión esperada: no se sobrescribe lo que otra pestaña guardó entretanto.
// El respaldo JSON lleva todo el plan para pasarlo a otro equipo.
import {validarActividad, validarReunion, RESPALDO} from './lastplanner-model.mjs';
import {migrateActivity,migrateRestrictions,migrateWeeks} from './lastplanner-cycle-model.mjs';

export function abrirLP() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('atlas-lastplanner',2);
    r.onupgradeneeded=()=>{
      const db=r.result,tx=r.transaction;
      if(!db.objectStoreNames.contains('actividades')){const t=db.createObjectStore('actividades',{keyPath:'id'});t.createIndex('level','level');t.createIndex('semana','semana');}
      if(!db.objectStoreNames.contains('reuniones'))db.createObjectStore('reuniones',{keyPath:'id'}).createIndex('fecha','fecha');
      for(const table of ['restricciones','asistencias','semanas','evidencias','archivos','pendientes','sync'])if(!db.objectStoreNames.contains(table))db.createObjectStore(table,table==='pendientes'?{keyPath:'order',autoIncrement:true}:{keyPath:'id'});
      const q=tx.objectStore('actividades').getAll();q.onsuccess=()=>{
        const activities=q.result.map(migrateActivity);for(const a of activities)tx.objectStore('actividades').put(a);
        const weeks=migrateWeeks(activities);for(const item of weeks)tx.objectStore('semanas').put(item);
        const restrictions=migrateRestrictions(activities);for(const item of restrictions)tx.objectStore('restricciones').put(item);
        const rq=tx.objectStore('reuniones').getAll();rq.onsuccess=()=>{
          const ops=[...activities.filter(a=>!a.id.startsWith('demo-')).map(data=>({table:'actividades',data,expected:0})),...restrictions.filter(r=>!r.id.startsWith('demo-')).map(data=>({table:'restricciones',data,expected:0})),...rq.result.filter(r=>!r.id.startsWith('demo-')).map(data=>({table:'reuniones',data,expected:0})),...weeks.map(data=>({table:'semanas',data,expected:0}))];
          if(ops.length)tx.objectStore('pendientes').add({id:crypto.randomUUID(),at:new Date().toISOString(),action:'migration',ops});
        };
      };
    };
    r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cierra otras pestañas de Atlas para actualizar la base sin perder datos.'));
  });
}
const abrir=abrirLP;
async function transaccion(modo, tablas, run) {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(tablas, modo); let resultado, motivo;
      tx.oncomplete = () => resolve(resultado);
      tx.onabort = () => reject(motivo || tx.error || Error('No se pudo guardar el plan.'));
      run(Object.fromEntries(tablas.map(t => [t, tx.objectStore(t)])), v => { resultado = v; }, m => { motivo = Error(m); tx.abort(); });
    });
  } finally { db.close(); }
}
const avisar = () => window.dispatchEvent?.(new CustomEvent('atlas-lastplanner-changed'));
const todos = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export const leerActividades = () => transaccion('readonly', ['actividades'], async (s, listo) => { listo(await todos(s.actividades.getAll())); });
export const leerReuniones = () => transaccion('readonly', ['reuniones'], async (s, listo) => { listo(await todos(s.reuniones.getAll())); });

// Guarda varias actividades juntas (p. ej. la original y su reprogramación). Cada una lleva la versión que se leyó.
export async function guardarActividades(cambios) {
  for (const {actividad, versionEsperada} of cambios) { validarActividad(actividad); if (actividad.version !== versionEsperada + 1) throw Error('Versión inválida.'); }
  await transaccion('readwrite', ['actividades'], (s, listo, abortar) => {
    let pendientes = cambios.length;
    for (const {actividad, versionEsperada} of cambios) s.actividades.get(actividad.id).onsuccess = e => {
      if ((e.target.result?.version || 0) !== versionEsperada) return abortar('La actividad cambió en otra pestaña. Ciérrala y vuelve a abrirla.');
      s.actividades.put(actividad);
      if (--pendientes === 0) listo(cambios.length);
    };
  });
  avisar();
}
// Solo se eliminan actividades planificadas: lo comprometido y cerrado forma parte del PPC.
export async function eliminarActividad(id) {
  await transaccion('readwrite', ['actividades'], (s, listo, abortar) => {
    s.actividades.get(id).onsuccess = e => {
      const a = e.target.result;
      if (a && a.estado !== 'Planificada') return abortar('Solo se elimina una actividad planificada; las cerradas cuentan para el PPC.');
      s.actividades.delete(id); listo(true);
    };
  });
  avisar();
}
export async function guardarReunion(reunion, versionEsperada) {
  validarReunion(reunion);
  if (reunion.version !== versionEsperada + 1) throw Error('Versión inválida.');
  await transaccion('readwrite', ['reuniones'], (s, listo, abortar) => {
    s.reuniones.get(reunion.id).onsuccess = e => {
      if ((e.target.result?.version || 0) !== versionEsperada) return abortar('La reunión cambió en otra pestaña. Ciérrala y vuelve a abrirla.');
      s.reuniones.put(reunion); listo(reunion);
    };
  });
  avisar();
}
export async function eliminarReunion(id) {
  await transaccion('readwrite', ['reuniones'], (s, listo) => { s.reuniones.delete(id); listo(true); });
  avisar();
}

// Datos de ejemplo (id con prefijo «demo-»): se reemplazan o se quitan de una vez, sin tocar los registros reales.
export async function reemplazarEjemplo({actividades = [], reuniones = []}, prefijo = 'demo-') {
  actividades.forEach(validarActividad); reuniones.forEach(validarReunion);
  if ([...actividades, ...reuniones].some(r => !r.id.startsWith(prefijo))) throw Error('Los datos de ejemplo deben llevar el prefijo ' + prefijo + '.');
  let quitados = 0;
  await transaccion('readwrite', ['actividades', 'reuniones'], (s, listo) => {
    let pendientes = 2;
    for (const tabla of ['actividades', 'reuniones']) s[tabla].getAllKeys().onsuccess = e => {
      for (const k of e.target.result) if (String(k).startsWith(prefijo)) { s[tabla].delete(k); quitados++; }
      for (const r of tabla === 'actividades' ? actividades : reuniones) s[tabla].put(r);
      if (--pendientes === 0) listo();
    };
  });
  avisar();
  return quitados;
}

export async function exportarPlan() { return (await import('./lastplanner-cycle-store.mjs')).exportWorkflow(); }
// Importación aditiva: agrega lo que no existe; si un registro existente difiere, no se importa nada.
export async function importarPlan(respaldo) {
 if(respaldo?.format!==RESPALDO||!Array.isArray(respaldo.actividades)||!Array.isArray(respaldo.reuniones))throw Error('Respaldo del Last Planner inválido.');
 if(respaldo.schema===2)return (await import('./lastplanner-cycle-store.mjs')).importWorkflow(respaldo);
 respaldo.actividades.forEach(validarActividad);respaldo.reuniones.forEach(validarReunion);
 const actividades=respaldo.actividades.map(migrateActivity);
 return (await import('./lastplanner-cycle-store.mjs')).importWorkflow({...respaldo,schema:2,actividades,restricciones:migrateRestrictions(actividades),asistencias:[],semanas:migrateWeeks(actividades),evidencias:[],archivos:[]});
}
