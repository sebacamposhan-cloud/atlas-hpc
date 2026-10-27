// Dibujo de las láminas DWG de arquitectura de un nivel, separado en las capas de Atlas (base, mobiliario, ejes y relleno),
// con los rótulos de recinto, los rombos de terminación y las líneas que limitan recintos (para los contornos).
// Las láminas exportadas desde Revit comparten las coordenadas del modelo (m): cada una aporta solo la ventana de su
// vista en planta (el contorno de lo dibujado), así no entran la viñeta, la leyenda ni lo que queda fuera del encuadre.
// Lector LibreDWG en WebAssembly (GPL), instalado fuera del repo como en scripts/n02-plano; no forma parte del sitio.
// Uso: node scripts/dwg-plano/extraer.mjs <carpeta con node_modules del lector> <carpeta de láminas> <nivel: n01|n02|n03>
//   -> data/<nivel>/laminas.json y marco.json; dibujo.json y barreras.json son datos intermedios grandes (no se publican)
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {calcularMarco} from './marco.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [herramienta, carpeta, nivel] = process.argv.slice(2);
if (!/^n0\d$/.test(nivel || '')) throw Error('Indica el nivel: n01, n02 o n03.');
const {Dwg_File_Type, LibreDwg} = await import(pathToFileURL(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js')).href);
const libredwg = await LibreDwg.create(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/wasm/') + path.sep);
const salidaDir = path.join(repo, 'data', nivel);
fs.mkdirSync(salidaDir, {recursive: true});

// Marco en cm. N02 conserva el marco de data/n02/plano.json (transformación de cada lámina en rombos-dwg.json);
// los demás niveles usan directamente las coordenadas del modelo (m × 100).
const marcoN02 = nivel === 'n02' ? new Map(JSON.parse(fs.readFileSync(path.join(repo, 'data/n02/rombos-dwg.json'), 'utf8')).laminas.map(l => [l.archivo, l.T])) : null;

// Capas de Atlas según la capa del DWG (estándar AIA de la exportación de Revit).
const grupo = L => /^S-GRID/.test(L) ? 'ejes' : /^(A-FLOR-PATT|A-AREA-PATT)$/.test(L) ? 'relleno' : /^(Q-|M-EQPM|P-SANR-FIXT|I-FURN|A-FURN)/.test(L) ? 'mobiliario' : 'base';
const OMITIR = /^(G-ANNO-TTLB|G-ANNO-DIMS|A-ANNO-DIMS|G-ANNO-SYMB|G-ANNO-REVC|G-ANNO-NPLT|DEFPOINTS)$/i;
const BARRERA = /^(A-WALL|I-WALL|A-WALL-PATT|A-GLAZ|A-GLAZ-CWMG|A-GLAZ-CURT|A-DOOR|A-DOOR-FRAM|S-STRS|S-STRS-MBND|S-COLS|A-AREA)$/;
const GRUESO = /^(A-WALL|I-WALL|S-COLS)$/, MEDIO = /^(A-DOOR|A-DOOR-FRAM|A-GLAZ|A-GLAZ-CWMG|A-GLAZ-CURT|S-STRS|A-FLOR-HRAL)$/;
const ancho = L => GRUESO.test(L) ? 2 : MEDIO.test(L) ? 1 : grupo(L) === 'mobiliario' ? .5 : .6; // cm reales
const CODIGO = /^(\d+(\.\d+)+|[A-Z]{2}(\.[A-Z0-9]+)+)-\d+$/;

const r1 = v => Math.round(v * 10) / 10;
const mul = (M, N) => [M[0] * N[0] + M[2] * N[1], M[1] * N[0] + M[3] * N[1], M[0] * N[2] + M[2] * N[3], M[1] * N[2] + M[3] * N[3], M[0] * N[4] + M[2] * N[5] + M[4], M[1] * N[4] + M[3] * N[5] + M[5]];
// Tinta en escala de grises (0 negro … 255 blanco). El blanco del DWG (color 7) se dibuja negro sobre fondo blanco.
// Solo el blanco exacto (color 7) pasa a negro: los grises casi blancos (#FAFAFA) son rellenos claros.
const tinta = rgb => { if (rgb == null || rgb === 0xFFFFFF || rgb < 0) return 0; const r = rgb >> 16 & 255, g = rgb >> 8 & 255, b = rgb & 255; return Math.round(.299 * r + .587 * g + .114 * b); };
const limpiar = s => String(s ?? '').replace(/\\P/g, '\n').replace(/\\S([^;^]*)\^([^;]*);/g, '$1/$2').replace(/\\[ACFHQTWfp][^;]*;/g, '').replace(/\\[LlOoKkX]/g, '').replace(/\\~/g, ' ').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\\\\/g, '\\').trim();

// Recorte de una polilínea por rectángulo (Liang–Barsky por tramo); devuelve los trozos visibles.
function recortarLinea(v, [x0, y0, x1, y1]) {
  const trozos = []; let actual = null;
  for (let i = 0; i + 1 < v.length; i++) {
    let [ax, ay] = v[i], [bx, by] = v[i + 1], t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay; let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p; if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) { actual = null; continue; }
    const a = [ax + t0 * dx, ay + t0 * dy], b = [ax + t1 * dx, ay + t1 * dy];
    if (actual && t0 === 0) actual.push(b); else { actual = [a, b]; trozos.push(actual); }
    if (t1 < 1) actual = null;
  }
  return trozos;
}
// Recorte de un anillo por rectángulo (Sutherland–Hodgman).
function recortarAnillo(ring, [x0, y0, x1, y1]) {
  let out = ring;
  for (const [dentro, corte] of [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]]) {
    const prev = out; out = [];
    for (let i = 0; i < prev.length; i++) { const a = prev[(i + prev.length - 1) % prev.length], b = prev[i]; if (dentro(b)) { if (!dentro(a)) out.push(corte(a, b)); out.push(b); } else if (dentro(a)) out.push(corte(a, b)); }
    if (!out.length) break;
  }
  return out;
}
// Arco por puntos. ccw=false: ángulos medidos en sentido horario (bordes de sombreado).
function arco(c, r, a0, a1, ccw = true, ratio = 1, eje = [r, 0]) {
  if (!ccw) { a0 = -a0; a1 = -a1; [a0, a1] = [a1, a0]; }
  while (a1 <= a0) a1 += 2 * Math.PI;
  const n = Math.max(6, Math.ceil((a1 - a0) / (Math.PI / 32))), pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, co = Math.cos(a), si = Math.sin(a); pts.push([c.x + eje[0] * co - eje[1] * ratio * si, c.y + eje[1] * co + eje[0] * ratio * si]); }
  if (!ccw) pts.reverse();
  return pts;
}
// Tramo con abultamiento (bulge) de una polilínea.
function bulge(a, b, k) {
  if (!k) return [[a.x, a.y]];
  const d = Math.hypot(b.x - a.x, b.y - a.y), th = 4 * Math.atan(k), r = d / (2 * Math.sin(th / 2)), m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const h = r * Math.cos(th / 2), n = [-(b.y - a.y) / d, (b.x - a.x) / d], c = {x: m[0] + n[0] * h, y: m[1] + n[1] * h};
  const s = Math.atan2(a.y - c.y, a.x - c.x), e = Math.atan2(b.y - c.y, b.x - c.x), R = Math.abs(r);
  return arco(c, R, k > 0 ? s : e, k > 0 ? e : s, true).map((p, i, all) => k > 0 ? p : all[all.length - 1 - i]).slice(0, -1);
}
const polilinea = (vs, cerrada) => { const out = []; for (let i = 0; i < vs.length; i++) { const b = vs[(i + 1) % vs.length]; if (i === vs.length - 1 && !cerrada) { out.push([vs[i].x, vs[i].y]); break; } out.push(...bulge(vs[i], b, vs[i].bulge || 0)); } if (cerrada && out.length) out.push(out[0]); return out; };
// B-spline (de Boor) con nudos y pesos; sin nudos, el polígono de control.
function spline(e) {
  const P = e.controlPoints || [], k = e.degree || 3, U = e.knots || [], W = e.weights?.length === P.length ? e.weights : null;
  if (e.fitPoints?.length > 1 && !P.length) return e.fitPoints.map(p => [p.x, p.y]);
  if (P.length < 2 || U.length !== P.length + k + 1) return P.map(p => [p.x, p.y]);
  const out = [], u0 = U[k], u1 = U[P.length], n = Math.max(8, P.length * 6);
  for (let s = 0; s <= n; s++) {
    let u = u0 + (u1 - u0) * s / n, j = k; if (s === n) u -= 1e-9;
    while (j < P.length - 1 && U[j + 1] <= u) j++;
    const d = []; for (let i = 0; i <= k; i++) { const p = P[j - k + i], w = W ? W[j - k + i] : 1; d.push([p.x * w, p.y * w, w]); }
    for (let r = 1; r <= k; r++) for (let i = k; i >= r; i--) { const den = U[i + j - r + 1] - U[i + j - k], a = den ? (u - U[i + j - k]) / den : 0; d[i] = d[i].map((v, t) => (1 - a) * d[i - 1][t] + a * v); }
    out.push([d[k][0] / d[k][2], d[k][1] / d[k][2]]);
  }
  return out;
}
function bordesSombreado(e) {
  const anillos = [];
  for (const bp of e.boundaryPaths || []) {
    let ring = [];
    if (bp.vertices?.length) ring = polilinea(bp.vertices, true);
    else for (const g of bp.edges || []) {
      if (g.type === 1) ring.push([g.start.x, g.start.y], [g.end.x, g.end.y]);
      else if (g.type === 2) ring.push(...arco(g.center, g.radius, g.startAngle, g.endAngle, !!g.isCCW));
      else if (g.type === 3) { const ax = g.end || g.majorAxisEndPoint || {x: 1, y: 0}, R = Math.hypot(ax.x, ax.y); ring.push(...arco(g.center, R, g.startAngle, g.endAngle, !!g.isCCW, g.lengthOfMinorAxis ?? g.axisRatio ?? 1, [ax.x, ax.y])); }
      else if (g.type === 4) ring.push(...spline(g));
    }
    if (ring.length > 2) anillos.push(ring);
  }
  return anillos;
}

const archivos = fs.readdirSync(carpeta).filter(f => new RegExp('^HPC-ARQ-PLA-' + nivel.toUpperCase() + '-A-5\\d\\d.*\\.dwg$', 'i').test(f)).sort();
if (!archivos.length) throw Error('No hay láminas HPC-ARQ-PLA-' + nivel.toUpperCase() + '-A-5xx en ' + carpeta);
const capas = {base: [], mobiliario: [], ejes: [], relleno: []}, vistos = new Set(), barreras = [], rotulos = [], rombos = [], bloquesRombo = {}, laminas = [];
for (const archivo of archivos) {
  const bytes = fs.readFileSync(path.join(carpeta, archivo));
  const dwg = libredwg.dwg_read_data(bytes, Dwg_File_Type.DWG), db = libredwg.convert(dwg); libredwg.dwg_free(dwg);
  const bloques = new Map((db.tables.BLOCK_RECORD.entries || []).map(b => [b.name, b]));
  const capasDwg = new Map((db.tables.LAYER.entries || []).map(l => [l.name, l]));
  const modelo = [...bloques.values()].find(b => /^\*model_space$/i.test(b.name));
  const enModelo = e => !modelo || e.ownerBlockRecordSoftId == null || String(e.ownerBlockRecordSoftId) === String(modelo.handle);
  // Ventana de la vista en planta: el VIEWPORT a escala 1:50 de mayor superficie (el plano llave y la leyenda van a otra escala).
  const vistas = db.entities.filter(e => e.type === 'VIEWPORT' && e.viewHeight > 0 && e.width > 0 && e.height > 0 && e.displayCenter && Math.abs(e.viewHeight / e.height - 50) < 2.5)
    .map(e => { const h = e.viewHeight, w = h * e.width / e.height, c = e.displayCenter; return {r: [c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2], giro: e.viewTwistAngle || 0, area: w * h}; })
    .sort((a, b) => b.area - a.area);
  if (vistas.length && Math.abs(vistas[0].giro) > 1e-6) throw Error(archivo + ': la vista está girada; no se admite todavía.');
  const T = marcoN02?.get(archivo) || {c: 100, s: 0, tx: 0, ty: 0};
  const aplicar = (x, y) => [T.c * x - T.s * y + T.tx, T.s * x + T.c * y + T.ty];
  const esc = Math.hypot(T.c, T.s), giroT = Math.atan2(T.s, T.c);
  const lamina = archivo.match(/-A-5\d\d/)[0].slice(1);
  // Primero se recorre todo sin recortar; la ventana se decide después (algunas láminas guardan una vista con otro zoom).
  const crudos = [];
  let n = 0;
  const agregar = (g, prim) => { const k = g + JSON.stringify(prim); if (vistos.has(k)) return; vistos.add(k); capas[g].push(prim); n++; };
  const colorCapa = L => capasDwg.get(L)?.color, tipoCapa = L => capasDwg.get(L)?.lineType || '';
  // puerta: la entidad está dentro de un bloque de puerta; su hoja y su barrido (capas A-DETL-GENF*) también cierran el recinto.
  function visitar(e, M, capaPadre, colorPadre, prof, puerta = false) {
    if (e.isVisible === false) return;
    const L = e.layer === '0' ? capaPadre : e.layer, capa = capasDwg.get(L);
    if (OMITIR.test(L) || capa?.off || capa?.frozen) return;
    const color = e.colorIndex === 256 || e.colorIndex == null ? colorCapa(L) : e.colorIndex === 0 ? colorPadre : e.color;
    const t = p => { const x = M[0] * p.x + M[2] * p.y + M[4], y = M[1] * p.x + M[3] * p.y + M[5]; return aplicar(x, y); };
    const tp = ([x, y]) => t({x, y});
    if (e.type === 'INSERT') {
      if (/General_Plantas1_50|Viñeta|^Viewport - /i.test(e.name)) return;
      const b = bloques.get(e.name); if (!b || prof > 8) return;
      const c = Math.cos(e.rotation || 0), s = Math.sin(e.rotation || 0), sx = e.xScale || 1, sy = e.yScale || 1, bp = b.basePoint || {x: 0, y: 0};
      for (let i = 0; i < Math.max(1, e.columnCount || 1); i++) for (let j = 0; j < Math.max(1, e.rowCount || 1); j++) {
        const ox = i * (e.columnSpacing || 0), oy = j * (e.rowSpacing || 0), ix = e.insertionPoint.x + c * ox - s * oy, iy = e.insertionPoint.y + s * ox + c * oy;
        const N = [c * sx, s * sx, -s * sy, c * sy, ix - (c * sx * bp.x - s * sy * bp.y), iy - (s * sx * bp.x + c * sy * bp.y)];
        for (const h of b.entities || []) visitar(h, mul(M, N), L, color, prof + 1, puerta || e.layer === 'A-DOOR');
      }
      return;
    }
    const g = grupo(L), gris = tinta(color), lt = e.lineType && !/^(bylayer|byblock)$/i.test(e.lineType) ? e.lineType : tipoCapa(L), raya = !/^(continuous|bylayer|byblock|)$/i.test(lt) ? 1 : 0;
    // En una puerta, el arco de barrido no limita: el vano se cierra con las rectas del pivote a cada extremo del arco
    // (una coincide con la hoja abierta y la otra con la puerta cerrada). Así el contorno no bordea el barrido.
    const arcoPuerta = puerta && e.type === 'ARC';
    const limita = !arcoPuerta && (BARRERA.test(L) || (puerta && /^A-DETL-GENF/.test(L)));
    const linea = pts => { if (pts.length > 1) crudos.push(['l', g, L, gris, raya, pts.map(tp), limita]); };
    if (arcoPuerta) for (const a of [e.startAngle, e.endAngle]) crudos.push(['b', [tp([e.center.x, e.center.y]), tp([e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)])]]);
    if (e.type === 'LINE') linea([[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]]);
    else if (e.type === 'LWPOLYLINE' && e.vertices?.length > 1) linea(polilinea(e.vertices, !!(e.flag & 1)));
    else if (/^POLYLINE/.test(e.type) && e.vertices?.length > 1) linea(polilinea(e.vertices, !!(e.flag & 1)));
    else if (e.type === 'ARC') linea(arco(e.center, e.radius, e.startAngle, e.endAngle));
    else if (e.type === 'CIRCLE') linea(arco(e.center, e.radius, 0, 2 * Math.PI));
    else if (e.type === 'ELLIPSE' && e.majorAxisEndPoint) { const ax = e.majorAxisEndPoint; linea(arco(e.center, 1, e.startAngle ?? 0, e.endAngle ?? 2 * Math.PI, true, e.axisRatio || 1, [ax.x, ax.y])); }
    else if (e.type === 'SPLINE') linea(spline(e));
    else if ((e.type === 'SOLID' || e.type === 'TRACE') && e.corner1) crudos.push(['f', g, L, gris, 1, [[e.corner1, e.corner2, e.corner4 || e.corner3, e.corner3].filter(Boolean).map(t)], limita]);
    else if (e.type === 'HATCH') { const anillos = bordesSombreado(e).map(r => r.map(tp)); if (anillos.length) crudos.push(['f', g, L, gris, e.solidFill || e.patternName === 'SOLID' ? 1 : 0, anillos, limita]); }
    else if ((e.type === 'MTEXT' || e.type === 'TEXT' || e.type === 'ATTRIB') && e.insertionPoint) {
      const texto = limpiar(e.text); if (!texto) return;
      const alineado = e.type === 'TEXT' && (e.halign || e.valign) && e.alignmentPoint;
      const p = t(alineado ? e.alignmentPoint : e.insertionPoint);
      const fe = Math.hypot(M[0], M[1]) * esc, giro = (e.type === 'MTEXT' && e.direction ? Math.atan2(e.direction.y, e.direction.x) : e.rotation || 0) + Math.atan2(M[1], M[0]) + giroT;
      const anclaje = e.type === 'MTEXT' ? e.attachmentPoint || 1 : (e.valign === 3 ? 0 : e.valign === 2 ? 3 : 6) + (e.halign === 1 || e.halign === 4 ? 2 : e.halign === 2 ? 3 : 1);
      crudos.push(['t', g, L, gris, p, +(e.textHeight * fe).toFixed(2), +giro.toFixed(4), anclaje, texto]);
    }
  }
  const propios = db.entities.filter(enModelo);
  for (const e of propios) visitar(e, [1, 0, 0, 1, 0, 0], e.layer, colorCapa(e.layer), 0);

  // Ventana: el contorno de muros, puertas y pilares, que Revit corta en el borde de la vista (el VIEWPORT guardado puede
  // tener otro zoom o ser más ancho que lo dibujado). Margen de 30 cm para no cortar las líneas del borde.
  let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
  for (const c of crudos) if (c[0] !== 't' && /^(A-WALL|I-WALL|A-DOOR|S-COLS)$/.test(c[2])) for (const p of c[0] === 'l' ? c[5] : c[5].flat()) { if (p[0] < mx0) mx0 = p[0]; if (p[1] < my0) my0 = p[1]; if (p[0] > mx1) mx1 = p[0]; if (p[1] > my1) my1 = p[1]; }
  const ventana = [mx0 - 30, my0 - 30, mx1 + 30, my1 + 30], fuenteVentana = vistas.length ? 'contorno de muros (vista 1:50 guardada: ' + vistas[0].r.map(v => Math.round(v * 100)).join(',') + ')' : 'contorno de muros';
  if (!(ventana[2] > ventana[0])) throw Error(archivo + ': no se pudo determinar la ventana de la vista en planta.');
  const dentro = ([x, y]) => x >= ventana[0] && x <= ventana[2] && y >= ventana[1] && y <= ventana[3];
  for (const c of crudos) {
    if (c[0] === 'b') { for (const trozo of recortarLinea(c[1], ventana)) { const v = trozo.flat().map(r1); barreras.push([v[0], v[1], v[2], v[3]]); } continue; }
    if (c[0] === 'l') { const [, g, L, gris, raya, pts, limita] = c; for (const trozo of recortarLinea(pts, ventana)) { const v = trozo.flat().map(r1); agregar(g, ['l', gris, ancho(L), raya, v]); if (limita) for (let i = 0; i + 3 < v.length; i += 2) barreras.push([v[i], v[i + 1], v[i + 2], v[i + 3]]); } }
    else if (c[0] === 'f') {
      const [, g, L, gris, solido, rings, limita] = c, anillos = rings.map(r => recortarAnillo(r, ventana)).filter(r => r.length > 2);
      if (anillos.length) agregar(g, ['f', gris, solido, anillos.map(r => r.flat().map(r1))]);
      if (limita) for (const r of anillos) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; barreras.push([r1(a[0]), r1(a[1]), r1(b[0]), r1(b[1])]); }
    } else { const [, g, , gris, p, h, giro, anclaje, texto] = c; if (dentro(p)) agregar(g, ['t', gris, r1(p[0]), r1(p[1]), h, giro, anclaje, texto]); }
  }

  // Rótulos de recinto (código, nombre y superficie en la capa A-AREA-IDEN) y rombos, como en scripts/n02-plano/dwg-rombos.mjs.
  const textos = propios.filter(e => (e.type === 'MTEXT' || e.type === 'TEXT') && e.layer === 'A-AREA-IDEN' && e.insertionPoint).map(e => ({e, s: limpiar(e.text), p: aplicar(e.insertionPoint.x, e.insertionPoint.y), h: e.textHeight * esc}));
  for (const c of textos.filter(x => CODIGO.test(x.s) && dentro(x.p))) {
    const cerca = textos.filter(o => o !== c && Math.abs(o.p[0] - c.p[0]) < 250);
    const arriba = cerca.filter(o => o.p[1] > c.p[1] && o.p[1] - c.p[1] < 120 && !CODIGO.test(o.s) && !/m²|m2/.test(o.s) && !/^\d+$|^[A-Z]?\/?[A-Z]\/?[A-Z]?$/.test(o.s)).sort((a, b) => a.p[1] - b.p[1]);
    const abajo = cerca.filter(o => o.p[1] < c.p[1] && c.p[1] - o.p[1] < 120 && /m²|m2/.test(o.s)).sort((a, b) => b.p[1] - a.p[1]);
    rotulos.push({codigo: c.s, lamina, p: c.p.map(r1), h: +c.h.toFixed(1), nombre: arriba[0]?.s.replace(/\n/g, ' ') || null, superficie: abajo[0]?.s.replace(/\s*m(²|2)/, '').trim() || null});
  }
  const campo = ([x, y]) => { const cerca = v => Math.abs(y - v) < .45; if (cerca(7.45)) return 'M1'; if (cerca(5.71)) return 'CIE'; if (cerca(3.58)) return 'PAV'; if (cerca(1.77)) return 'M3'; if (cerca(4.75)) return x > 0 ? 'M2' : 'M4'; return null; };
  for (const r of propios.filter(e => e.type === 'INSERT' && /Rombo/i.test(e.name) && !/General_Plantas1_50/.test(e.name))) {
    const p = r.insertionPoint, s = r.xScale, gr = r.rotation || 0, P = aplicar(p.x, p.y); if (!dentro(P)) continue;
    const local = o => { const dx = o.e.insertionPoint.x - p.x, dy = o.e.insertionPoint.y - p.y; return [(dx * Math.cos(-gr) - dy * Math.sin(-gr)) / s * 1000, (dx * Math.sin(-gr) + dy * Math.cos(-gr)) / s * 1000]; };
    const suyos = textos.map(o => ({o, l: local(o)})).filter(({l}) => l[0] > -20 && l[0] < 6 && l[1] > -6 && l[1] < 9);
    const codigo = suyos.find(({o, l}) => CODIGO.test(o.s) && l[1] < 0)?.o.s || null, valores = {};
    for (const {o, l} of suyos) { const k = l[1] > .5 && campo(l); if (k) valores[k] = o.s; }
    if (!bloquesRombo[r.name] && bloques.has(r.name)) bloquesRombo[r.name] = bloques.get(r.name).entities.filter(e => e.type === 'LINE').map(e => [e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y]);
    rombos.push({codigo, lamina, valores, p: P.map(r1), escala: +(s * esc).toFixed(4), giro: +(gr + giroT).toFixed(5), bloque: r.name,
      textos: suyos.filter(({l}) => l[1] > .5 && campo(l)).map(({o}) => ({texto: o.s, p: o.p.map(r1), h: +o.h.toFixed(2)}))});
  }
  laminas.push({archivo, lamina, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ventana: ventana.map(r1), fuenteVentana, primitivas: n,
    rotulos: rotulos.filter(x => x.lamina === lamina).length, rombos: rombos.filter(x => x.lamina === lamina).length});
  console.log(lamina, 'ventana', ventana.map(v => Math.round(v)).join(','), '· primitivas', n, '· rótulos', laminas.at(-1).rotulos, '· rombos', laminas.at(-1).rombos);
}
const todas = laminas.map(l => l.ventana), bounds = [Math.min(...todas.map(v => v[0])), Math.min(...todas.map(v => v[1])), Math.max(...todas.map(v => v[2])), Math.max(...todas.map(v => v[3]))].map(r1);
fs.writeFileSync(path.join(salidaDir, 'dibujo.json'), JSON.stringify({nivel, bounds, capas}));
fs.writeFileSync(path.join(salidaDir, 'laminas.json'), JSON.stringify({nota: 'Láminas DWG de arquitectura del nivel. Ventana: vista en planta en cm del marco del nivel. Las huellas permiten comprobar que los originales no cambiaron.', bounds, laminas, rotulos, rombos, bloques: bloquesRombo}));
fs.writeFileSync(path.join(salidaDir, 'barreras.json'), JSON.stringify(barreras));
fs.writeFileSync(path.join(salidaDir, 'marco.json'), JSON.stringify(calcularMarco(repo, nivel, bounds)));
console.log(JSON.stringify({nivel, bounds, primitivas: Object.fromEntries(Object.entries(capas).map(([k, v]) => [k, v.length])), barreras: barreras.length, rotulos: rotulos.length, codigos: new Set(rotulos.map(r => r.codigo)).size, rombos: rombos.length, conValores: rombos.filter(r => Object.keys(r.valores).length === 6).length,
  dibujoMB: +(fs.statSync(path.join(salidaDir, 'dibujo.json')).size / 1e6).toFixed(1)}));
