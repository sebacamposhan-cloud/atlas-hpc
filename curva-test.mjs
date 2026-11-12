import assert from 'node:assert/strict';
import fs from 'node:fs';
import {curvaReal, resumenCurva} from './dist/curva-avance.mjs';
import {newMarking, validateMarking, marcarEliminado} from './dist/marking-model.mjs';

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
assert.ok(!progreso.includes('progressEjemplo') && !fs.readFileSync('dist/curva-avance.mjs', 'utf8').includes('Ejemplo'), 'Avance no muestra datos de ejemplo');
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'curva-avance.mjs'"));
console.log('curva-test: ok');
