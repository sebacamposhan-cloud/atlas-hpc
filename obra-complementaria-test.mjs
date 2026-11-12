import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {OBRA_COMPLEMENTARIA, CODIGOS_OBRA_COMPLEMENTARIA, LAMINAS_OBRA_COMPLEMENTARIA, esObraComplementaria, quitarObraComplementaria} from './dist/obra-complementaria.mjs';
import {leerPlanilla, avanceFamilia, totalesPorFamilia} from './dist/planilla-avance-model.mjs';

// −1: la lista es exactamente lo que cae fuera del edificio (al oriente del eje A12), recalculado desde los datos.
const leer = carpeta => decodeRuntime(JSON.parse(fs.readFileSync('dist/' + carpeta + 'runtime.json', 'utf8')));
const enPlano = rt => { const tiles = new Map(rt.atlas.tiles.map(t => [t.id, t.offset || [0, 0]])); return r => { const [x, y] = tiles.get(r.document_id); return [r.position[0] + x, r.position[1] + y]; }; };
const ejeA12 = carpeta => JSON.parse(fs.readFileSync('dist/' + carpeta + 'ejes.json', 'utf8')).ejes.find(e => e.id === 'A12').a[0];
const rt = leer(''), plano = enPlano(rt), [bx, by, bw, bh] = rt.atlas.scope.bounds;
const dentro = r => { const [x, y] = plano(r); return x >= bx && x <= bx + bw && y >= by && y <= by + bh; };
const fuera = rt.data.rooms.filter(r => !dentro(r)), menos1 = OBRA_COMPLEMENTARIA['N-1'];
assert.deepEqual([...new Set(fuera.map(r => r.code.trim()))].sort(), [...menos1.codigos].sort(), 'la lista coincide con los recintos fuera del edificio');
assert.equal(menos1.codigos.length, 66);
assert.ok(fuera.every(r => plano(r)[0] > ejeA12('')), 'todo el anexo queda al oriente del eje A12');
assert.ok(rt.data.rooms.filter(dentro).every(r => !esObraComplementaria(r.code)), 'ningún recinto del edificio se quita');
assert.ok(rt.data.rooms.filter(r => menos1.laminas.includes(r.document_id)).every(r => !dentro(r)), 'la lámina A-509 es entera del anexo');
assert.equal(rt.data.documents.find(d => d.id === menos1.laminas[0]).code, 'HPC-ARQ-PLA-S01-A-509');

// Piso 1: la lámina A-510 completa (casetas de guardia y central de gases), lejos al oriente del A12.
const rt1 = leer('n01/'), plano1 = enPlano(rt1), uno = OBRA_COMPLEMENTARIA.N01;
const de510 = rt1.data.rooms.filter(r => r.document_id === 'n01-a510');
assert.deepEqual(de510.map(r => r.code.trim()).sort(), [...uno.codigos].sort());
assert.ok(de510.every(r => plano1(r)[0] > ejeA12('n01/') + 5000), 'a más de 5000 unidades (unos 90 m) del A12');
assert.ok(rt1.data.rooms.filter(r => r.document_id !== 'n01-a510').every(r => !esObraComplementaria(r.code) && plano1(r)[0] < ejeA12('n01/') + 600));
assert.equal(rt1.data.documents.find(d => d.id === 'n01-a510').code, 'HPC-ARQ-PLA-N01-A-510');
// El ámbito del piso 1 se acota a las láminas A-501 a A-508, con el mismo margen que el piso 2.
const atlas1 = structuredClone(rt1.atlas), [ax, ay, aw, ah] = uno.alcance.bounds;
const hasta = (ids, f) => Math.max(...rt1.atlas.tiles.filter(t => ids(t.id)).map(f));
assert.ok(Math.abs(ax + aw - hasta(id => id !== 'n01-a510', t => t.clip[0] + t.clip[2])) < 0.1);
assert.ok(Math.abs(ay + ah - hasta(id => id !== 'n01-a510', t => t.clip[1] + t.clip[3])) < 0.1);
assert.deepEqual(uno.alcance.view.map(v => Math.round(v * 10)), [0, 0, ax + aw + 283.5, ay + ah + 283.5].map(v => Math.round(v * 10)));
assert.ok(rt1.data.rooms.filter(r => r.document_id !== 'n01-a510').every(r => { const [x, y] = plano1(r); return x >= ax && x <= ax + aw && y >= ay && y <= ay + ah; }), 'todo el hospital queda dentro del nuevo ámbito');

// Al cargar el piso se quitan recintos y láminas (y en el piso 1 se acota el ámbito); el 2 y el 3 no cambian.
for (const [carpeta, nivel, obra, filas] of [['', 'N-1', menos1, fuera.length], ['n01/', 'N01', uno, de510.length]]) {
  const r = leer(carpeta), antes = r.data.rooms.length, atlas = structuredClone(r.atlas);
  quitarObraComplementaria(r.data, nivel, atlas);
  assert.equal(r.data.rooms.length, antes - filas);
  assert.ok(!r.data.rooms.some(x => esObraComplementaria(x.code)) && !r.data.documents.some(d => obra.laminas.includes(d.id)));
  if (obra.alcance) assert.deepEqual(atlas.scope.bounds, obra.alcance.bounds); else assert.deepEqual(atlas.scope, r.atlas.scope);
}
for (const piso of ['n02', 'n03']) {
  const otro = leer(piso + '/'), n = otro.data.rooms.length, alcance = structuredClone(otro.atlas.scope);
  assert.equal(quitarObraComplementaria(otro.data, piso.toUpperCase(), otro.atlas).rooms.length, n);
  assert.deepEqual(otro.atlas.scope, alcance);
  assert.ok(!otro.data.rooms.some(r => esObraComplementaria(r.code)), piso + ': sin códigos del anexo');
}
assert.deepEqual(LAMINAS_OBRA_COMPLEMENTARIA, ['509-62864a89', 'n01-a510']);
assert.equal(CODIGOS_OBRA_COMPLEMENTARIA.size, 71);
assert.equal(esObraComplementaria(' 9.1.3.1.6-1 '), true);
assert.equal(esObraComplementaria('3.1.4.1.1-1'), false);

// Planillas: las filas del anexo no se leen ni se cuentan, aunque vengan en una planilla ya guardada.
const fila = (largo, celdas) => { const r = Array(largo).fill(null); for (const [c, v] of Object.entries(celdas)) r[Number(c)] = v; return r; };
const hoja = [[], [], fila(26, {18: 'ESTRUCTURA', 22: 'TAPADO'}),
  fila(26, {0: 'ITEM', 2: 'PMA', 3: 'NIVEL', 9: 'CÓDIGO RECINTO', 16: 'AREA', 18: 'UNI', 19: 'AVANCE PARCIAL (%)', 22: 'UNI', 23: 'AVANCE PARCIAL (%)'}),
  ...[1, 2, 3, 4, 5, 6, 7, 12].map(i => fila(26, {0: i, 2: `CT.F.(-1)-${i}`, 3: ' S01', 16: 10, 19: 1, 23: i > 3 ? 1 : 0}))];
const p = leerPlanilla([{nombre: 'CIELO MODULAR', aoa: hoja}], {conocidos: new Set([1, 2, 3, 4, 5, 6, 7, 12].map(i => `CT.F.(-1)-${i}`)), archivo: 'x.xlsx'});
assert.ok('CT.F.(-1)-1' in p.recintos, 'el edificio sí se lee');
assert.ok(!('CT.F.(-1)-12' in p.recintos), 'el anexo no entra al leer la planilla');
const fam = Object.keys(p.recintos['CT.F.(-1)-1'])[0], guardada = {...p, recintos: {...p.recintos, 'CT.F.(-1)-12': {[fam]: [1, 99, [1, 1]]}}};
assert.ok(!avanceFamilia(guardada, fam).filas.some(f => f.code === 'CT.F.(-1)-12') && avanceFamilia(guardada, fam).filas.length === 7, 'una planilla guardada antes tampoco lo muestra');
assert.equal(totalesPorFamilia(guardada).find(t => t.familia === fam).recintos, 7);

// Índice de pisos y módulo sin conexión.
const indice = JSON.parse(fs.readFileSync('dist/progress-room-levels.json', 'utf8'));
assert.ok(![...CODIGOS_OBRA_COMPLEMENTARIA].some(c => c in indice.rooms), 'progress-room-levels.json sin el anexo (node scripts/prepare-progress-scope.mjs)');
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'obra-complementaria.mjs'"));
assert.ok(fs.readFileSync('dist/app.js', 'utf8').includes('quitarObraComplementaria(state,nivel.id,runtime.atlas)') && fs.readFileSync('dist/app.js', 'utf8').includes('quitarObraComplementaria(next,levelId,runtime.atlas)'));
console.log('obra-complementaria-test: ok');
