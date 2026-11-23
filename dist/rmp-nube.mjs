// Pesos del RMP en la nube (Nube, tipo «rmp», id «rmp-pesos», supabase/rmp-pesos.sql): uno para la obra. Lo carga
// Planificación desde el escritorio; cada equipo con sesión lo baja y lo guarda para verlo sin señal. Nunca va en el
// repositorio: son datos de Sacyr. Sin el SQL aplicado, la Nube rechaza el tipo y ATLAS lo dice al cargar.
import {validarRMP, ID} from './rmp-model.mjs';
const CLAVE = 'atlas-rmp-pesos', SESION = 'atlas-nube-sesion';
const sesion = () => { try { return JSON.parse(localStorage.getItem(SESION) || 'null'); } catch { return null; } };
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } };
const avisar = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('atlas-rmp-pesos')); };
const guardar = v => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); return true; } catch { return false; } };

// Pesos vigentes en este equipo (null si nadie los ha cargado).
export function pesosRMP() { return typeof localStorage === 'undefined' ? null : leer()?.data || null; }

async function pedir(metodo, ruta, cuerpo) {
  const s = sesion(); if (!s?.token) { const e = Error('Inicia sesión en Atlas para usar los pesos del RMP.'); e.status = 401; throw e; }
  const r = await fetch(ruta, {method: metodo, cache: 'no-store', headers: {'x-campo-session': s.token, ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(datos.error || 'No se pudo conectar con la nube.'); e.status = r.status; e.data = datos; throw e; }
  return datos;
}

export async function refrescarRMPNube() {
  if (!sesion()?.token || !navigator.onLine) return false;
  const {registros} = await pedir('GET', '/api/campo?tipo=rmp');
  const r = (registros || []).find(x => x.tipo === 'rmp' && x.id === ID);
  let nuevo = null; if (r) try { nuevo = {version: r.version, data: validarRMP(r.data)}; } catch {}
  if (JSON.stringify(leer()) === JSON.stringify(nuevo)) return false;
  if (nuevo) guardar(nuevo); else localStorage.removeItem(CLAVE);
  avisar(); return true;
}

// registro: lo que devuelve leerPesosRMP; archivo: nombre de la planilla; por: firma de quien carga.
export async function guardarRMPNube(registro, {archivo = '', por}) {
  if (!String(por || '').trim()) throw Error('Inicia sesión en Atlas para cargar los pesos del RMP.');
  const data = validarRMP({...registro, archivo: String(archivo).slice(0, 200), cargada: new Date().toISOString(), por});
  let r;
  try { r = await pedir('POST', '/api/campo', {tipo: 'rmp', id: ID, version: leer()?.version || 0, data}); }
  catch (e) {
    if (e.status === 409) { await refrescarRMPNube().catch(() => {}); throw Error('Otro equipo cargó pesos del RMP hace un momento. Vuelve a cargar tu planilla.'); }
    if (e.status === 400 || e.status === 500) throw Error('La Nube aún no acepta los pesos del RMP: falta ejecutar supabase/rmp-pesos.sql en Supabase.');
    throw e;
  }
  guardar({version: r.version, data}); avisar();
  return r;
}
