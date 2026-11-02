// Contornos corregidos en la nube (Nube, tipo «contorno»): el editor de contornos los guarda recinto por recinto y la app
// los aplica sobre los de dist/<piso>/contornos.json (manda el de la nube del mismo código). Quedan en este equipo para
// abrir el plano sin señal y se refrescan con la sesión de Nube iniciada.
const CLAVE = 'atlas-contornos-nube', SESION = 'atlas-nube-sesion';
const leerCache = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; } };
const sesion = () => { try { return JSON.parse(localStorage.getItem(SESION) || 'null'); } catch { return null; } };
// Id del registro: piso y código en base64url (los códigos llevan puntos y paréntesis).
export const idContorno = (nivel, code) => nivel.replace(/[^A-Za-z0-9]/g, '') + '-' + btoa(unescape(encodeURIComponent(code))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Correcciones de la nube de un piso: {code: {recinto | eliminado, version}}.
export function contornosNube(nivel) { return leerCache()[nivel] || {}; }
// Correcciones del archivo del piso con las de la nube encima (una corrección «eliminada» vuelve al contorno original).
export function combinarContornos(archivo, nivel) {
  const nube = contornosNube(nivel), porCodigo = new Map(archivo.map(c => [c.code, c]));
  for (const [code, v] of Object.entries(nube)) { if (v.eliminado) porCodigo.delete(code); else if (v.recinto) porCodigo.set(code, v.recinto); }
  return [...porCodigo.values()];
}

async function pedir(metodo, ruta, cuerpo) {
  const s = sesion(); if (!s?.token) { const e = Error('Entra en Nube con tu cuenta para guardar contornos.'); e.status = 401; throw e; }
  const r = await fetch(ruta, {method: metodo, cache: 'no-store', headers: {'x-campo-session': s.token, ...(cuerpo ? {'Content-Type': 'application/json'} : {})}, ...(cuerpo ? {body: JSON.stringify(cuerpo)} : {})});
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { const e = Error(datos.error || 'No se pudo conectar con la nube.'); e.status = r.status; e.data = datos; throw e; }
  return datos;
}
// Baja todos los contornos de la nube; avisa si cambió algo («atlas-contornos-nube»).
export async function refrescarContornosNube() {
  if (!sesion()?.token || !navigator.onLine) return false;
  const {registros} = await pedir('GET', '/api/campo?tipo=contorno');
  const nuevo = {};
  for (const r of registros || []) { if (r.tipo !== 'contorno' || !r.data?.nivel || !r.data?.code) continue; (nuevo[r.data.nivel] ||= {})[r.data.code] = {version: r.version, ...(r.data.eliminado ? {eliminado: true} : {recinto: r.data.recinto}), por: r.updated_by || null, at: r.updated_at || null}; }
  const antes = localStorage.getItem(CLAVE), despues = JSON.stringify(nuevo);
  if (antes === despues) return false;
  try { localStorage.setItem(CLAVE, despues); } catch {}
  window.dispatchEvent(new CustomEvent('atlas-contornos-nube'));
  return true;
}
// Guarda una corrección (o su eliminación, para volver al contorno original) con control de versión.
export async function guardarContornoNube(nivel, code, recinto) {
  const cache = leerCache(), actual = cache[nivel]?.[code], id = idContorno(nivel, code);
  const data = recinto ? {nivel, code, recinto} : {nivel, code, eliminado: true};
  const r = await pedir('POST', '/api/campo', {tipo: 'contorno', id, version: actual?.version || 0, data});
  (cache[nivel] ||= {})[code] = {version: r.version, ...(recinto ? {recinto} : {eliminado: true}), por: r.updated_by || null, at: r.updated_at || null};
  try { localStorage.setItem(CLAVE, JSON.stringify(cache)); } catch {}
  window.dispatchEvent(new CustomEvent('atlas-contornos-nube'));
  return r;
}
