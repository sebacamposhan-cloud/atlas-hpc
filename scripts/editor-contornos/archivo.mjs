// Archivo de contornos corregidos de un piso: dist/<datos>contornos.json. Lo escribe el editor y lo aplica geometry-authority.mjs.
import {errorPartes, enPartes, areaM2} from './geometria.mjs';
export const FORMATO = 'atlas-contornos-v1';
// datos: carpeta del piso en dist/ (como en pisos.js); dwg: carpeta de data/ con barreras.json y marco.json.
export const NIVELES = {'N-1': {datos: '', dwg: 's01', nombre: 'Nivel −1'}, N01: {datos: 'n01/', dwg: 'n01', nombre: 'Nivel 1'}, N02: {datos: 'n02/', dwg: 'n02', nombre: 'Nivel 2'}, N03: {datos: 'n03/', dwg: 'n03', nombre: 'Nivel 3'}};
export const vacio = nivel => ({format: FORMATO, nivel, unidad: '1 unidad del plano = 1,7639 cm', recintos: []});

const r2 = v => Math.round(v * 100) / 100;
export const redondear = parts => parts.map(p => ({polygon: p.polygon.map(q => [r2(q[0]), r2(q[1])]), holes: p.holes.map(h => h.map(q => [r2(q[0]), r2(q[1])]))}));
// Un recinto por línea, ordenados por código, para que los cambios se lean bien en git.
export function serializar(archivo) {
  const recintos = [...archivo.recintos].sort((a, b) => a.code.localeCompare(b.code, 'es', {numeric: true}) || a.id.localeCompare(b.id));
  const cabeza = JSON.stringify({...archivo, recintos: []}).replace(/\[\]\}$/, '[');
  return cabeza + (recintos.length ? '\n' + recintos.map(r => JSON.stringify(r)).join(',\n') + '\n' : '') + ']}\n';
}

// Posición del rótulo en el plano: las láminas del −1 llevan su traslación (atlas.tiles).
export function posicionPlano(r, atlas) { const t = atlas.tiles.find(t => t.id === r.document_id), o = t?.offset || [0, 0]; return [r.position[0] + o[0], r.position[1] + o[1]]; }

export function validar(archivo, {nivel, rooms, atlas, map}) {
  const errores = [], vistos = new Set(), porId = new Map(rooms.map(r => [r.id, r]));
  if (archivo?.format !== FORMATO) return ['Formato desconocido: se espera ' + FORMATO + '.'];
  if (archivo.nivel !== nivel) errores.push('El archivo es del piso ' + archivo.nivel + ', no de ' + nivel + '.');
  if (!Array.isArray(archivo.recintos)) return [...errores, 'Falta la lista de recintos.'];
  const [x0, y0] = map.origin, x1 = x0 + map.width, y1 = y0 + map.height;
  for (const c of archivo.recintos) {
    const r = porId.get(c.id), nombre = c.code || c.id;
    if (!r) { errores.push(nombre + ': el recinto no existe en este piso.'); continue; }
    if (r.code !== c.code) errores.push(nombre + ': el código no coincide con el recinto (' + r.code + ').');
    if (vistos.has(c.id)) errores.push(nombre + ': está repetido.'); vistos.add(c.id);
    if (!Array.isArray(c.parts)) { errores.push(nombre + ': falta el contorno.'); continue; }
    const e = errorPartes(c.parts); if (e) { errores.push(nombre + ': ' + e); continue; }
    if (c.parts.some(p => [p.polygon, ...p.holes].some(a => a.some(q => q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1)))) errores.push(nombre + ': el contorno sale del plano.');
    if (!c.rotuloFuera && !enPartes(posicionPlano(r, atlas), c.parts)) errores.push(nombre + ': el rótulo del recinto quedó fuera del contorno. Si es correcto (rótulo con línea guía), márcalo como «rótulo fuera».');
    if (typeof c.area_m2 === 'number' && Math.abs(c.area_m2 - areaM2(c.parts)) > .05) errores.push(nombre + ': el área guardada no coincide con el contorno.');
  }
  return errores;
}
