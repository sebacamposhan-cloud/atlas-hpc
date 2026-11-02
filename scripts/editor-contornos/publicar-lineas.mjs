// Publica las líneas del DWG que usa el editor de contornos para engancharse a muros, puertas, ventanas y pilares:
// data/<nivel>/barreras.json (fuera de git, unos 6 MB por piso) → dist/editor-contornos/barreras/<nivel>.json, sin tramos
// de largo cero ni repetidos, redondeado al centímetro y con el marco del piso (cm del DWG → unidades del plano).
// En el −1 el marco sale del calce de data/s01/ajuste.json. Uso: node scripts/editor-contornos/publicar-lineas.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), salida = path.join(repo, 'dist/editor-contornos/barreras');
fs.mkdirSync(salida, {recursive: true});
for (const nivel of ['s01', 'n01', 'n02', 'n03']) {
  const origen = path.join(repo, 'data', nivel, 'barreras.json');
  if (!fs.existsSync(origen)) { console.log(nivel, 'sin barreras.json: se conserva la publicación anterior'); continue; }
  const marco = JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, 'marco.json'), 'utf8')), vistos = new Set(), tramos = [];
  for (const t of JSON.parse(fs.readFileSync(origen, 'utf8'))) {
    const [ax, ay, bx, by] = t.map(Math.round);
    if (ax === bx && ay === by) continue;
    const k = ax < bx || (ax === bx && ay <= by) ? `${ax},${ay},${bx},${by}` : `${bx},${by},${ax},${ay}`;
    if (vistos.has(k)) continue; vistos.add(k); tramos.push(ax, ay, bx, by);
  }
  const archivo = path.join(salida, nivel + '.json');
  fs.writeFileSync(archivo, JSON.stringify({formato: 'atlas-barreras-v1', nivel, marco: {escala: marco.escala, ox: marco.ox, oy: marco.oy}, tramos}));
  console.log(nivel, tramos.length / 4, 'tramos ·', (fs.statSync(archivo).size / 1048576).toFixed(2), 'MB');
}
