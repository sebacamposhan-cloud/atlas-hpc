import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePlan} from './dist/payment-plan.mjs';
import {cargarRecintos, recintoEn, resumirAvance, avanceGuardado, textoAvance} from './dist/payment-plan-rooms.mjs';

// Avance del pago por recintos: marcas de recinto completo, grosor del lápiz y porcentajes por superficie.

// 1. El plano admite recintos marcados, grosor y avance guardado; rechaza lo que no corresponde.
const valido = {schema: 1, floors: {'N-1': {source: 'map/overview.webp', strokes: [{color: '#21854b', points: [[.1, .1], [.2, .2]], w: .03}], rooms: {'3.1.4.1.1-1': '#21854b', 'CU.5.1.2': '#d68b20'}, avance: {recintos: 2, m2: 120.5, ejecutado: 40, pendiente: 60, observacion: 0, sinMarcar: 0}}}};
validatePlan(valido);
validatePlan({schema: 1, floors: {N01: {strokes: [{color: '#c83c3c', points: [[.5, .5]]}]}}}); // planos anteriores, sin recintos
assert.throws(() => validatePlan({schema: 1, floors: {N01: {strokes: [], rooms: {'3.1-1': '#000000'}}}}), /Recinto marcado inválido/);
assert.throws(() => validatePlan({schema: 1, floors: {N01: {strokes: [], rooms: {'<script>': '#21854b'}}}}), /Recinto marcado inválido/);
assert.throws(() => validatePlan({schema: 1, floors: {N01: {strokes: [], rooms: ['3.1-1']}}}), /Recintos marcados inválidos/);
assert.throws(() => validatePlan({schema: 1, floors: {N01: {strokes: [{color: '#21854b', points: [[0, 0]], w: 2}]}}}), /Trazo inválido/);
assert.throws(() => validatePlan({schema: 1, floors: {N01: {strokes: [], avance: {ejecutado: -1}}}}), /Avance inválido/);

// 2. Cada piso carga sus recintos con contorno (los mismos del visor) y tocar dentro de uno lo encuentra.
const leer = async ruta => JSON.parse(readFileSync('dist/' + ruta, 'utf8'));
const cantidades = {};
for (const [piso, prefijo, minimo] of [['N-1', '', 300], ['N01', 'n01/', 300], ['N02', 'n02/', 280], ['N03', 'n03/', 280]]) {
  const recintos = await cargarRecintos(prefijo, leer);
  cantidades[piso] = recintos.length;
  assert(recintos.length >= minimo, piso + ': ' + recintos.length + ' recintos');
  assert(new Set(recintos.map(r => r.codigo)).size === recintos.length, piso + ': un contorno por código');
  const muestra = recintos.find(r => r.anillos[0].polygon.length >= 4 && r.m2 > 5);
  const [x0, y0] = muestra.anillos[0].polygon.reduce(([a, b], [x, y]) => [Math.min(a, x), Math.min(b, y)], [1, 1]);
  // Busca un punto dentro del contorno recorriendo una grilla fina de su caja.
  let punto = null;
  const [x1, y1] = muestra.anillos[0].polygon.reduce(([a, b], [x, y]) => [Math.max(a, x), Math.max(b, y)], [0, 0]);
  for (let i = 1; i < 20 && !punto; i++) for (let j = 1; j < 20 && !punto; j++) { const p = [x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * j / 20]; if (recintoEn([muestra], p)) punto = p; }
  assert(punto, piso + ': punto dentro de ' + muestra.codigo);
  assert(recintoEn(recintos, punto), piso + ': recintoEn encuentra un recinto en ese punto');
}
const menos1 = await cargarRecintos('', leer), sala = menos1.find(r => r.codigo === '3.1.4.1.1-1');
assert(sala && Math.abs(sala.m2 - 43.84) / 43.84 < 0.1, 'Sala de Espera del −1 ≈ 43,84 m² declarados: ' + sala?.m2);

// 3. Porcentajes por superficie: recinto completo cuenta entero; lo pintado con lápiz, en proporción; un cruce menor al 3 % no cuenta.
const r = resumirAvance([
  {codigo: 'A-1', nombre: 'Uno', m2: 100, marcado: true, total: 1000, ejecutado: 1000, pendiente: 0, observacion: 0},
  {codigo: 'A-2', nombre: 'Dos', m2: 50, marcado: false, total: 500, ejecutado: 250, pendiente: 0, observacion: 50},
  {codigo: 'A-3', nombre: 'Tres', m2: 80, marcado: false, total: 800, ejecutado: 10, pendiente: 0, observacion: 0},
  {codigo: 'A-4', nombre: 'Cuatro', m2: 30, marcado: false, total: 300, ejecutado: 0, pendiente: 0, observacion: 0}]);
assert.equal(r.recintos, 2);
assert.equal(r.m2, 150);
assert.equal(Math.round(r.partes.ejecutado.m2), 125);
assert.equal(Math.round(r.partes.observacion.m2), 5);
assert.equal(Math.round(r.partes.sinMarcar.m2), 20);
assert.equal(Math.round(r.partes.ejecutado.pct * 10) / 10, 83.3);
assert.deepEqual(r.detalle.map(d => [d.codigo, Math.round(d.ejecutado)]), [['A-1', 100], ['A-2', 50]]);
const guardado = avanceGuardado(r);
assert.deepEqual(guardado, {recintos: 2, m2: 150, ejecutado: 83.3, pendiente: 0, observacion: 3.3, sinMarcar: 13.3});
assert.equal(textoAvance(guardado), '83 % ejecutado · 0 % pendiente · 3 % observación de 150 m² (2 recintos)');
assert.equal(textoAvance(undefined), 'sin recintos marcados');
console.log('Avance del pago por recintos: validación de marcas y grosor, contornos por piso ' + JSON.stringify(cantidades) + ', búsqueda por punto y porcentajes por superficie validados.');
