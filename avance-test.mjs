import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {decodePma} from './dist/pma-model.mjs';
import * as M from './dist/avance-model.mjs';

// Itemizado sintético con la estructura del Formulario n°11A (precios inventados: el real no se publica).
const XLSX = createRequire(import.meta.url)('./dist/vendor/xlsx.full.min.js');
const ws = {};
const put = (c, r, v) => { ws[c + r] = {v, t: typeof v === 'number' ? 'n' : 's'}; };
put('A', 6, 'ITEM'); put('B', 6, 'DESCRIPCIÓN'); put('C', 6, 'UNIDAD'); put('AZ', 6, 'CANTIDAD REAL A EJECUTAR'); put('BA', 6, 'PRECIO UNITARIO'); put('BB', 6, 'IMPORTE TOTAL');
const filas = [['6.1', 'PAVIMENTOS', ''], ['6.1.4.6', 'Pavimento caucho virgen 3 MM', 'm2', 1000, 500, 300, 1000], ['6.1.2.1', 'Baldosa', 'm2', 2000, 0, 0, 100],
  ['6.3.3', 'Cielo yeso-cartón húmedos', 'm2', 900, 0, 0, 200], ['6.9.3', 'Otro', 'gl', 0, 0, 0, 1], ['6.4.2.1', 'Asepsia baja en cielos', 'm2', 300, 0, 0, 50], // 6.4.2.1 fuera de orden
  ['6.4.2.2', 'Asepsia media en cielos', 'm2', 300, 0, 0, 60], ['6.4.3.9', 'Ítem eliminado por modificación', 'm2', 5, 0, 0, 9], ['4.3.1', 'Bajo pavimentos de recintos húmedos', 'm2', 100, 0, 0, 70],
  ['6.5.1.1', 'Puerta simple abatir 70', 'un', 3, 0, 0, 90000], ['7.1.1', 'Artefacto', 'un', 2, 0, 0, 10]];
filas.forEach(([code, desc, unit, k = 0, ab = 0, ar = 0, ba = 0], i) => { const r = 7 + i; put('A', r, code); put('B', r, desc); if (unit) put('C', r, unit); put('K', r, k); put('AB', r, ab); put('AR', r, ar); put('BA', r, ba); });
ws['!ref'] = 'A1:BG' + (7 + filas.length);
const libro = {SheetNames: ['Formulario n°11A'], Sheets: {'Formulario n°11A': ws}};
const {items, titulos} = M.leerItemizado(libro, XLSX);
assert.equal(items.get('6.1.4.6').p1, 1800, 'cantidad del piso −1 = K + AB + AR');
assert.equal(items.get('6.1.4.6').pu, 1000, 'precio unitario de la columna BA');
assert(items.has('6.4.2.1') && !items.has('6.4.3.9'), 'se identifica por ITEM aunque esté desordenado y se ignoran los eliminados');
assert(titulos.has('6.1') && !items.has('6.1'), 'las filas sin unidad son títulos');
assert(items.get('6.5.1.1').piloto && items.get('7.1.1').posterior, 'capítulos del piloto y posteriores');
assert.throws(() => M.leerItemizado({SheetNames: ['Otra'], Sheets: {Otra: {}}}, XLSX), /Formulario/);
const dup = {...ws}; dup.A30 = {v: '6.1.4.6', t: 's'}; dup.C30 = {v: 'm2', t: 's'}; dup['!ref'] = 'A1:BG30';
assert.throws(() => M.leerItemizado({SheetNames: ['Formulario n°11A'], Sheets: {'Formulario n°11A': dup}}, XLSX), /repetido/);

// Enlace recinto → partidas con el PMA real.
const pma = decodePma(JSON.parse(fs.readFileSync('dist/pma/catalog.json', 'utf8')));
const n1 = pma.main.filter(r => r.level === 'A-S01');
const caucho = n1.find(r => r.PAV === '108'), {nodos} = M.nodosRecinto(caucho, items);
const pav = nodos.find(n => n.id === '6.1.4.6');
assert.equal(pav.cantidad, M.area(caucho), 'cantidad = superficie del PMA');
assert.deepEqual(pav.prereq, ['P-NIV-RES'], 'caucho ← nivelación de pavimentos resilientes');
assert.deepEqual(nodos.find(n => n.id === 'P-NIV-RES').prereq, ['2.6'], 'nivelación ← sobrelosa');
const humedo = n1.find(r => r.CIE === '202' && r.PAV === '101');
if (humedo) assert.deepEqual(M.nodosRecinto(humedo, items).nodos.find(n => n.id === '6.1.2.1').prereq, ['4.3.1'], 'baldosa en recinto húmedo ← impermeabilización');
const pintado = n1.find(r => ['11', '12'].includes(r.M1)), np = M.nodosRecinto(pintado, items).nodos;
assert(np.find(n => n.id === '6.2.2').prereq.includes('5.1') && np.find(n => n.id === '5.1').prereq.includes('5.3'), 'pintura ← empaste ← tabique ← sellos');
assert.equal(np.find(n => /^6\.4\.1\./.test(n.id)).cantidad, null, 'muros sin m² por recinto: no se valorizan');

// Reglas del checklist.
const v = (estado, pct, conformidad = 'Sin revisar', extra = {}) => ({estado, pct, conformidad, falta: '', obs: [], ...extra});
assert(M.validarPartida(pav, v('No iniciado', 10)).length, 'No iniciado es 0 %');
assert(M.validarPartida(pav, v('En ejecución', 100)).length, 'En ejecución exige 1–99 %');
assert(M.validarPartida(pav, v('Observado', 40)).length, 'Observado exige observación');
assert.equal(M.validarPartida(pav, v('Observado', 40, 'No conforme', {obs: [{fecha: '2026-10-27', autor: 'QA', texto: 'Burbujas'}]})).length, 0);
assert(M.validarPartida(pav, v('Aprobado', 100, 'Conforme'), [{item: 'P-NIV-RES'}]).join().includes('no puede quedar aprobada'), 'protocolo previo no liberado bloquea la aprobación');
assert.equal(M.validarPartida(pav, v('Aprobado', 100, 'Conforme'), []).length, 0);

// Valorización y estados de recinto.
const reg = {key: M.keyFor(caucho.code), code: caucho.code.trim(), level: 'N-1', version: 1, at: new Date().toISOString(), responsable: 'QA', fecha: '2026-10-27',
  protocolos: {'P-NIV-RES': {estado: 'Pendiente'}}, partidas: {'6.1.4.6': v('En ejecución', 50), '2.6': v('Aprobado', 100, 'Conforme')}};
assert.deepEqual(M.validarRegistro(reg, nodos), []);
const rep = M.reporteAvance(pma, items, [reg]), fila = rep.filas.find(f => f.code === caucho.code.trim()), nodo = fila.nodos.find(n => n.id === '6.1.4.6');
assert.equal(Math.round(nodo.ejecutado), Math.round(M.area(caucho) * .5 * 1000), 'ejecutado = cantidad × % × PU');
assert.equal(fila.estado, 'En curso');
assert(rep.bloqueadas.some(n => n.id === '6.1.4.6'), 'partida con protocolo previo pendiente queda bloqueada');
assert.equal(rep.filas.length, n1.length, 'todos los recintos A-S01 del PMA');
const total = rep.porPartida.find(p => p.id === '6.1.4.6');
assert.equal(Math.round(total.total), Math.round(rep.partidas.filter(n => n.id === '6.1.4.6').reduce((a, n) => a + n.cantidad, 0) * 1000), 'total por partida');
const obs = M.reporteAvance(pma, items, [{...reg, partidas: {...reg.partidas, '6.1.4.6': v('Observado', 50, 'No conforme', {falta: 'Sello perimetral'})}}]);
assert.equal(obs.filas.find(f => f.code === caucho.code.trim()).estado, 'Observado');
const rev = M.revision(rep, items);
assert(rev.sinVinculo.some(x => x.id === '6.5.1.1'), 'puertas sin vínculo por recinto quedan para revisión');
assert(rev.sinProtocolo.some(x => x.id === '2.6'), 'partidas sin protocolo previo quedan para revisión');
console.log(JSON.stringify({checks: 'passed', recintos: rep.filas.length, partidas: rep.partidas.length, valorizables: rep.piso.valorizables,
  scope: 'Itemizado por código ITEM (desordenado, eliminados, títulos, duplicados), enlace recinto → partidas con PMA real, cadena de protocolos, reglas de estado, valorización, estados de recinto y listas de revisión.'}));
