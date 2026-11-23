// Corta en el contorno grande el hueco de un recinto chico que queda dentro de él (solape grave), para que la
// circulación o la sala de espera no cubra al mesón, la estación de enfermería o la sala que está adentro.
// Sirve para cualquier piso: lee la misma geometría que el visor (runtime.json + contornos.json de la carpeta del piso)
// y escribe el contorno corregido del recinto grande en ese contornos.json, con su m² y una nota del motivo.
//
// Uso: node scripts/contornos/cortar-solapes.mjs <carpeta-piso> [--escribir]
//   <carpeta-piso>: «.» para el −1 (dist/), «n01», «n02», … Sin --escribir solo informa.
//
// Grave: la parte del recinto chico que cae dentro del grande es el 15 % o más del chico. El hueco es esa parte
// (recorte de Sutherland–Hodgman del contorno grande contra el chico), un poco hacia adentro para que quede dentro del
// contorno exterior. Si el recinto chico no es convexo, el recorte no es exacto y el par se informa sin cortar.
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const [carpeta = '.', ...banderas] = process.argv.slice(2);
const escribir = banderas.includes('--escribir');
const imp = p => import(pathToFileURL(join(dist, p)).href);
const {resolveFootprints, roomAliases, geometryLabels} = await imp('geometry-authority.mjs');
const {decodeRuntime} = await imp('runtime-loader.mjs');
const {quitarObraComplementaria} = await imp('obra-complementaria.mjs');
const {inside} = await imp('engine.mjs');
const {validateParts} = await imp('contour-geometry.mjs');
// Mismo formato y cálculo de m² que el editor de contornos (contornos-test.mjs lo exige).
const {redondear, serializar, validar} = await imp('editor-contornos/archivo.mjs');
const {areaM2} = await imp('editor-contornos/geometria.mjs');

export const GRAVE = .15;
// Área con signo (fórmula de Gauss): positiva si el anillo gira en sentido antihorario en ejes x→, y↑.
const area = ring => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return a / 2; };
const caja = ring => [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];
const cruzan = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// Convexo: todos los giros del mismo signo (se ignoran vértices casi alineados).
function convexo(ring) {
  let signo = 0;
  for (let i = 0; i < ring.length; i++) {
    const [a, b, c] = [ring[i], ring[(i + 1) % ring.length], ring[(i + 2) % ring.length]];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-6) continue;
    if (signo && Math.sign(z) !== signo) return false;
    signo = Math.sign(z);
  }
  return true;
}
// Sutherland–Hodgman: recorta «sujeto» (cualquier polígono) con «recorte» (convexo).
function recortar(sujeto, recorte) {
  const orient = Math.sign(area(recorte)) || 1;
  const dentro = (p, a, b) => orient * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
  const cruce = (p, q, a, b) => { const [x1, y1] = p, [x2, y2] = q, [x3, y3] = a, [x4, y4] = b; const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (!d) return q; const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d; return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]; };
  let salida = sujeto;
  for (let i = 0; i < recorte.length && salida.length; i++) {
    const a = recorte[i], b = recorte[(i + 1) % recorte.length], entrada = salida; salida = [];
    for (let j = 0; j < entrada.length; j++) {
      const p = entrada[j], q = entrada[(j + 1) % entrada.length];
      if (dentro(q, a, b)) { if (!dentro(p, a, b)) salida.push(cruce(p, q, a, b)); salida.push(q); }
      else if (dentro(p, a, b)) salida.push(cruce(p, q, a, b));
    }
  }
  // Sin vértices repetidos.
  return salida.filter((p, i) => { const q = salida[(i + 1) % salida.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3; });
}
// Hueco un poco hacia adentro (hacia su centro), para que no toque el contorno exterior.
const adentro = (ring, d = .6) => { const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length; return ring.map(([x, y]) => { const l = Math.hypot(x - cx, y - cy) || 1; return [+(x - (x - cx) * Math.min(d / l, .5)).toFixed(2), +(y - (y - cy) * Math.min(d / l, .5)).toFixed(2)]; }); };

const dir = join(dist, carpeta);
const {atlas, data, selection} = decodeRuntime(JSON.parse(await readFile(join(dir, 'runtime.json'), 'utf8')));
const piso = data.rooms[0]?.level, nivel = piso === '-1' ? 'N-1' : 'N' + String(piso).padStart(2, '0');
quitarObraComplementaria(data, nivel, atlas);
const offsets = new Map(atlas.tiles.map(t => [t.id, t.offset]));
const posicion = r => r.position.map((v, a) => v + offsets.get(r.document_id)[a]);
const aliases = roomAliases(data.rooms, posicion);
const [L, T, W, H] = atlas.scope.bounds;
const porId = new Map(data.rooms.map(r => [r.id, r])), elegidos = new Map();
for (const r of data.rooms) { const [x, y] = posicion(r); if (x >= L && x <= L + W && y >= T && y <= T + H) { const id = aliases.get(r.id) ?? r.id; elegidos.set(id, porId.get(id)); } }
const rutaContornos = join(dir, 'contornos.json');
let contornos = {format: 'atlas-contornos-v1', nivel, unidad: '1 unidad del plano = 1,7639 cm', recintos: []};
try { contornos = JSON.parse(await readFile(rutaContornos, 'utf8')); } catch {}
const geometria = resolveFootprints(atlas, [...elegidos.values()], aliases, selection, contornos.recintos ?? []);

// Parte del recinto a que cae dentro de b, con una grilla de 24 × 24 sobre su caja.
function parteDentro(a, b) {
  let n = 0, m = 0;
  for (const ra of a.rings) {
    const [l, t, r, d] = caja(ra.polygon);
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      const p = [l + (r - l) * (i + .5) / 24, t + (d - t) * (j + .5) / 24];
      if (!inside(p, ra.polygon) || (ra.holes || []).some(h => inside(p, h))) continue;
      m++; if (b.rings.some(rb => inside(p, rb.polygon) && !(rb.holes || []).some(h => inside(p, h)))) n++;
    }
  }
  return m ? n / m : 0;
}
const areaDe = g => g.rings.reduce((s, r) => s + Math.abs(area(r.polygon)) - (r.holes || []).reduce((h, x) => h + Math.abs(area(x)), 0), 0);
const lista = [...geometria.values()].map(g => ({g, caja: caja(g.rings.flatMap(r => r.polygon)), area: areaDe(g)}));
const informe = [], cambios = new Map();
for (const a of lista) for (const b of lista) {
  if (a === b || a.area >= b.area || !cruzan(a.caja, b.caja)) continue;
  const parte = parteDentro(a.g, b.g); if (parte < GRAVE) continue;
  const chico = elegidos.get(a.g.id), grande = elegidos.get(b.g.id);
  const fila = {chico: chico.code + ' ' + chico.name, grande: grande.code + ' ' + grande.name, parte: +(100 * parte).toFixed(1)};
  if (a.g.rings.length !== 1) { informe.push({...fila, resultado: 'sin cortar: el recinto chico tiene varias partes'}); continue; }
  const forma = a.g.rings[0].polygon, esConvexo = convexo(forma);
  const destino = cambios.get(b.g.id) || structuredClone(b.g.rings);
  let cortado = false;
  for (const ring of destino) {
    // Convexo: el hueco es la parte compartida. No convexo: solo si el recinto chico queda entero dentro (hueco = él mismo).
    const hueco = esConvexo ? recortar(ring.polygon, forma) : adentro(forma).every(p => inside(p, ring.polygon)) ? forma : [];
    if (!esConvexo && !hueco.length) continue;
    if (hueco.length < 3 || Math.abs(area(hueco)) < 1) continue;
    if (Math.abs(area(hueco)) > .9 * Math.abs(area(ring.polygon))) { informe.push({...fila, resultado: 'sin cortar: el hueco sería casi todo el recinto grande'}); continue; }
    const h = adentro(hueco);
    if (!h.every(p => inside(p, ring.polygon))) { informe.push({...fila, resultado: 'sin cortar: el hueco no queda dentro del contorno'}); continue; }
    // Cada hueco se valida antes de quedarse: si toca a otro hueco o al borde, se informa y no se corta.
    const antes = ring.holes || [];
    ring.holes = [...antes, h];
    try { validateParts(destino, Infinity, Infinity); cortado = true; }
    catch (e) { ring.holes = antes; informe.push({...fila, resultado: 'sin cortar: ' + e.message.toLowerCase()}); }
  }
  if (cortado) { cambios.set(b.g.id, destino); informe.push({...fila, resultado: 'hueco cortado'}); }
  else if (!esConvexo) informe.push({...fila, resultado: 'sin cortar: no convexo y no queda entero dentro; ajustar vértices en el editor'});
  else informe.push({...fila, resultado: 'sin cortar: sin parte compartida medible'});
}

const ahora = new Date().toISOString();
for (const [id, rings] of cambios) {
  const r = elegidos.get(id), g = geometria.get(id);
  validateParts(rings, Infinity, Infinity);
  const parts = redondear(rings.map(x => ({polygon: x.polygon, holes: x.holes || []})));
  const entrada = {id, code: r.code, parts, area_m2: +areaM2(parts).toFixed(2), antes: geometryLabels[g.quality] || g.quality, fecha: ahora,
    nota: 'Hueco de los recintos que tiene adentro (solape), scripts/contornos/cortar-solapes.mjs'};
  contornos.recintos = [...(contornos.recintos || []).filter(c => !(c.id === id && c.code === r.code)), entrada];
}
console.log(JSON.stringify({piso: nivel, graves: informe.length, cortados: cambios.size, informe}, null, 1));
if (escribir && cambios.size) {
  const mapa = JSON.parse(await readFile(join(dir, 'map', 'index.json'), 'utf8'));
  const errores = validar(contornos, {nivel, rooms: data.rooms, atlas, map: mapa});
  if (errores.length) { console.error('No se escribe: ' + errores.join(' | ')); process.exit(1); }
  await writeFile(rutaContornos, serializar(contornos));
  console.log('Escrito', rutaContornos);
}
