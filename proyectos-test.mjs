import assert from 'node:assert/strict';
import {newMarking, validateMarking, addMarkedRoom, removeMarkedRoom, upgradeMarking, setEstados, addCut, removeCut, compareCuts, markingItems, actual, PLANTILLAS, CAMBIOS, MAX_ESTADOS} from './dist/marking-model.mjs';

// Proyectos sobre los documentos de marcado: leyenda de estados, pintado por estado, cortes con fecha y comparación.
const datos = {name: 'Pisos vinílicos', author: 'QA', purpose: 'Levantamiento de vinílicos instalados'}, source = {code: 'HPC-ARQ-PLA-N01-A-501', revision: 'Rev01_V3'};
const room = (id, code) => ({id, code, name: 'Recinto ' + code});
const [a, b, c] = [room('ra', '5.1-1'), room('rb', '5.2-1'), room('rc', '5.3-1')];

// Un documento antiguo (esquema 1) sigue siendo válido y se lleva al esquema 2 con un estado «Marcado» de su color.
const antiguo = {schema: 1, specialty: 'architecture', id: 'doc-1', level: 'N01', ...datos, color: '#aa3300', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', version: 3, nextNumber: 2,
  rooms: [{id: 'ra', code: '5.1-1', name: 'Recinto 5.1-1', source: source.code, revision: source.revision, number: 1}]};
assert.equal(validateMarking(antiguo), antiguo);
const mejorado = upgradeMarking(antiguo);
assert.equal(mejorado.schema, 2); assert.equal(mejorado.version, 3, 'la conversión no cambia la versión guardada');
assert.deepEqual(mejorado.estados, [{id: 'marcado', nombre: 'Marcado', color: '#aa3300'}]); assert.equal(mejorado.rooms[0].estado, 'marcado');

// Proyecto con la plantilla de avance: el pincel decide el estado; repetir el mismo estado no cambia nada; otro estado conserva el número.
let p = newMarking({...datos, estados: PLANTILLAS.avance}, 'N01', 'p1');
assert.deepEqual(p.estados.map(e => e.nombre), ['Pendiente', 'En ejecución', 'Terminado']);
p = addMarkedRoom(p, a, source, 'terminado'); p = addMarkedRoom(p, b, source, 'ejecucion'); p = addMarkedRoom(p, c, source);
assert.deepEqual(p.rooms.map(r => [r.number, r.estado]), [[1, 'terminado'], [2, 'ejecucion'], [3, 'pendiente']], 'sin estado indicado se usa el primero de la leyenda');
assert.equal(addMarkedRoom(p, a, source, 'terminado'), p, 'tocar con el mismo estado no cambia el proyecto');
assert.equal(addMarkedRoom(p, a, source), p, 'tocar sin estado un recinto ya pintado no lo cambia');
assert.deepEqual(addMarkedRoom(p, a, source, 'pendiente').rooms.find(r => r.id === 'ra'), {...p.rooms[0], estado: 'pendiente'}, 'cambiar el estado conserva el número');
assert.throws(() => addMarkedRoom(p, room('rx', '9-1'), source, 'inventado'), /leyenda/);

// Leyenda: nombres y colores obligatorios, sin repetidos y con máximo de estados; quitar un estado lleva sus recintos al primero.
assert.throws(() => setEstados(p, []), /entre 1 y/);
assert.throws(() => setEstados(p, [{id: 'x', nombre: 'A', color: '#000000'}, {id: 'y', nombre: ' a ', color: '#111111'}]), /repetidos/);
assert.throws(() => setEstados(p, [{id: 'x', nombre: 'A', color: 'red'}]), /incompleto/);
assert.throws(() => setEstados(p, Array.from({length: MAX_ESTADOS + 1}, (_, i) => ({id: 'e' + i, nombre: 'E' + i, color: '#000000'}))), /entre 1 y/);
const sinEjecucion = setEstados(p, [PLANTILLAS.avance[0], PLANTILLAS.avance[2]]);
assert.equal(sinEjecucion.rooms.find(r => r.id === 'rb').estado, 'pendiente'); assert.equal(sinEjecucion.color, PLANTILLAS.avance[0].color);

// Cortes: guardan los estados del momento; los cambios posteriores no los alteran.
p = addCut(p, {id: 'c-sep', nombre: 'Cierre septiembre', fecha: '2026-09-30', autor: 'QA', at: '2026-09-30T20:00:00.000Z'});
assert.throws(() => addCut(p, {id: 'c-mal', nombre: 'Sin fecha', fecha: '', autor: 'QA'}), /Corte mal registrado/);
assert.throws(() => addCut(p, {id: 'c-mal', nombre: ' ', fecha: '2026-10-01', autor: 'QA'}), /Corte mal registrado/);
p = addMarkedRoom(p, c, source, 'terminado'); p = addMarkedRoom(p, b, source, 'pendiente'); p = addMarkedRoom(p, room('rd', '5.4-1'), source, 'ejecucion'); p = removeMarkedRoom(p, 'ra');
assert.deepEqual(p.cortes[0].rooms.map(r => r.estado), ['terminado', 'ejecucion', 'pendiente'], 'el corte no cambia con el avance posterior');
const oct = addCut(p, {id: 'c-oct', nombre: 'Cierre octubre', fecha: '2026-10-31', autor: 'QA', at: '2026-10-31T20:00:00.000Z'});
assert.deepEqual(oct.cortes.map(x => x.id), ['c-sep', 'c-oct']); assert.deepEqual(removeCut(oct, 'c-sep').cortes.map(x => x.id), ['c-oct']);

// Comparación con el orden de la leyenda: avanza, sigue igual o retrocede; recintos nuevos avanzan y los quitados retroceden. Totaliza m².
const areas = {ra: 20, rb: 10, rc: 5, rd: 8};
const comp = compareCuts(p.estados, p.cortes[0], actual(p), id => areas[id]);
const cambio = Object.fromEntries(comp.filas.map(f => [f.id, f.cambio]));
assert.deepEqual(cambio, {ra: 'retrocedio', rb: 'retrocedio', rc: 'avanzo', rd: 'avanzo'});
assert.deepEqual(comp.totales, {avanzo: 2, igual: 0, retrocedio: 2});
assert.deepEqual(comp.porEstado.map(e => [e.nombre, e.antes, e.despues, e.m2Antes, e.m2Despues]), [['Pendiente', 1, 1, 5, 10], ['En ejecución', 1, 1, 10, 8], ['Terminado', 1, 1, 20, 5]]);
assert.equal(compareCuts(p.estados, p.cortes[0], p.cortes[0]).totales.igual, 3, 'un corte comparado consigo mismo no cambia');

// Colores en el plano: estado de cada recinto o, al comparar, el tipo de cambio.
assert.deepEqual(markingItems(p).map(x => [x.id, x.color, x.number]), [['rb', '#9aa3ad', 2], ['rc', '#2e9e5b', 3], ['rd', '#d9a21b', 4]]);
assert(markingItems(p, comp).every(x => x.color === CAMBIOS[comp.filas.find(f => f.id === x.id).cambio].color && x.number === null));
console.log(JSON.stringify({checks: 'passed', scope: 'Proyectos: compatibilidad con marcados de un color, leyenda de estados (validación y cambios), pintado por estado con numeración estable, cortes inmutables con fecha, comparación por orden de la leyenda con m² y colores del plano.'}));
