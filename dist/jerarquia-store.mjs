// Tareas de la jerarquía de obra en este equipo. Usan la misma base IndexedDB de Last Planner («metas» y «personas»)
// y la misma cola «pendientes» que sube lastplanner-sync.mjs con la sesión de Nube. Sin señal se guarda aquí y se
// sincroniza al volver. Las reglas viven en jerarquia-model.mjs; el servidor y la base las vuelven a comprobar.
import {abrirLP} from './lastplanner-store.mjs';
import * as J from './jerarquia-model.mjs';
import {canonical} from './lastplanner-cycle-model.mjs';
import {sessionActor, perfilGuardado, PERFIL_KEY} from './lastplanner-session.mjs';
import {readWorkflow} from './lastplanner-cycle-store.mjs';

const pedir = q => new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
const avisar = (origen = 'local') => window.dispatchEvent(new CustomEvent('atlas-jerarquia-changed', {detail: {origen}}));
const falla = m => { throw Error(m); };
async function leer(tabla) { const db = await abrirLP(); try { return await pedir(db.transaction(tabla).objectStore(tabla).getAll()); } finally { db.close(); } }
async function escribir(cambios) {
  if (!cambios.length) return;
  const db = await abrirLP();
  try { await new Promise((resolve, reject) => { const tx = db.transaction([...new Set(cambios.map(c => c.table))], 'readwrite'); for (const c of cambios) { const t = tx.objectStore(c.table); if (c.remove) t.delete(c.id); else t.put(c.data); } tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}

// Perfil de la última sincronización, también para la portada y la sesión (lastplanner-session.mjs), que leen sin esperar.
export function recordarPerfil(id, perfil) { try { localStorage.setItem(PERFIL_KEY, JSON.stringify({id, perfil: perfil || null, at: new Date().toISOString()})); } catch {} }
export function perfilActual() { const actor = sessionActor(); return actor ? perfilGuardado(actor.id) : null; }

export async function leerJerarquia() {
  const actor = sessionActor(), [personas, metas] = await Promise.all([leer('personas'), leer('metas')]);
  const perfil = personas.find(p => p.id === actor?.id && J.perfilActivo(p)) || (actor ? perfilGuardado(actor.id) : null);
  return {actor, perfil, personas: perfil && !personas.some(p => p.id === perfil.id) ? [...personas, perfil] : personas, metas};
}

// Guarda la tarea y su envío pendiente en una sola transacción, con la versión que se leyó.
async function guardar(accion, siguiente, previa, actor) {
  const db = await abrirLP();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['metas', 'pendientes'], 'readwrite'); let motivo;
      const q = tx.objectStore('metas').get(siguiente.id);
      q.onsuccess = () => {
        if ((q.result?.version || 0) !== (previa?.version || 0)) { motivo = Error('La tarea cambió en otra pestaña o equipo. Vuelve a abrirla.'); tx.abort(); return; }
        tx.objectStore('metas').put(siguiente);
        tx.objectStore('pendientes').add({id: crypto.randomUUID(), at: new Date().toISOString(), action: 'meta', accion, actor: actor.id, ops: [{table: 'metas', data: structuredClone(siguiente), expected: previa?.version || 0}]});
      };
      tx.oncomplete = resolve; tx.onabort = () => reject(motivo || tx.error || Error('No se pudo guardar la tarea.')); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
  avisar();
  return siguiente;
}
async function contexto() {
  const datos = await leerJerarquia();
  if (!datos.actor) falla('Inicia sesión en Atlas para usar tus tareas.');
  if (!datos.perfil) falla('Tu cuenta aún no tiene un perfil en la jerarquía de obra. Pide a la administración que lo cargue.');
  return datos;
}
const buscar = (datos, id) => datos.metas.find(m => m.id === id) || falla('La tarea no está en este equipo. Sincroniza y vuelve a intentar.');
const actividadDe = async id => id ? (await readWorkflow()).actividades.find(a => a.id === id) || null : null;

export async function asignar(valores) { const d = await contexto(); return guardar('asignar', J.crearMeta(valores, d.actor, d.personas, d.metas, {actividad: await actividadDe(valores.actividadId)}), null, d.actor); }
export async function editar(id, cambios) { const d = await contexto(), m = buscar(d, id); return guardar('editar', J.editarMeta(m, cambios, d.actor, d.personas, {actividad: await actividadDe(m.actividadId)}), m, d.actor); }
export async function avanzar(id, cambios) { const d = await contexto(), m = buscar(d, id); return guardar('avanzar', J.marcarAvance(m, cambios, d.actor), m, d.actor); }
export async function hecha(id, nota) { const d = await contexto(), m = buscar(d, id); return guardar('hecha', J.marcarHecha(m, d.actor, {nota}), m, d.actor); }
export async function confirmar(id, nota) { const d = await contexto(), m = buscar(d, id); return guardar('confirmar', J.confirmarMeta(m, d.actor, d.personas, {nota}), m, d.actor); }
export async function devolver(id, motivo) { const d = await contexto(), m = buscar(d, id); return guardar('devolver', J.devolverMeta(m, motivo, d.actor, d.personas), m, d.actor); }
export async function reasignar(id, destino, motivo) { const d = await contexto(), m = buscar(d, id); return guardar('reasignar', J.reasignarMeta(m, destino, motivo, d.actor, d.personas), m, d.actor); }
export async function anular(id, motivo) { const d = await contexto(), m = buscar(d, id); return guardar('anular', J.anularMeta(m, motivo, d.actor, d.personas), m, d.actor); }
export async function tareasPendientesDeSubir() { return (await leer('pendientes')).filter(j => j.action === 'meta').length; }

// ── Sincronización (la llama lastplanner-sync.mjs dentro de su pasada, en el orden de la cola) ──
// Un envío rechazado o en conflicto no detiene Last Planner: se quita de la cola, se guarda el aviso y lo de Nube manda.
export async function subirTarea(api, trabajo, metadata) {
  const op = trabajo.ops[0], clave = 'metas:' + op.data.id;
  try {
    const ack = await api('POST', '/api/jerarquia/metas', {id: trabajo.id, accion: trabajo.accion, meta: op.data, expected: metadata.get(clave)?.remoteVersion || 0});
    const meta = {id: clave, remoteVersion: ack.version, lastData: op.data};
    metadata.set(clave, meta);
    await escribir([{table: 'sync', data: meta}, {table: 'pendientes', remove: true, id: trabajo.order}]);
    return {estado: 'subida'};
  } catch (error) {
    if (![400, 403, 404, 409].includes(error.status)) throw error;
    const mensaje = (error.status === 409 ? 'Una tarea cambió en otro equipo; se dejó la versión de Nube. ' : 'Nube no aceptó un cambio de tarea: ') + error.message;
    await escribir([{table: 'sync', data: {id: 'aviso:' + trabajo.id, tipo: 'tarea', mensaje, local: op.data, at: new Date().toISOString()}}, {table: 'pendientes', remove: true, id: trabajo.order}]);
    return {estado: error.status === 409 ? 'conflicto' : 'rechazada', mensaje};
  }
}
// Baja perfiles y tareas visibles. Si el servidor aún no tiene la jerarquía (404) o falta el SQL, no cambia nada.
export async function bajarJerarquia(api) {
  let r;
  try { r = await api('GET', '/api/jerarquia/metas'); } catch (error) { if (error.status === 404) return null; throw error; }
  if (!r?.instalado) return null;
  const actor = sessionActor();
  let n = 0;
  if (actor) { const antes = canonical(perfilGuardado(actor.id)); recordarPerfil(actor.id, r.perfil && r.perfil.id === actor.id ? r.perfil : null); if (canonical(perfilGuardado(actor.id)) !== antes) n++; }
  const pendientes = new Set((await leer('pendientes')).filter(j => j.action === 'meta').map(j => j.ops[0].data.id));
  const locales = new Map((await leer('metas')).map(m => [m.id, m])), personasLocales = await leer('personas');
  const remotas = new Map(), cambios = [];
  for (const m of r.metas) { try { J.validarMeta(m); remotas.set(m.id, m); } catch {} }
  for (const p of personasLocales) if (!r.personas.some(x => x.id === p.id)) { cambios.push({table: 'personas', remove: true, id: p.id}); n++; }
  for (const p of r.personas) { const antes = personasLocales.find(x => x.id === p.id); if (canonical(antes) !== canonical(p)) { cambios.push({table: 'personas', data: p}); n++; } }
  for (const m of remotas.values()) {
    if (pendientes.has(m.id)) continue;
    cambios.push({table: 'sync', data: {id: 'metas:' + m.id, remoteVersion: m.version, lastData: m}});
    if (canonical(locales.get(m.id)) !== canonical(m)) { cambios.push({table: 'metas', data: m}); n++; }
  }
  // Tareas que ya no se ven (reasignadas a otro equipo o rechazadas): se quitan de este equipo.
  for (const id of locales.keys()) if (!remotas.has(id) && !pendientes.has(id)) { cambios.push({table: 'metas', remove: true, id}); n++; }
  await escribir(cambios);
  if (n) avisar('nube');
  return {cambios: n, perfil: r.perfil};
}
export async function avisosTareas() { return (await leer('sync')).filter(r => r.tipo === 'tarea').sort((a, b) => a.at.localeCompare(b.at)); }
export async function descartarAviso(id) { await escribir([{table: 'sync', remove: true, id}]); }
