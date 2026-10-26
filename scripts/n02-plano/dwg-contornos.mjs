// Contornos reales de los recintos abiertos del nivel 2 (los marcados «aprox» en plano.json, que traían arcos inventados).
// En cada lámina DWG 1:50 se rasterizan muros, puertas, ventanales, pilares y líneas de límite de recintos (A-AREA)
// en una grilla de 3 cm; se rellena desde el rótulo y se toma el borde. Se acepta si no se escapa del recuadro y su área
// queda entre 80 % y 120 % de la declarada; si no, el recinto conserva su contorno anterior.
// Requiere data/n02/rombos-dwg.json (transformación de cada lámina). Uso:
//   node scripts/n02-plano/dwg-contornos.mjs <carpeta con node_modules del lector> <carpeta «Planos N02»>  -> data/n02/contornos-dwg.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [herramienta, carpeta] = process.argv.slice(2);
const {Dwg_File_Type, LibreDwg} = await import(pathToFileURL(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/dist/libredwg-web.js')).href);
const libredwg = await LibreDwg.create(path.join(herramienta, 'node_modules/@mlightcad/libredwg-web/wasm/') + path.sep);
const plano = JSON.parse(fs.readFileSync(path.join(repo, 'data/n02/plano.json'), 'utf8'));
const laminas = JSON.parse(fs.readFileSync(path.join(repo, 'data/n02/rombos-dwg.json'), 'utf8')).laminas;
const BARRERA = /^(A-WALL|I-WALL|A-GLAZ|A-GLAZ-CWMG|A-GLAZ-CURT|A-DOOR|S-STRS|S-STRS-MBND|A-AREA)$/;
const RES = 3, MARGEN = 150; // cm por píxel; margen del recuadro alrededor del contorno anterior

// Segmentos (en coordenadas de la lámina) de una entidad, explotando bloques.
function* segmentos(e, bloques, M = [1, 0, 0, 1, 0, 0], capa = e.layer, prof = 0) {
  const t = p => [M[0] * p.x + M[2] * p.y + M[4], M[1] * p.x + M[3] * p.y + M[5]];
  const L = e.layer === '0' ? capa : e.layer;
  if (e.type === 'INSERT') {
    const b = bloques.get(e.name); if (!b || prof > 4) return;
    const c = Math.cos(e.rotation || 0), s = Math.sin(e.rotation || 0), sx = e.xScale || 1, sy = e.yScale || 1, bp = b.basePoint || {x: 0, y: 0};
    const N = [c * sx, s * sx, -s * sy, c * sy, e.insertionPoint.x - (c * sx * bp.x - s * sy * bp.y), e.insertionPoint.y - (s * sx * bp.x + c * sy * bp.y)];
    const MN = [M[0] * N[0] + M[2] * N[1], M[1] * N[0] + M[3] * N[1], M[0] * N[2] + M[2] * N[3], M[1] * N[2] + M[3] * N[3], M[0] * N[4] + M[2] * N[5] + M[4], M[1] * N[4] + M[3] * N[5] + M[5]];
    for (const h of b.entities || []) yield* segmentos(h, bloques, MN, L, prof + 1);
    return;
  }
  if (!BARRERA.test(L)) return;
  if (e.type === 'LINE') yield [t(e.startPoint), t(e.endPoint)];
  else if (e.type === 'LWPOLYLINE' && e.vertices?.length > 1) { const v = e.vertices.map(p => t(p)); for (let i = 0; i < v.length - 1; i++) yield [v[i], v[i + 1]]; if (e.flag & 1) yield [v.at(-1), v[0]]; }
  else if (e.type === 'ARC' || e.type === 'CIRCLE') {
    const a0 = e.type === 'ARC' ? e.startAngle : 0, a1 = e.type === 'ARC' ? (e.endAngle < e.startAngle ? e.endAngle + 2 * Math.PI : e.endAngle) : 2 * Math.PI, n = 24;
    let prev; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, p = t({x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a)}); if (prev) yield [prev, p]; prev = p; }
  }
}
const aplicar = (T, p) => [T.c * p[0] - T.s * p[1] + T.tx, T.s * p[0] + T.c * p[1] + T.ty];
const area = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const dp = (p, tol) => { if (p.length < 3) return p; const a = p[0], b = p.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let mi = 0, md = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } } return md > tol ? [...dp(p.slice(0, mi + 1), tol).slice(0, -1), ...dp(p.slice(mi), tol)] : [a, b]; };

function reconstruir(rec, segs) {
  const xs = [], ys = []; for (let i = 0; i < rec.poly.length; i += 2) { xs.push(rec.poly[i]); ys.push(rec.poly[i + 1]); }
  const x0 = Math.min(...xs) - MARGEN, y0 = Math.min(...ys) - MARGEN, W = Math.ceil((Math.max(...xs) + MARGEN - x0) / RES), H = Math.ceil((Math.max(...ys) + MARGEN - y0) / RES);
  const muro = new Uint8Array(W * H), px = p => [(p[0] - x0) / RES, (p[1] - y0) / RES];
  for (const [a, b] of segs) {
    const [ax, ay] = px(a), [bx, by] = px(b), n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1;
    if ((ax < -2 && bx < -2) || (ay < -2 && by < -2) || (ax > W + 2 && bx > W + 2) || (ay > H + 2 && by > H + 2)) continue;
    for (let i = 0; i <= n; i++) { const X = Math.round(ax + (bx - ax) * i / n), Y = Math.round(ay + (by - ay) * i / n); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { const u = X + dx, v = Y + dy; if (u >= 0 && v >= 0 && u < W && v < H) muro[v * W + u] = 1; } }
  }
  const [sx, sy] = px(rec.p).map(Math.round); let semilla = -1;
  for (let r = 0; r < 40 && semilla < 0; r++) for (let dy = -r; dy <= r && semilla < 0; dy++) for (let dx = -r; dx <= r; dx++) { const u = sx + dx, v = sy + dy; if (u >= 0 && v >= 0 && u < W && v < H && !muro[v * W + u]) { semilla = v * W + u; break; } }
  if (semilla < 0) return {estado: 'rechazado', motivo: 'sin espacio libre junto al rótulo'};
  const marca = new Uint8Array(W * H), pila = [semilla]; marca[semilla] = 1; let n = 0, borde = false;
  while (pila.length) { const i = pila.pop(), X = i % W, Y = (i / W) | 0; n++; if (X === 0 || Y === 0 || X === W - 1 || Y === H - 1) borde = true; for (const [j, ok] of [[i - 1, X > 0], [i + 1, X < W - 1], [i - W, Y > 0], [i + W, Y < H - 1]]) if (ok && !marca[j] && !muro[j]) { marca[j] = 1; pila.push(j); } }
  // El grosor de línea (≈1 px por lado) se devuelve al área.
  const areaM2 = n * RES * RES / 1e4, declarada = parseFloat(rec.superficie.replace(',', '.'));
  if (borde) return {estado: 'rechazado', motivo: 'el relleno se escapa (abertura sin cerrar en el DWG)', areaM2: +areaM2.toFixed(2), declarada};
  if (areaM2 < .8 * declarada || areaM2 > 1.2 * declarada) return {estado: 'rechazado', motivo: 'área fuera de rango', areaM2: +areaM2.toFixed(2), declarada};
  // Borde exterior (seguimiento de Moore) y simplificación.
  let inicio = marca.indexOf(1);
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], on = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && marca[Y * W + X];
  let X = inicio % W, Y = (inicio / W) | 0, dir = 6; const camino = [[X, Y]];
  for (let k = 0; k < 1e6; k++) { let paso = false; for (let t = 0; t < 8; t++) { const nd = (dir + 6 + t) % 8, [ex, ey] = dirs[nd]; if (on(X + ex, Y + ey)) { X += ex; Y += ey; dir = nd; paso = true; break; } } if (!paso || (X === camino[0][0] && Y === camino[0][1])) break; camino.push([X, Y]); }
  const mitad = camino.length >> 1, simple = [...dp(camino.slice(0, mitad + 1), 1.2).slice(0, -1), ...dp(camino.slice(mitad), 1.2).slice(0, -1)];
  const ring = simple.map(([u, v]) => [+(x0 + (u + .5) * RES).toFixed(1), +(y0 + (v + .5) * RES).toFixed(1)]);
  return {estado: 'ok', areaM2: +areaM2.toFixed(2), declarada, areaContornoM2: +(area(ring) / 1e4).toFixed(2), vertices: ring.length, poly: ring.flat()};
}

const pendientes = plano.recintos.filter(r => r.aprox), salida = {};
for (const lam of laminas) {
  const sector = plano.sectores.find(s => lam.archivo.includes(s.id)), [sx0, sy0, sx1, sy1] = sector.r;
  const aqui = pendientes.filter(r => !salida[r.codigo] && r.p[0] >= sx0 && r.p[0] <= sx1 && r.p[1] >= sy0 && r.p[1] <= sy1);
  if (!aqui.length) continue;
  const dwg = libredwg.dwg_read_data(fs.readFileSync(path.join(carpeta, lam.archivo)), Dwg_File_Type.DWG);
  const db = libredwg.convert(dwg); libredwg.dwg_free(dwg);
  const bloques = new Map((db.tables.BLOCK_RECORD.entries || []).map(b => [b.name, b]));
  const segs = []; for (const e of db.entities) for (const [a, b] of segmentos(e, bloques)) segs.push([aplicar(lam.T, a), aplicar(lam.T, b)]);
  for (const rec of aqui) { salida[rec.codigo] = {lamina: lam.archivo.slice(16, 21), ...reconstruir(rec, segs)}; console.log(rec.codigo.padEnd(14), rec.nombre.slice(0, 32).padEnd(33), salida[rec.codigo].estado, salida[rec.codigo].areaM2 ?? '', '/', salida[rec.codigo].declarada ?? '', salida[rec.codigo].motivo || ''); }
}
fs.writeFileSync(path.join(repo, 'data/n02/contornos-dwg.json'), JSON.stringify(salida, null, 1));
console.log('aceptados', Object.values(salida).filter(v => v.estado === 'ok').length, 'de', pendientes.length);
