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
const caucho = n1.find(r => r.PAV === '108' && r.CIE !== '202'), {nodos} = M.nodosRecinto(caucho, items);
const pav = nodos.find(n => n.id === '6.1.4.6');
assert.equal(pav.cantidad, M.area(caucho), 'cantidad = superficie del PMA');
assert.deepEqual(pav.prereq, ['P-NIV-RES'], 'caucho ← nivelación de pavimentos resilientes');
assert.deepEqual(nodos.find(n => n.id === 'P-NIV-RES').prereq, ['2.6'], 'nivelación ← sobrelosa');
assert.deepEqual(nodos.find(n => n.id === '2.6').prereq, ['P-SOBRELOSA'], 'sobrelosa ← trabajos previos y reparación de sobrelosa');
const humedo = n1.find(r => r.CIE === '202' && r.PAV === '101');
if (humedo) assert.deepEqual(M.nodosRecinto(humedo, items).nodos.find(n => n.id === '6.1.2.1').prereq, ['4.3.1'], 'baldosa en recinto húmedo ← impermeabilización');
// Decisión 27-10-2026: todo recinto con cielo 202 lleva 4.3.1, también bajo pavimentos resilientes.
const humedoVinilico = n1.find(r => r.CIE === '202' && ['104', '105', '106', '107', '108'].includes(r.PAV)), nh = M.nodosRecinto(humedoVinilico, items).nodos;
assert.equal(nh.find(n => n.id === '4.3.1').cantidad, M.area(humedoVinilico), '4.3.1 con la superficie del recinto húmedo');
assert(nh.some(n => n.tipo === 'partida' && /^6\.1\.4\./.test(n.id) && n.prereq.includes('4.3.1') && n.prereq.includes('P-NIV-RES')), 'vinílico en recinto húmedo ← impermeabilización y nivelación');
const conPav = n1.filter(r => r.CIE === '202' && M.nodosRecinto(r, items).nodos.some(n => n.id === '2.6'));
assert.equal(conPav.filter(r => M.nodosRecinto(r, items).nodos.some(n => n.id === '4.3.1')).length, conPav.length, 'todos los recintos con cielo 202 y pavimento llevan 4.3.1');
const pintado = n1.find(r => ['11', '12'].includes(r.M1)), np = M.nodosRecinto(pintado, items).nodos;
assert(np.find(n => n.id === '6.2.2').prereq.includes('5.3') && np.find(n => n.id === '5.3').prereq.includes('5.1') && !np.find(n => n.id === '5.1').prereq.length, 'pintura ← empaste ← sellos ← tabique (inicia la cadena)');
assert.equal(np.find(n => /^6\.4\.1\./.test(n.id)).cantidad, null, 'muros sin m² por recinto: no se valorizan');

// Reglas de una partida en dos filas (ejecución y revisión), como el rombo. Solo estados: no se exige texto.
const d = (ejecucion, revision = 'Sin revisar', pct = ejecucion === 'Instalado' ? 100 : ejecucion === 'No iniciado' ? 0 : null) => ({ejecucion, revision, pct});
assert(M.validarPartida(pav, {...d('No iniciado'), pct: 10}).length, 'No iniciado es 0 %');
assert(M.validarPartida(pav, {...d('En ejecución'), pct: 100}).length, 'en ejecución el % va de 1 a 99');
assert.equal(M.validarPartida(pav, d('En ejecución')).length, 0, 'en ejecución con el % aún sin indicar');
assert.equal(M.validarPartida(pav, d('En ejecución', 'Con observaciones', 40)).length, 0, 'con observaciones no exige texto');
assert(M.validarPartida(pav, d('En ejecución', 'Conforme', 40)).join().includes('instalada'), 'conforme exige instalada');
assert(M.validarPartida(pav, d('Instalado', 'Conforme'), [{item: 'P-NIV-RES'}]).join().includes('falta liberar'), 'protocolo previo no liberado impide quedar conforme');
assert.equal(M.validarPartida(pav, d('Instalado', 'Conforme'), []).length, 0);
// Los registros de la escala anterior (estado, % y conformidad) se leen en dos filas.
const v = (estado, pct, conformidad = 'Sin revisar', extra = {}) => ({estado, pct, conformidad, falta: '', obs: [], ...extra});
assert.deepEqual(M.dosFilas(v('Aprobado', 100, 'Conforme')), d('Instalado', 'Conforme'));
assert.deepEqual(M.dosFilas(v('Observado', 40, 'No conforme')), d('En ejecución', 'Con observaciones', 40));
assert.deepEqual(M.dosFilas(v('En ejecución', 30, 'Conforme')), d('En ejecución', 'Sin revisar', 30), 'conforme sin instalar no se conserva');
assert.deepEqual(M.dosFilas(null), d('No iniciado'));

// Valorización y estados de recinto.
const reg = {key: M.keyFor(caucho.code), code: caucho.code.trim(), level: 'N-1', version: 1, at: new Date().toISOString(), responsable: 'QA', fecha: '2026-10-27',
  protocolos: {'P-NIV-RES': {estado: 'Pendiente'}, 'P-SOBRELOSA': {estado: 'Liberado'}}, partidas: {'6.1.4.6': v('En ejecución', 50), '2.6': v('Aprobado', 100, 'Conforme')}};
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
assert.deepEqual(rev.sinProtocolo, [], 'con la sobrelosa ligada a su protocolo y el tabique como inicio de cadena, ninguna partida queda sin previo');
assert(M.validarRegistro({...reg, protocolos: {'P-NIV-RES': {estado: 'Pendiente'}}}, nodos).join().includes('falta liberar'), 'sobrelosa conforme exige su protocolo previo liberado');

// Cada toque en el rombo guarda un registro nuevo: cambia solo el nodo tocado, firma la cuenta y conserva lo anterior
// (también lo escrito antes en «qué falta» y observaciones, que ya no se muestra).
const firma = {responsable: 'mauro@hpc.test', fecha: '2026-11-01', at: '2026-11-01T12:00:00Z'}, lugar = {code: caucho.code, level: 'N-1'};
const conTexto = {...reg, partidas: {...reg.partidas, '6.1.4.6': v('En ejecución', 50, 'Sin revisar', {falta: 'Sello', obs: [{fecha: '2026-10-27', autor: 'QA', texto: 'Burbujas'}]})}};
const r2 = M.actualizarNodo(lugar, nodos, conTexto, '6.1.4.6', {ejecucion: 'Instalado'}, firma), p2 = r2.partidas['6.1.4.6'];
assert.deepEqual([r2.version, r2.responsable, r2.fecha, p2.pct, p2.estado, p2.falta, p2.obs.length], [2, 'mauro@hpc.test', '2026-11-01', 100, 'Instalado', 'Sello', 1]);
assert.deepEqual(r2.partidas['2.6'], reg.partidas['2.6'], 'las demás partidas quedan como estaban');
assert.throws(() => M.actualizarNodo(lugar, nodos, r2, '6.1.4.6', {revision: 'Conforme'}, firma), /falta liberar/, 'conforme exige su protocolo previo liberado');
const r3 = M.actualizarNodo(lugar, nodos, r2, 'P-NIV-RES', {estado: 'Liberado'}, firma);
assert.deepEqual([r3.protocolos['P-NIV-RES'].estado, r3.protocolos['P-NIV-RES'].autor], ['Liberado', 'mauro@hpc.test']);
const r4 = M.actualizarNodo(lugar, nodos, r3, '6.1.4.6', {revision: 'Conforme'}, firma);
assert.equal(r4.partidas['6.1.4.6'].estado, 'Aprobado', 'instalada y conforme equivale a aprobada en los indicadores');
const r5 = M.actualizarNodo(lugar, nodos, r4, '6.1.4.6', {ejecucion: 'En ejecución'}, firma);
assert.deepEqual([r5.partidas['6.1.4.6'].revision, r5.partidas['6.1.4.6'].pct], ['Sin revisar', null], 'bajar de instalada quita la conformidad y deja el % por indicar');
assert.equal(M.actualizarNodo(lugar, nodos, r5, '6.1.4.6', {pct: 60}, firma).partidas['6.1.4.6'].pct, 60);
assert.throws(() => M.actualizarNodo(lugar, nodos, r5, '6.1.4.6', {pct: 60}, {...firma, responsable: ' '}), /responsable/);
assert.equal(M.reporteAvance(pma, items, [r5]).filas.find(f => f.code === caucho.code.trim()).nodos.find(n => n.id === '6.1.4.6').m2Ejecutado, 0, 'en ejecución sin % no suma m²');

// El rombo resume las partidas de cada terminación.
const tr = estados => M.estadoTerminacion(estados.map(([ejecucion, revision = 'Sin revisar']) => ({ejecucion, revision, registrada: true})));
assert.equal(M.estadoTerminacion([{ejecucion: 'No iniciado', revision: 'Sin revisar', registrada: false}]), null, 'sin registros propios no se calcula');
assert.deepEqual(tr([['Instalado', 'Conforme'], ['Instalado', 'Conforme']]), {installation: 'Instalado', quality: 'Conforme'});
assert.deepEqual(tr([['Instalado', 'Conforme'], ['En ejecución']]), {installation: 'En proceso', quality: 'Sin revisar'});
assert.deepEqual(tr([['Instalado'], ['No iniciado', 'Con observaciones']]), {installation: 'En proceso', quality: 'Con observaciones'});
assert.deepEqual(tr([['No iniciado'], ['No iniciado']]), {installation: 'No iniciado', quality: 'Sin revisar'});
// Lo marcado antes directo en el rombo pasa a las partidas de la terminación al marcar la primera.
const fila2 = M.reporteAvance(pma, items, []).filas.find(f => f.code === caucho.code.trim()), pavs = M.partidasDeTerminacion(fila2.nodos, 'PAV', fila2.row);
const sembrado = M.sembrarTerminacion(null, fila2.nodos, pavs, {installation: 'Instalado', quality: 'Conforme'});
assert(pavs.length && pavs.every(p => sembrado.partidas[p.id].ejecucion === 'Instalado'), 'instalado pasa a todas');
assert.equal(sembrado.partidas['6.1.4.6'].revision, 'Sin revisar', 'conforme solo donde su protocolo previo está liberado');
assert.deepEqual(M.protocolosDe(fila2.nodos, pavs).map(n => n.id).sort(), ['P-NIV-RES', 'P-SOBRELOSA']);
assert.equal(M.sembrarTerminacion(null, fila2.nodos, pavs, {installation: 'Sin registrar', quality: 'Sin revisar'}), null);

// Panel de avance de la ficha: % del recinto, pavimento, cielo y muros, conformes y protocolos liberados.
const fila4 = M.reporteAvance(pma, items, [r4]).filas.find(f => f.code === caucho.code.trim()), res = M.resumenRecinto(fila4.nodos, fila4.row);
const partidas4 = fila4.nodos.filter(n => n.tipo === 'partida');
assert.equal(res.pct, partidas4.reduce((a, n) => a + n.pct, 0) / partidas4.length, '% del recinto = promedio de sus partidas');
assert.deepEqual(res.grupos.map(g => g.campo), ['PAV', 'CIE', 'M']);
assert.deepEqual([res.grupos[0].pct, res.grupos[0].estado], [100, {installation: 'Instalado', quality: 'Conforme'}], 'sobrelosa y caucho instalados y conformes');
assert.deepEqual([res.conformes, res.protocolos, res.liberados], [2, fila4.nodos.filter(n => n.tipo === 'protocolo').length, 2]);
const muros = res.grupos[2].partidas;
assert.equal(new Set(muros.map(n => n.id)).size, muros.length, 'los muros no repiten sus partidas comunes');
console.log(JSON.stringify({checks: 'passed', recintos: rep.filas.length, partidas: rep.partidas.length, valorizables: rep.piso.valorizables,
  scope: 'Itemizado por código ITEM (desordenado, eliminados, títulos, duplicados), enlace recinto → partidas con PMA real, cadena de protocolos, partidas en dos filas (ejecución y revisión) con lectura de la escala anterior, guardado de un toque con firma, rombo calculado desde las partidas, traspaso de lo marcado antes en el rombo, valorización, estados de recinto y listas de revisión.'}));
