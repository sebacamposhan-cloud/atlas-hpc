// Paso 2: calcula la transformación afín PDF (pt) -> plano de Atlas del nivel 2.
// Empareja cada código de recinto escrito en el PDF con la posición del mismo recinto en data/n02/plano.json (DWG).
// Ajuste por mínimos cuadrados, repetido descartando etiquetas a más de 2 pt (rótulos dibujados lejos del centro).
// Uso: node scripts/n02-plano/ajuste.mjs  -> data/n02/pdf-a-plano.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8'));
const T = read('data/n02/textos-pdf.json'), P = read('data/n02/plano.json');
// Mismo marco que scripts/import-n02.mjs.
const E = 72 / 2.54 / 50, M = 500, [bx0, by0, bx1, by1] = P.bounds, ox = bx0 - M, oy = by1 + M;
const W = Math.round((bx1 - bx0 + 2 * M) * E * 10) / 10, H = Math.round((by1 - by0 + 2 * M) * E * 10) / 10;
const world = (x, y) => [(x - ox) * E, (oy - y) * E];
const byCode = new Map();
for (const t of T.items) { const s = t.s.trim(); if (/^\d+(\.\d+)+-\d+$/.test(s)) byCode.set(s, [...(byCode.get(s) || []), t]); }
const pairs = P.recintos.filter(r => byCode.get(r.codigo)?.length === 1).map(r => { const t = byCode.get(r.codigo)[0]; return {w: world(...r.p), q: [t.x + t.w / 2, t.y - t.h / 2]}; });

function solve3(A, y) {
  A = A.map(r => r.slice()); y = y.slice();
  for (let i = 0; i < 3; i++) {
    let m = i; for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]]; [y[i], y[m]] = [y[m], y[i]];
    for (let k = i + 1; k < 3; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; y[k] -= f * y[i]; }
  }
  const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) x[i] = (y[i] - A[i].slice(i + 1).reduce((s, a, j) => s + a * x[i + 1 + j], 0)) / A[i][i];
  return x;
}
function fit(ps) {
  const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const p of ps) { const v = [p.q[0], p.q[1], 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) N[i][j] += v[i] * v[j]; bx[i] += v[i] * p.w[0]; by[i] += v[i] * p.w[1]; } }
  return [solve3(N, bx), solve3(N, by)];
}
const apply = (A, q) => [A[0][0] * q[0] + A[0][1] * q[1] + A[0][2], A[1][0] * q[0] + A[1][1] * q[1] + A[1][2]];
const error = (A, p) => Math.hypot(...apply(A, p.q).map((v, i) => v - p.w[i]));
let usados = pairs, A;
for (let k = 0; k < 3; k++) {
  A = fit(usados);
  const tolerancia = 2 * Math.hypot(A[0][0], A[1][0]); // 2 pt del PDF en unidades del plano
  usados = pairs.filter(p => error(A, p) < tolerancia);
}
const cm = pairs.map(p => error(A, p) / E).sort((a, b) => a - b), pct = q => +cm[Math.floor(cm.length * q)].toFixed(1);
const salida = {pdfToWorld: A, width: W, height: H, pdf: [T.width, T.height],
  control: {recintosEmparejados: pairs.length, usadosEnElAjuste: usados.length, errorCm: {mediana: pct(.5), p75: pct(.75), p90: pct(.9)}}};
fs.writeFileSync(path.join(repo, 'data/n02/pdf-a-plano.json'), JSON.stringify(salida, null, 1));
console.log(JSON.stringify(salida.control));
if (salida.control.errorCm.mediana > 15) { console.error('El PDF no calza con el DWG (mediana > 15 cm). Revisa la fuente antes de renderizar.'); process.exit(1); }
