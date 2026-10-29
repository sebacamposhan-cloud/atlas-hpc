// Prueba archivada del semáforo de liberación (estaba en pisos-test.mjs hasta el 28-10-2026).
// Se corre a mano desde la raíz del repo: node archivo/semaforo-liberacion/liberacion-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';
import {leerLibro,calcular} from './liberacion.mjs';

const aqui = new URL('.', import.meta.url), raiz = new URL('../../', import.meta.url);
const XLSX = createRequire(import.meta.url)('../../dist/vendor/xlsx.full.min.js');
const ejemplo = leerLibro(XLSX.read(fs.readFileSync(new URL('datos-ejemplo.xlsx', aqui)), {type: 'buffer', cellDates: true}), XLSX);
assert(ejemplo.solicitudes.length > 0 && Object.keys(ejemplo.recintos).length > 0, 'el ejemplo debe traer solicitudes y recintos');
const n02 = decodeRuntime(JSON.parse(fs.readFileSync(new URL('dist/n02/runtime.json', raiz), 'utf8'))).data.rooms;
const estados = {}; for (const [, c] of calcular(ejemplo, n02)) estados[c.estado] = (estados[c.estado] || 0) + 1;
assert(estados.bloqueado > 0 && estados.restriccion > 0 && estados.liberado > 0, 'el ejemplo debe producir los tres estados: ' + JSON.stringify(estados));
// El ejemplo solo lista recintos del nivel 2: el nivel −1 queda sin datos aunque comparta terminaciones.
const n1 = decodeRuntime(JSON.parse(fs.readFileSync(new URL('dist/runtime.json', raiz), 'utf8'))).data.rooms;
assert([...calcular(ejemplo, n1).values()].every(c => c.estado === 'sin-dato'), 'recintos fuera del Excel deben quedar «Sin datos»');
console.log(JSON.stringify({checks: 'passed', semaforoEjemploN02: estados, scope: 'Semáforo de liberación archivado: lectura del Excel de ejemplo y cálculo de estados.'}));
