import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registrosEjemplo, curvaEjemplo, curvaReal, resumenCurva} from './dist/curva-avance.mjs';
import {newMarking, validateMarking, marcarEliminado} from './dist/marking-model.mjs';

// Muestra para gerencia: repetible, válida y separada de lo real.
const rooms = Array.from({length: 60}, (_, i) => ({code: 'R-' + i, sector: 'ABC'[i % 3]}));
const tareas = room => room.code === 'R-0' ? [] : [{field: 'PAV', code: '105', applicable: true, documented: true}, {field: 'CIE', code: '203', applicable: true, documented: true}, {field: 'M1', code: '11', applicable: true, documented: true}, {field: 'M2', code: '11', applicable: true, documented: true}, {field: 'M3', code: 'N/A', applicable: false, documented: false}];
const datos = {rooms, tareas, level: 'N02', sha: 'abc', hoy: '2026-11-03'}, a = registrosEjemplo(datos), b = registrosEjemplo(datos);
assert.deepEqual(a, b, 'la muestra sale igual cada vez');
assert.equal(a.length, 59, 'un recinto sin partidas no lleva registro');
assert.ok(a.every(r => r.responsible === 'Datos de ejemplo' && r.key === 'N02|' + r.code && r.sourceSha === 'abc' && r.level === 'N02'));
assert.ok(a.every(r => Object.keys(r.fields).length === 4 && !('M3' in r.fields)), 'solo las partidas que aplican');
assert.ok(a.every(r => r.fields.M1.installation === r.fields.M2.installation), 'los muros avanzan juntos');
const estados = a.flatMap(r => Object.values(r.fields));
assert.ok(estados.every(f => f.quality === 'Sin revisar' || f.installation === 'Instalado'), 'solo lo instalado se revisa');
for (const e of ['Instalado', 'En proceso', 'No iniciado']) assert.ok(estados.some(f => f.installation === e), e);
for (const q of ['Conforme', 'Con observaciones']) assert.ok(estados.some(f => f.quality === q), q);
const instaladoEn = s => { const f = a.filter(r => rooms.find(x => x.code === r.code).sector === s).flatMap(r => Object.values(r.fields)); return f.filter(x => x.installation === 'Instalado').length / f.length; };
assert.ok(instaladoEn('A') > instaladoEn('C'), 'los primeros sectores van más avanzados');

// Curva de muestra: creciente, llega al avance de hoy, va bajo el programa y el programa termina en 100.
const curva = curvaEjemplo(52.4, '2026-11-03'), hoy = resumenCurva(curva);
assert.equal(curva.length, 21);
assert.equal(curva[0].fecha, '2026-08-04');
assert.equal(curva.at(-1).fecha, '2026-12-22');
assert.equal(hoy.fecha, '2026-11-03');
assert.equal(hoy.real, 52.4);
assert.equal(hoy.programado, 59.4);
assert.equal(hoy.brecha, -7);
assert.equal(curva.at(-1).programado, 100);
assert.equal(curva.at(-1).real, null);
for (const campo of ['programado', 'real']) { const v = curva.map(p => p[campo]).filter(x => x !== null); assert.ok(v.every((x, i) => !i || x >= v[i - 1]), campo + ' no retrocede'); }
assert.ok(curva.every(p => p.real === null || p.real <= p.programado), 'la muestra va bajo el programa');
assert.equal(resumenCurva(curvaEjemplo(99, '2026-11-03')).programado, 100, 'el programa no pasa de 100');

// Curva real: acumula por fecha de registro y sin programa no inventa línea.
assert.deepEqual(curvaReal([], 10, '2026-11-03'), []);
assert.deepEqual(curvaReal(['2026-11-03'], 0, '2026-11-03'), []);
const real = curvaReal(['2026-10-20', '2026-10-20', '2026-11-01', '2026-11-03'], 8, '2026-11-03');
assert.equal(real.at(-1).real, 50);
assert.equal(real.at(-1).fecha, '2026-11-03');
assert.equal(real[0].real, 0);
assert.ok(real.every(p => p.programado === null));
assert.ok(real.every((p, i) => !i || p.real >= real[i - 1].real));
assert.equal(resumenCurva(real).brecha, null);
assert.equal(resumenCurva([]), null);
assert.equal(curvaReal(['2026-11-03'], 4, '2026-11-03').at(-1).real, 25, 'un solo día alcanza para dibujar');

// Eliminar proyecto: nueva versión con marca, válida para la nube y para otros equipos.
const doc = newMarking({name: 'Prueba', author: 'Responsable', purpose: 'Verificar', color: '#2874c7'}, 'N-1', 'doc-1');
const quitado = marcarEliminado(doc, {autor: 'Mauro', at: '2026-11-03T12:00:00.000Z'});
assert.deepEqual(quitado.eliminado, {at: '2026-11-03T12:00:00.000Z', autor: 'Mauro'});
assert.equal(quitado.version, doc.version + 1);
assert.equal(quitado.updatedAt, '2026-11-03T12:00:00.000Z');
assert.equal(doc.eliminado, undefined, 'no cambia el documento original');
validateMarking(quitado);

// La gráfica y el panel: sin asepsia y con la curva junto al trabajo pendiente por sector.
const avance = fs.readFileSync('dist/avance.mjs', 'utf8'), progreso = fs.readFileSync('dist/room-progress.mjs', 'utf8');
assert.ok(!avance.includes('Avance físico por nivel de asepsia'));
assert.ok(progreso.indexOf('Trabajo pendiente por sector') < progreso.indexOf('id="progressCurva"'));
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'curva-avance.mjs'"));
console.log('curva-test: ok');
