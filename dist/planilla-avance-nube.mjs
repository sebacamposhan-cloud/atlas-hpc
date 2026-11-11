// Avance de las planillas de la oficina en la nube (Nube, tipo «planilla»): un registro por piso con el % de cada
// recinto y partida. Se carga desde el escritorio (avance.mjs) y cada equipo con sesión lo baja y lo deja guardado para
// trabajar sin señal. El avance del rombo lo toma como base (avance-model.mjs · aplicarPlanilla).
import {validarPlanilla, compararPlanillas} from './planilla-avance-model.mjs';
const CLAVE = 'atlas-planillas-avance', SESION = 'atlas-nube-sesion';
const leerCache = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; } };
const sesion = () => { try { return JSON.parse(localStorage.getItem(SESION) || 'null'); } catch { return null; } };
export const idPlanilla = nivel => 'avance-' + nivel;
const avisar = () => { if (typeof window === 'undefined') return; window.dispatchEvent(new CustomEvent('atlas-planilla-avance')); window.dispatchEvent(new Event('atlas-avance-changed')); };

// Planilla vigente de un piso en este equipo (null si no se ha cargado ninguna).
export function planillaDe(nivel) { return typeof localStorage === 'undefined' ? null : leerCache()[nivel]?.data || null; }

async function pedir(metodo, ruta, cuerpo) {
  const s = sesion(); if (!s?.token) { const e = Error('Inicia sesión en Atlas para cargar la planilla.'); e.status = 401; throw e; }
  const r = await fetch(ruta, {method: metodo, cache: 'no-store', headers: {'x-campo-session': s.token, ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(datos.error || 'No se pudo conectar con la nube.'); e.status = r.status; e.data = datos; throw e; }
  return datos;
}
const guardarCache = cache => { try { localStorage.setItem(CLAVE, JSON.stringify(cache)); return true; } catch { return false; } };

// Baja las planillas de todos los pisos; avisa si cambió algo.
export async function refrescarPlanillasNube() {
  if (!sesion()?.token || !navigator.onLine) return false;
  const {registros} = await pedir('GET', '/api/campo?tipo=planilla');
  const nuevo = {};
  for (const r of registros || []) { if (r.tipo !== 'planilla' || r.id !== idPlanilla(r.data?.nivel)) continue; try { nuevo[r.data.nivel] = {version: r.version, data: validarPlanilla(r.data)}; } catch {} }
  const antes = localStorage.getItem(CLAVE), despues = JSON.stringify(nuevo);
  if (antes === despues) return false;
  if (!guardarCache(nuevo)) return false;
  avisar();
  return true;
}

// Guarda la planilla leída de un piso. «resumen» deja anotado cuántos recintos cambiaron respecto de la carga anterior.
export async function guardarPlanillaNube(planilla, {por, cargada = new Date().toISOString()} = {}) {
  const cache = leerCache(), actual = cache[planilla.nivel];
  const cambios = compararPlanillas(actual?.data, planilla);
  const data = validarPlanilla({...planilla, cargada, por: String(por || '').trim(), resumen: {anterior: actual?.data?.cargada || null, cambios: cambios.length, recintos: new Set(cambios.map(c => c.code)).size,
    // Detalle compacto de lo que cambió (código, partida, antes, después) para mostrar el avance desde la carga anterior.
    detalle: cambios.slice(0, 4000).map(c => [c.code, c.familia, c.antes, c.despues])}});
  let r;
  try { r = await pedir('POST', '/api/campo', {tipo: 'planilla', id: idPlanilla(planilla.nivel), version: actual?.version || 0, data}); }
  catch (e) {
    // Otro equipo cargó una planilla mientras tanto: se baja la suya para comparar de nuevo antes de reemplazarla.
    if (e.status === 409) { await refrescarPlanillasNube().catch(() => {}); throw Error('Otro equipo cargó una planilla de este piso hace un momento. Vuelve a elegir el archivo para compararlo con esa carga.'); }
    throw e;
  }
  cache[planilla.nivel] = {version: r.version, data};
  guardarCache(cache);
  avisar();
  return {version: r.version, cambios};
}
