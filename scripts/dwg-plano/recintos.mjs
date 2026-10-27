// Recintos de un nivel dibujado desde DWG: código y posición del rótulo, monografía del rombo y contorno.
// El contorno se obtiene como en scripts/n02-plano/dwg-contornos.mjs: se rasterizan muros, puertas, ventanales, pilares y
// escaleras (data/<nivel>/barreras.json) en una grilla de 3 cm, se rellena desde el rótulo y se toma el borde.
// Se acepta si el relleno no se escapa y su área queda entre 80 % y 120 % de la superficie del PMA (o del rótulo); entre 60 % y
// 80 % queda como contorno parcial. Si no, el recinto lleva una superficie auxiliar de selección en el rótulo (no se inventa un límite).
// Uso: node scripts/dwg-plano/recintos.mjs <nivel: n01|n03>  -> data/<nivel>/recintos.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nivel = process.argv[2];
if (!/^n0[13]$/.test(nivel || '')) throw Error('Indica el nivel: n01 o n03 (el N02 conserva sus contornos de data/n02/plano.json).');
const leer = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, f), 'utf8'));
const {rotulos, rombos} = leer('laminas.json'), barreras = leer('barreras.json');
const {decodePma} = await import(pathToFileURL(path.join(repo, 'dist/pma-model.mjs')).href);
const pma = decodePma(JSON.parse(fs.readFileSync(path.join(repo, 'dist/pma/catalog.json'), 'utf8')));
const nivelPma = 'A-' + nivel.toUpperCase(), porCodigo = new Map(pma.main.filter(r => r.level === nivelPma).map(r => [String(r.code).trim(), r]));
const RES = 3, CELDA = 500;
const numero = s => { const v = parseFloat(String(s ?? '').replace(/m(²|2)/, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };

// Índice espacial de los tramos que limitan recintos.
const celdas = new Map();
for (let i = 0; i < barreras.length; i++) {
  const [ax, ay, bx, by] = barreras[i];
  for (let cx = Math.floor(Math.min(ax, bx) / CELDA); cx <= Math.floor(Math.max(ax, bx) / CELDA); cx++) for (let cy = Math.floor(Math.min(ay, by) / CELDA); cy <= Math.floor(Math.max(ay, by) / CELDA); cy++) {
    const k = cx + ',' + cy; if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(i);
  }
}
function tramos(x0, y0, x1, y1) {
  const s = new Set(); for (let cx = Math.floor(x0 / CELDA); cx <= Math.floor(x1 / CELDA); cx++) for (let cy = Math.floor(y0 / CELDA); cy <= Math.floor(y1 / CELDA); cy++) for (const i of celdas.get(cx + ',' + cy) || []) s.add(i);
  return [...s].map(i => barreras[i]);
}
const areaAnillo = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const dp = (p, tol) => { if (p.length < 3) return p; const a = p[0], b = p.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let mi = 0, md = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } } return md > tol ? [...dp(p.slice(0, mi + 1), tol).slice(0, -1), ...dp(p.slice(mi), tol)] : [a, b]; };

function contorno(p, declarada) {
  const media = Math.min(4500, Math.max(400, 150 * Math.sqrt(declarada || 20)));
  const x0 = p[0] - media, y0 = p[1] - media, W = Math.ceil(2 * media / RES), H = W, muro = new Uint8Array(W * H), px = q => [(q[0] - x0) / RES, (q[1] - y0) / RES];
  for (const [ax0, ay0, bx0, by0] of tramos(x0, y0, x0 + 2 * media, y0 + 2 * media)) {
    const [ax, ay] = px([ax0, ay0]), [bx, by] = px([bx0, by0]), n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1;
    if ((ax < -2 && bx < -2) || (ay < -2 && by < -2) || (ax > W + 2 && bx > W + 2) || (ay > H + 2 && by > H + 2)) continue;
    for (let i = 0; i <= n; i++) { const X = Math.round(ax + (bx - ax) * i / n), Y = Math.round(ay + (by - ay) * i / n); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { const u = X + dx, v = Y + dy; if (u >= 0 && v >= 0 && u < W && v < H) muro[v * W + u] = 1; } }
  }
  const [sx, sy] = px(p).map(Math.round); let semilla = -1;
  for (let r = 0; r < 40 && semilla < 0; r++) for (let dy = -r; dy <= r && semilla < 0; dy++) for (let dx = -r; dx <= r; dx++) { const u = sx + dx, v = sy + dy; if (u >= 0 && v >= 0 && u < W && v < H && !muro[v * W + u]) { semilla = v * W + u; break; } }
  if (semilla < 0) return {estado: 'auxiliar', motivo: 'sin espacio libre junto al rótulo'};
  const marca = new Uint8Array(W * H), pila = [semilla]; marca[semilla] = 1; let n = 0, borde = false;
  while (pila.length) { const i = pila.pop(), X = i % W, Y = (i / W) | 0; n++; if (X === 0 || Y === 0 || X === W - 1 || Y === H - 1) { borde = true; break; } for (const [j, ok] of [[i - 1, X > 0], [i + 1, X < W - 1], [i - W, Y > 0], [i + W, Y < H - 1]]) if (ok && !marca[j] && !muro[j]) { marca[j] = 1; pila.push(j); } }
  const areaM2 = n * RES * RES / 1e4;
  if (borde) return {estado: 'auxiliar', motivo: 'el relleno se escapa (abertura sin cerrar en el DWG)'};
  if (declarada && (areaM2 < .6 * declarada || areaM2 > 1.2 * declarada)) return {estado: 'auxiliar', motivo: `área fuera de rango (${areaM2.toFixed(1)} m² contra ${declarada} m²)`};
  // Entre 60 % y 80 %: tabiques interiores o artefactos fijos dividen el recinto; el contorno cubre solo la parte del rótulo.
  const estado = declarada && areaM2 < .8 * declarada ? 'parcial' : 'ok';
  // Borde exterior (seguimiento de Moore) y simplificación.
  const inicio = marca.indexOf(1), dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], on = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && marca[Y * W + X];
  let X = inicio % W, Y = (inicio / W) | 0, dir = 6; const camino = [[X, Y]];
  for (let k = 0; k < 2e6; k++) { let paso = false; for (let t = 0; t < 8; t++) { const nd = (dir + 6 + t) % 8, [ex, ey] = dirs[nd]; if (on(X + ex, Y + ey)) { X += ex; Y += ey; dir = nd; paso = true; break; } } if (!paso || (X === camino[0][0] && Y === camino[0][1])) break; camino.push([X, Y]); }
  const mitad = camino.length >> 1, simple = [...dp(camino.slice(0, mitad + 1), 1.2).slice(0, -1), ...dp(camino.slice(mitad), 1.2).slice(0, -1)];
  const ring = simple.map(([u, v]) => [+(x0 + (u + .5) * RES).toFixed(1), +(y0 + (v + .5) * RES).toFixed(1)]);
  if (ring.length < 4) return {estado: 'auxiliar', motivo: 'contorno degenerado'};
  return {estado, areaM2: +areaM2.toFixed(2), areaContornoM2: +(areaAnillo(ring) / 1e4).toFixed(2), poly: ring.flat(), ...(estado === 'parcial' ? {motivo: `contorno parcial (${areaM2.toFixed(1)} m² contra ${declarada} m²)`} : {})};
}

// Un recinto por código: rótulo de la primera lámina donde aparece; rombo con código si lo hay.
const conRombo = new Map(); for (const r of rombos) if (r.codigo && !conRombo.has(r.codigo)) conRombo.set(r.codigo, r);
const unicos = new Map(); for (const r of rotulos) if (!unicos.has(r.codigo)) unicos.set(r.codigo, r);
const recintos = [], t0 = Date.now();
for (const [codigo, rot] of unicos) {
  const fila = porCodigo.get(codigo), rombo = conRombo.get(codigo);
  const superficie = fila?.area?.replace(/\s*m(²|2)/, '').trim() || rot.superficie || null, declarada = numero(superficie);
  const valores = rombo ? rombo.valores : fila ? {M1: fila.M1, M2: fila.M2, M3: fila.M3, M4: fila.M4, CIE: fila.CIE, PAV: fila.PAV} : {};
  const c = contorno(rot.p, declarada);
  recintos.push({codigo, nombre: fila?.name?.trim() || rot.nombre || 'Sin nombre en la lámina', superficie: superficie || '', lamina: rot.lamina, p: rot.p,
    valores, monografia: rombo ? 'rombo' : fila ? 'pma' : 'ninguna', enPma: !!fila, ...c});
}
const resumen = {recintos: recintos.length, contornos: recintos.filter(r => r.estado === 'ok').length, parciales: recintos.filter(r => r.estado === 'parcial').length, auxiliares: recintos.filter(r => r.estado === 'auxiliar').length,
  sinPma: recintos.filter(r => !r.enPma).map(r => r.codigo), pmaSinRotulo: [...porCodigo.keys()].filter(c => !unicos.has(c)).length, segundos: Math.round((Date.now() - t0) / 1000),
  motivos: Object.entries(recintos.filter(r => r.motivo).reduce((a, r) => { const k = r.motivo.replace(/\(.*\)/, '').trim(); a[k] = (a[k] || 0) + 1; return a; }, {}))};
fs.writeFileSync(path.join(repo, 'data', nivel, 'recintos.json'), JSON.stringify({nota: 'Recintos del nivel leídos de las láminas DWG. Coordenadas en cm del modelo; contorno por relleno desde el rótulo.', resumen, recintos}));
console.log(JSON.stringify(resumen));
