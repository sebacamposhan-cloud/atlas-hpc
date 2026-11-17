// Programa de obra en la nube (Nube, tipo «programa»): un registro por piso con sus tareas, la revisión cargada y las
// ventanas por sector de Planificación (supabase/programa-obra.sql). Se carga desde el escritorio y cada equipo con sesión
// lo baja y lo deja guardado para consultarlo sin señal. Nunca va en el repositorio: es un documento de Sacyr.
import {validarPrograma, compararProgramas, conVentanasPrevias, idPrograma, validarVentanas} from './programa-obra-model.mjs';
const CLAVE = 'atlas-programa-obra', SESION = 'atlas-nube-sesion';
const leerCache = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; } };
const sesion = () => { try { return JSON.parse(localStorage.getItem(SESION) || 'null'); } catch { return null; } };
const avisar = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('atlas-programa-obra')); };
const guardarCache = cache => { try { localStorage.setItem(CLAVE, JSON.stringify(cache)); return true; } catch { return false; } };

// Programa vigente de un piso en este equipo (null si no se ha cargado).
export function programaDe(nivel) { return typeof localStorage === 'undefined' ? null : leerCache()[nivel]?.data || null; }
export const pisosConPrograma = () => Object.keys(leerCache());

async function pedir(metodo, ruta, cuerpo) {
  const s = sesion(); if (!s?.token) { const e = Error('Inicia sesión en Atlas para guardar el programa.'); e.status = 401; throw e; }
  const r = await fetch(ruta, {method: metodo, cache: 'no-store', headers: {'x-campo-session': s.token, ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(datos.error || 'No se pudo conectar con la nube.'); e.status = r.status; e.data = datos; throw e; }
  return datos;
}

// Baja el programa de todos los pisos; avisa si cambió algo.
export async function refrescarProgramaNube() {
  if (!sesion()?.token || !navigator.onLine) return false;
  const {registros} = await pedir('GET', '/api/campo?tipo=programa');
  const nuevo = {};
  for (const r of registros || []) { if (r.tipo !== 'programa' || r.id !== idPrograma(r.data?.nivel)) continue; try { nuevo[r.data.nivel] = {version: r.version, data: validarPrograma(r.data)}; } catch {} }
  if (localStorage.getItem(CLAVE) === JSON.stringify(nuevo) || !guardarCache(nuevo)) return false;
  avisar();
  return true;
}

async function subir(nivel, data) {
  const cache = leerCache(), actual = cache[nivel];
  let r;
  try { r = await pedir('POST', '/api/campo', {tipo: 'programa', id: idPrograma(nivel), version: actual?.version || 0, data}); }
  catch (e) {
    // Otro equipo guardó el programa de este piso mientras tanto: se baja el suyo antes de volver a intentar.
    if (e.status === 409) { await refrescarProgramaNube().catch(() => {}); throw Error('Otro equipo guardó el programa de ' + nivel + ' hace un momento. Vuelve a intentarlo para compararlo con esa versión.'); }
    throw e;
  }
  const despues = leerCache(); despues[nivel] = {version: r.version, data}; guardarCache(despues);
  return r;
}

// Guarda la revisión leída para cada piso. Conserva las ventanas por sector de las partidas que siguen y anota qué cambió.
export async function guardarProgramaNube(pisos, {por, cargada = new Date().toISOString()} = {}) {
  if (!String(por || '').trim()) throw Error('Inicia sesión en Atlas para guardar el programa.');
  const resultado = [];
  for (const p of Object.values(pisos)) {
    const anterior = programaDe(p.nivel), cambios = compararProgramas(anterior, p);
    const data = validarPrograma(conVentanasPrevias({...p, cargada, por: String(por).trim(), resumen: {anterior: anterior?.revision || null, cambios: cambios.length, detalle: cambios.slice(0, 500)}}, anterior));
    await subir(p.nivel, data);
    resultado.push({nivel: p.nivel, tareas: p.tareas.length, cambios});
  }
  avisar();
  return resultado;
}

// Ventanas por sector de una partida (o null para volver al reparto propuesto por Atlas).
export async function guardarVentanasNube(nivel, codigo, ventanas, {por, at = new Date().toISOString()} = {}) {
  const actual = programaDe(nivel); if (!actual) throw Error('Este piso aún no tiene programa cargado.');
  if (!actual.tareas.some(t => t.codigo === codigo)) throw Error('La partida ' + codigo + ' no está en el programa del piso.');
  if (!String(por || '').trim()) throw Error('Inicia sesión en Atlas para guardar las ventanas.');
  const resto = {...(actual.ventanas || {})};
  if (ventanas) resto[codigo] = validarVentanas({orden: ventanas.orden || ventanas.sectores.map(s => s.sector), sectores: ventanas.sectores.map(({sector, inicio, fin}) => ({sector, inicio, fin})), por: String(por).trim(), at}, codigo);
  else delete resto[codigo];
  const data = validarPrograma({...actual, ventanas: resto});
  await subir(nivel, data);
  avisar();
  return data;
}
