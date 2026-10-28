// Almacenamiento local de observaciones en terreno: IndexedDB «atlas-observaciones» con observaciones, fotos e historial.
// Guardado atómico con versión esperada (no se sobrescribe lo guardado en otra pestaña) e historial que solo se agrega.
// Las fotos se guardan como bytes (ArrayBuffer), que IndexedDB conserva de forma fiable también en iPhone.
// Los datos son locales al equipo hasta que exista la base compartida: el respaldo JSON incluye las fotos.
import {validarObservacion, RESPALDO} from './observaciones-model.mjs';

const TABLAS = ['observaciones', 'fotos', 'historial'];
function abrir() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('atlas-observaciones', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('observaciones', {keyPath: 'id'}).createIndex('level', 'level');
      db.createObjectStore('fotos', {keyPath: 'id'}).createIndex('obsId', 'obsId');
      db.createObjectStore('historial', {keyPath: 'id'}).createIndex('obsId', 'obsId');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaccion(modo, tablas, run) {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(tablas, modo); let resultado, motivo;
      tx.oncomplete = () => resolve(resultado);
      tx.onabort = () => reject(motivo || tx.error || Error('No se pudo guardar la observación.'));
      run(Object.fromEntries(tablas.map(t => [t, tx.objectStore(t)])), v => { resultado = v; }, m => { motivo = Error(m); tx.abort(); });
    });
  } finally { db.close(); }
}
const avisar = () => window.dispatchEvent?.(new Event('atlas-observaciones-changed'));
const todos = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export function leerObservaciones(level) {
  return transaccion('readonly', ['observaciones'], async (s, listo) => { listo(await todos(level ? s.observaciones.index('level').getAll(level) : s.observaciones.getAll())); });
}
export function leerHistorial(obsId) {
  return transaccion('readonly', ['historial'], async (s, listo) => { listo((await todos(s.historial.index('obsId').getAll(obsId))).sort((a, b) => a.at.localeCompare(b.at))); });
}
export function leerFotos(obsId) {
  return transaccion('readonly', ['fotos'], async (s, listo) => { listo(await todos(s.fotos.index('obsId').getAll(obsId))); });
}

// Guarda la observación con sus fotos nuevas, fotos quitadas y entradas de historial en una sola transacción.
export async function guardarObservacion(obs, versionEsperada, {fotos = [], quitarFotos = [], historial = []} = {}) {
  validarObservacion(obs);
  if (obs.version !== versionEsperada + 1) throw Error('Versión inválida.');
  const referidas = new Set(obs.fotos.map(f => f.id));
  for (const f of fotos) if (!referidas.has(f.id) || f.obsId !== obs.id || !(f.datos instanceof ArrayBuffer)) throw Error('Foto sin referencia en la observación.');
  await transaccion('readwrite', TABLAS, (s, listo, abortar) => {
    s.observaciones.get(obs.id).onsuccess = e => {
      if ((e.target.result?.version || 0) !== versionEsperada) return abortar('La observación cambió en otra pestaña. Ciérrala y vuelve a abrirla antes de continuar.');
      s.observaciones.put(obs);
      for (const f of fotos) s.fotos.put(f);
      for (const id of quitarFotos) s.fotos.delete(id);
      for (const h of historial) s.historial.add(h);
      listo(obs);
    };
  });
  avisar();
  return obs;
}

// Espacio usado y disponible del navegador (las fotos son lo que más ocupa).
export async function espacio() {
  try { const {usage, quota} = await navigator.storage.estimate(); return {usado: usage || 0, total: quota || 0, persistente: await navigator.storage.persisted?.()}; } catch { return null; }
}
export async function pedirPersistencia() { try { return await navigator.storage?.persist?.(); } catch { return false; } }

const aBase64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const deBase64 = t => { const s = atob(t), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; };

// Respaldo JSON del piso (o de todo) con las fotos incluidas.
export async function exportarObservaciones(level) {
  const observaciones = await leerObservaciones(level), historial = [], fotos = [];
  for (const o of observaciones) { historial.push(...await leerHistorial(o.id)); for (const f of await leerFotos(o.id)) fotos.push({...f, datos: aBase64(f.datos), mini: aBase64(f.mini)}); }
  return {format: RESPALDO, at: new Date().toISOString(), level: level || null, observaciones, historial, fotos};
}
// Importación aditiva: agrega lo que no existe; si una observación existente difiere, no se importa nada.
export async function importarObservaciones(respaldo) {
  if (respaldo?.format !== RESPALDO || !Array.isArray(respaldo.observaciones) || !Array.isArray(respaldo.historial) || !Array.isArray(respaldo.fotos)) throw Error('Respaldo de observaciones inválido.');
  respaldo.observaciones.forEach(validarObservacion);
  if (new Set(respaldo.observaciones.map(o => o.id)).size !== respaldo.observaciones.length) throw Error('Observaciones repetidas en el respaldo.');
  const fotos = respaldo.fotos.map(f => ({...f, datos: deBase64(f.datos), mini: deBase64(f.mini)}));
  let nuevas = 0;
  await transaccion('readwrite', TABLAS, (s, listo, abortar) => {
    let pendientes = respaldo.observaciones.length;
    if (!pendientes) return listo(0);
    for (const o of respaldo.observaciones) s.observaciones.get(o.id).onsuccess = e => {
      const actual = e.target.result;
      if (actual && JSON.stringify(actual) !== JSON.stringify(o)) return abortar('El respaldo trae otra versión de una observación existente. No se importó nada.');
      if (!actual) { nuevas++; s.observaciones.add(o); for (const f of fotos.filter(f => f.obsId === o.id)) s.fotos.put(f); for (const h of respaldo.historial.filter(h => h.obsId === o.id)) s.historial.put(h); }
      if (--pendientes === 0) listo(nuevas);
    };
  });
  avisar();
  return nuevas;
}
