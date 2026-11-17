// Cielos de un piso desde sus láminas CIE (cielo reflejado, DWG): tipo de cielo y altura NCT de cada recinto.
// Uso: node scripts/cielos/extraer-cie.mjs <carpeta de libredwg-web> <carpeta con los DWG CIE del piso> <piso> <datos>
//   ejemplo: node scripts/cielos/extraer-cie.mjs %TEMP%\atlas-tools\libredwg "...\N02" N02 n02/
// Escribe dist/<datos>cielos.json. No toca el plano ni los recintos de Atlas.
//
// Cómo se lee una lámina CIE:
// - Capa A-AREA-IDEN: rótulo de cada recinto (código, nombre, m²) y la etiqueta del tipo de cielo (201, 209…, dentro
//   de un recuadro), que va en el cielo y no siempre junto al rótulo del recinto.
// - Capa A-CLNG-IDEN: altura de cielo «NCT 2,80 m».
// - Los muros vienen por referencia externa, así que la lámina se ubica sobre el plano de Atlas con los códigos de
//   recinto: se ajusta una semejanza (escala, giro y traslado) entre la posición del rótulo en la lámina y la del
//   recinto en Atlas, descartando los que no calzan. Cada etiqueta de cielo y de NCT se asigna al recinto que la
//   contiene; si cae justo en un borde, al más cercano a menos de 0,6 m.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';
import {resolveFootprints} from '../../dist/geometry-authority.mjs';

const [herramienta, carpeta, piso, datos = ''] = process.argv.slice(2);
if (!herramienta || !carpeta || !piso) { console.error('Uso: extraer-cie.mjs <libredwg> <carpeta DWG> <piso> <datos>'); process.exit(1); }
const raiz = new URL('../../dist/' + datos, import.meta.url);
const {Dwg_File_Type, LibreDwg} = await import(pathToFileURL(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js')).href);
const libredwg = await LibreDwg.create(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/wasm/') + path.sep);

// Recintos de Atlas en coordenadas del plano (las mismas que usa el visor), con su contorno.
const rt = decodeRuntime(JSON.parse(fs.readFileSync(new URL('runtime.json', raiz))));
const rooms = rt.data.rooms, offsets = new Map(rt.atlas.tiles.map(t => [t.id, t.offset]));
const posicion = r => r.position.map((v, i) => v + (offsets.get(r.document_id)?.[i] || 0));
const alias = new Map(), puestos = new Map();
for (const r of [...rooms].sort((a, b) => Number(b.has_polygon) - Number(a.has_polygon))) {
  const p = posicion(r), k = r.code + '|' + r.name, c = puestos.get(k) || [], igual = c.find(v => Math.hypot(p[0] - v.p[0], p[1] - v.p[1]) < 5);
  if (igual) alias.set(r.id, igual.id); else { c.push({id: r.id, p}); puestos.set(k, c); }
}
let correcciones = [];
try { correcciones = JSON.parse(fs.readFileSync(new URL('contornos.json', raiz))).recintos || []; } catch {}
const huellas = resolveFootprints(rt.atlas, rooms, alias, rt.selection, correcciones);
const porId = new Map(rooms.map(r => [r.id, r]));
const recintos = [...huellas.values()].map(g => ({id: g.id, code: porId.get(g.id)?.code, anillos: (g.rings || []).map(a => [a.polygon, ...(a.holes || [])])})).filter(r => r.code);
const porCodigo = new Map();
for (const r of rooms) { if (!r.code) continue; const l = porCodigo.get(r.code) || []; l.push(posicion(r)); porCodigo.set(r.code, l); }

const limpio = t => String(t || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim();
const esCodigoRecinto = t => /^[0-9A-Z]+(\.[0-9A-Z]+)*-\d+[a-z]?$/i.test(t) && /[.]/.test(t);
const esCielo = t => /^2\d\d$/.test(t);
const nct = t => { const m = t.match(/^NCT\s*([\d]+[,.]\d+)\s*m/i); return m ? Number(m[1].replace(',', '.')) : null; };

// Semejanza por mínimos cuadrados (Umeyama sin reflexión) entre puntos de la lámina y de Atlas.
function semejanza(pares) {
  const n = pares.length, ma = [0, 0], mb = [0, 0];
  for (const [a, b] of pares) { ma[0] += a[0] / n; ma[1] += a[1] / n; mb[0] += b[0] / n; mb[1] += b[1] / n; }
  let sxx = 0, sxy = 0, va = 0;
  for (const [a, b] of pares) { const ax = a[0] - ma[0], ay = a[1] - ma[1], bx = b[0] - mb[0], by = b[1] - mb[1]; sxx += ax * bx + ay * by; sxy += ax * by - ay * bx; va += ax * ax + ay * ay; }
  const ang = Math.atan2(sxy, sxx), s = Math.hypot(sxx, sxy) / va, c = Math.cos(ang) * s, d = Math.sin(ang) * s;
  return {c, d, tx: mb[0] - (c * ma[0] - d * ma[1]), ty: mb[1] - (d * ma[0] + c * ma[1]), escala: s, giro: ang * 180 / Math.PI};
}
const aplicar = (t, p) => [t.c * p[0] - t.d * p[1] + t.tx, t.d * p[0] + t.c * p[1] + t.ty];
const dentro = (pt, anillo) => { let ok = false; for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) { const [xi, yi] = anillo[i], [xj, yj] = anillo[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ok = !ok; } return ok; };
const contiene = (r, pt) => r.anillos.some(([ext, ...huecos]) => dentro(pt, ext) && !huecos.some(h => dentro(pt, h)));
const distBorde = (r, pt) => { let m = Infinity; for (const a of r.anillos) for (const anillo of a) for (let i = 0; i < anillo.length; i++) { const p = anillo[i], q = anillo[(i + 1) % anillo.length], dx = q[0] - p[0], dy = q[1] - p[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((pt[0] - p[0]) * dx + (pt[1] - p[1]) * dy) / l)); m = Math.min(m, Math.hypot(pt[0] - p[0] - t * dx, pt[1] - p[1] - t * dy)); } return m; };

const resultado = new Map(), laminas = [], sinRecinto = [];
for (const archivo of fs.readdirSync(carpeta).filter(f => /\.dwg$/i.test(f)).sort()) {
  const bytes = fs.readFileSync(path.join(carpeta, archivo)), lamina = (archivo.match(/A-(\d{3})/) || [])[1];
  const dwg = libredwg.dwg_read_data(bytes, Dwg_File_Type.DWG), db = libredwg.convert(dwg); libredwg.dwg_free(dwg);
  const textos = [];
  for (const e of db.entities) {
    if ((e.type !== 'MTEXT' && e.type !== 'TEXT') || !/AREA-IDEN|CLNG-IDEN/.test(e.layer || '')) continue;
    const p = e.insertionPoint || e.startPoint; if (!p) continue;
    // El plano de Atlas tiene el eje Y hacia abajo (imagen); el DWG, hacia arriba.
    textos.push({capa: e.layer, t: limpio(e.text), p: [p.x, -p.y]});
  }
  // Pares rótulo de la lámina ↔ recinto de Atlas por código; códigos repetidos en Atlas se resuelven después del primer ajuste.
  const candidatos = textos.filter(x => /AREA-IDEN/.test(x.capa) && esCodigoRecinto(x.t) && porCodigo.has(x.t));
  let pares = candidatos.filter(x => porCodigo.get(x.t).length === 1).map(x => [x.p, porCodigo.get(x.t)[0]]);
  if (pares.length < 4) { laminas.push({archivo, lamina, error: 'Menos de 4 códigos en común con el plano'}); continue; }
  let t = semejanza(pares);
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const res = pares.map(([a, b]) => Math.hypot(...aplicar(t, a).map((v, i) => v - b[i])));
    const corte = Math.max(3 * [...res].sort((x, y) => x - y)[Math.floor(res.length / 2)], 0.5 * t.escala);
    pares = pares.filter((_, i) => res[i] <= corte); t = semejanza(pares);
  }
  const residuos = pares.map(([a, b]) => Math.hypot(...aplicar(t, a).map((v, i) => v - b[i]))).sort((x, y) => x - y);
  const metro = t.escala, tolerancia = 0.6 * metro;
  const asignar = pt => { const q = aplicar(t, pt); const r = recintos.find(x => contiene(x, q)); if (r) return r; let mejor = null, d = tolerancia; for (const x of recintos) { const e = distBorde(x, q); if (e < d) { d = e; mejor = x; } } return mejor; };
  let cielos = 0, alturas = 0, perdidos = 0;
  for (const x of textos) {
    const codigo = /AREA-IDEN/.test(x.capa) && esCielo(x.t) ? x.t : null, altura = /CLNG-IDEN/.test(x.capa) ? nct(x.t) : null;
    if (!codigo && altura == null) continue;
    const r = asignar(x.p);
    if (!r) { perdidos++; sinRecinto.push({lamina, texto: x.t}); continue; }
    const e = resultado.get(r.code) || {cielos: new Set(), nct: new Set(), laminas: new Set()};
    if (codigo) { e.cielos.add(codigo); cielos++; } else { e.nct.add(altura); alturas++; }
    e.laminas.add('A-' + lamina); resultado.set(r.code, e);
  }
  laminas.push({archivo, lamina: 'A-' + lamina, sha256: createHash('sha256').update(bytes).digest('hex'), codigosAjuste: pares.length,
    residuoMediano: +(residuos[Math.floor(residuos.length / 2)] / metro).toFixed(3), residuoMaximo: +(residuos.at(-1) / metro).toFixed(3), giro: +t.giro.toFixed(3), cielos, alturas, sinRecinto: perdidos});
}

// Comparación con el PMA (terminación CIE de cada recinto en Atlas).
const pmaDe = code => [...new Set(rooms.filter(r => r.code === code).flatMap(r => (r.finishes || []).filter(f => f.field === 'CIE').map(f => String(f.code))))];
const salida = {};
let iguales = 0, distintos = 0, sinPma = 0;
for (const [code, e] of [...resultado].sort((a, b) => a[0].localeCompare(b[0]))) {
  const cielos = [...e.cielos].sort(), pma = pmaDe(code), coincide = !cielos.length || !pma.length ? null : cielos.some(c => pma.includes(c));
  if (coincide === true) iguales++; else if (coincide === false) distintos++; else if (cielos.length) sinPma++;
  salida[code] = {cielos, nct: [...e.nct].sort((a, b) => a - b), laminas: [...e.laminas].sort(), ...(pma.length ? {pma} : {}), ...(coincide === false ? {difiere: true} : {})};
}
const doc = {schema: 1, piso, fuente: 'Láminas HPC-ARQ-CIE (cielo reflejado), DWG', laminas, recintos: salida};
fs.writeFileSync(new URL('cielos.json', raiz), JSON.stringify(doc));
console.log(JSON.stringify({piso, recintos: Object.keys(salida).length, conCielo: Object.values(salida).filter(r => r.cielos.length).length, conNct: Object.values(salida).filter(r => r.nct.length).length,
  coincidePma: iguales, difierePma: distintos, sinPma, etiquetasSinRecinto: sinRecinto.length, laminas: laminas.map(l => l.error ? [l.lamina, l.error] : [l.lamina, l.codigosAjuste, l.residuoMediano, l.residuoMaximo, l.giro, l.cielos, l.alturas, l.sinRecinto])}, null, 1));
