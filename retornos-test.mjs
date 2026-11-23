// Recintos con retorno vinílico por piso (scripts/planos/retornos-recintos.py) y su contorno magenta en Pavimentos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pisos = fs.readFileSync('dist/pisos.js', 'utf8');
const rutas = [...pisos.matchAll(/retornos: '(n0\d)\/retornos\.json'/g)].map(m => m[1]);
assert.deepEqual(rutas, ['n01', 'n02', 'n03', 'n04']);
assert.ok(!/retornos-map/.test(pisos), 'la lámina de retornos ya no se muestra: solo sus recintos');
for (const n of rutas) {
  const j = JSON.parse(fs.readFileSync(`dist/${n}/retornos.json`, 'utf8'));
  const ids = new Set(JSON.parse(fs.readFileSync(`dist/${n}/runtime.json`, 'utf8')).catalog.rows.map(r => r[0]));
  assert.equal(j.nivel, n.toUpperCase());
  assert.ok(j.recintos.length >= 20, n + ': recintos con retorno');
  assert.equal(new Set(j.recintos).size, j.recintos.length);
  for (const id of j.recintos) assert.ok(ids.has(id), n + ': ' + id + ' no es un recinto del piso');
}
// Pavimentos en pisos sin láminas propias es la capa PAV sobre Arquitectura; la casilla enciende el contorno magenta.
const app = fs.readFileSync('dist/app.js', 'utf8'), disc = fs.readFileSync('dist/disciplines.mjs', 'utf8'), ws = fs.readFileSync('dist/workspace.mjs', 'utf8');
assert.ok(disc.includes("next==='floors'&&!nivel.especialidades?'PAV'"));
assert.ok(app.includes("const ruta=tipo==='fire'?nivel.planos?.comp:null;"));
assert.ok(app.includes('retornoContorno') && app.includes('stroke="#e6007e"'));
assert.ok(ws.includes('Recintos con retorno') && ws.includes('data-legend-key'));
// Sin conexión: la lista va en la base, con las fichas del piso.
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes('cielos|retornos)\\.json'));
console.log('retornos-test: ok (' + rutas.map(n => n + ' ' + JSON.parse(fs.readFileSync(`dist/${n}/retornos.json`, 'utf8')).recintos.length).join(', ') + ')');
