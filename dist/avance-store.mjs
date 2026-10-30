// Avance por partida: registros por recinto (clave piso|código) con historial append-only.
// El itemizado con precios ya no se usa en la plataforma: borrarItemizado quita la copia que quedara en el equipo.
import {keyFor} from './avance-model.mjs';
const DB = 'atlas-avance-partidas';
const abrir = () => new Promise((resolve, reject) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => { q.result.createObjectStore('rooms', {keyPath: 'key'}); q.result.createObjectStore('history', {keyPath: 'id'}); q.result.createObjectStore('fuentes', {keyPath: 'id'}); };
  q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
});
async function conDb(tablas, modo, fn) {
  const db = await abrir();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction(tablas, modo); let salida, error; Promise.resolve(fn(tx, v => { salida = v; }, e => { error = e; tx.abort(); })).catch(e => { error = e; tx.abort(); }); tx.oncomplete = () => resolve(salida); tx.onabort = () => reject(error || tx.error || Error('Operación cancelada')); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
const leerTodo = (tx, tabla) => new Promise((resolve, reject) => { const q = tx.objectStore(tabla).getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
const avisar = () => typeof window !== 'undefined' && window.dispatchEvent(new Event('atlas-avance-changed'));

export async function leerAvance() { return conDb(['rooms', 'history'], 'readonly', async (tx, ok) => { const [registros, historial] = await Promise.all([leerTodo(tx, 'rooms'), leerTodo(tx, 'history')]); ok({registros, historial}); }); }

// Guardado atómico con versión esperada: evita sobrescribir lo guardado en otra pestaña.
export async function guardarAvance(registro, versionEsperada) {
  if (registro.key !== keyFor(registro.code, registro.level) || registro.version !== versionEsperada + 1) throw Error('Versión inválida');
  await conDb(['rooms', 'history'], 'readwrite', (tx, ok, falla) => {
    const q = tx.objectStore('rooms').get(registro.key);
    q.onsuccess = () => {
      if ((q.result?.version || 0) !== versionEsperada) return falla(Error('El recinto cambió en otra pestaña o dispositivo. Vuelve a abrir la ficha antes de guardar.'));
      tx.objectStore('rooms').put(registro); tx.objectStore('history').add({id: crypto.randomUUID(), registro}); ok();
    };
  });
  avisar();
}

export async function exportarAvance() { return {format: 'atlas-avance-partidas-v1', at: new Date().toISOString(), ...await leerAvance()}; }
// Importación aditiva: agrega lo nuevo y rechaza todo si un registro existente difiere (no se fusionan ediciones divergentes).
export async function importarAvance(valor) {
  if (valor?.format !== 'atlas-avance-partidas-v1' || !Array.isArray(valor.registros) || !Array.isArray(valor.historial)) throw Error('Respaldo de avance no válido.');
  for (const r of valor.registros) if (r?.key !== keyFor(r?.code, r?.level) || !Number.isInteger(r.version)) throw Error('Registro de avance no válido en el respaldo.');
  for (const h of valor.historial) if (typeof h?.id !== 'string' || h.registro?.key !== keyFor(h.registro?.code, h.registro?.level)) throw Error('Historial no válido en el respaldo.');
  let conflicto = false;
  try {
    await conDb(['rooms', 'history'], 'readwrite', (tx, ok, falla) => {
      for (const [tabla, lista, id] of [['rooms', valor.registros, 'key'], ['history', valor.historial, 'id']]) for (const item of lista) {
        const q = tx.objectStore(tabla).get(item[id]);
        q.onsuccess = () => { if (q.result && JSON.stringify(q.result) !== JSON.stringify(item)) { conflicto = true; return falla(Error('conflicto')); } if (!q.result) tx.objectStore(tabla).add(item); };
      }
      ok();
    });
  } catch (e) { throw conflicto ? Error('Hay registros diferentes en este dispositivo. No se importó nada.') : e; }
  avisar();
}

// Itemizado: se guardan las partidas ya interpretadas, no el Excel.
export async function guardarItemizado({nombre, hoja, items}) {
  await conDb(['fuentes'], 'readwrite', (tx, ok) => { tx.objectStore('fuentes').put({id: 'itemizado', nombre, hoja, fecha: new Date().toISOString(), items: [...items.values()]}); ok(); });
  avisar();
}
export async function leerItemizadoGuardado() {
  const f = await conDb(['fuentes'], 'readonly', (tx, ok) => { const q = tx.objectStore('fuentes').get('itemizado'); q.onsuccess = () => ok(q.result || null); });
  return f ? {...f, items: new Map(f.items.map(i => [i.code, i]))} : null;
}
export async function borrarItemizado() { await conDb(['fuentes'], 'readwrite', (tx, ok) => { tx.objectStore('fuentes').delete('itemizado'); ok(); }); avisar(); }
