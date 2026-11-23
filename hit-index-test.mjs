// Índice de toques (dist/hit-index.mjs): contornos solapados. Un recinto chico casi entero dentro de otro gana el toque;
// un solape de borde entre vecinos sigue dando dos candidatos (ventana «Elige un recinto»).
import assert from 'node:assert/strict';
import {buildHitIndex} from './dist/hit-index.mjs';

const caja = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const recinto = (id, ...polys) => ({id, rings: polys.map(polygon => ({polygon, holes: []}))});
let pruebas = 0;

// Una estación de enfermería (10 × 10) dentro de una circulación (100 × 40), y una sala vecina que pisa 2 unidades.
const hit = buildHitIndex([recinto('circulacion', caja(0, 0, 100, 40)), recinto('estacion', caja(40, 10, 10, 10)), recinto('sala', caja(98, 0, 30, 40))]);
assert.equal(hit({x: 45, y: 15}), 'estacion'); pruebas++;
assert.deepEqual(hit.candidates({x: 45, y: 15}), ['estacion'], 'el grande que contiene al chico no queda como candidato'); pruebas++;
assert.equal(hit({x: 10, y: 10}), 'circulacion'); pruebas++;
assert.deepEqual(hit.candidates({x: 99, y: 20}).sort(), ['circulacion', 'sala'], 'un solape de borde sigue siendo empate'); pruebas++;
assert.equal(hit({x: 200, y: 200}), null); pruebas++;

// Recinto chico solo en parte dentro (la mitad): no se resuelve solo, queda para la ventana.
const mitad = buildHitIndex([recinto('circulacion', caja(0, 0, 100, 40)), recinto('mesón', caja(90, 10, 20, 10))]);
assert.equal(mitad.candidates({x: 95, y: 15}).length, 2); pruebas++;
assert.equal(mitad.contenido('mesón', 'circulacion'), false); pruebas++;

// Un hueco del contorno grande sigue fuera del grande; el chico gana igual.
const conHueco = buildHitIndex([{id: 'sala', rings: [{polygon: caja(0, 0, 50, 50), holes: [caja(10, 10, 10, 10)]}]}, recinto('mesón', caja(10, 10, 10, 10))]);
assert.deepEqual(conHueco.candidates({x: 15, y: 15}), ['mesón']); pruebas++;

console.log(`Índice de toques: ${pruebas} comprobaciones aprobadas (recinto dentro de otro, borde entre vecinos, huecos).`);
