// Curvas RMP (dist/rmp-model.mjs): planilla de pesos de Planificación, real de ATLAS en el mes actual, curva S,
// proyección, eficiencia, últimos 4 meses y cumplimiento. Datos inventados (el repositorio es público).
import assert from 'node:assert/strict';
import * as R from './dist/rmp-model.mjs';

let pruebas = 0;
// Plantilla con las dos hojas y sus columnas.
const p = R.plantillaRMP();
assert.deepEqual(p[R.HOJA_PESOS][0], R.COLUMNAS_PESOS); assert.deepEqual(p[R.HOJA_MESES][0], R.COLUMNAS_MESES); pruebas++;

const hojas = {
  Pesos: [R.COLUMNAS_PESOS, ['2.1', 'Obra gruesa', 60, 'No'], ['5.1', 'Tabiquería', 30, 'Sí'], ['6.2', 'Pavimentos', 10, 'si'], ['', '', '', '']],
  'Avance mensual': [R.COLUMNAS_MESES,
    ['2026-08', '2.1', 80, 80], ['2026-08', '5.1', 20, 10], ['2026-08', '6.2', 0, 0],
    ['2026-09', '2.1', 90, 88], ['2026-09', '5.1', 40, 25], ['2026-09', '6.2', 10, 5],
    [46296, '2.1', 100, 95], ['10-2026', '5.1', 60, 40], ['2026/10', '6.2', 30, 10],
    ['2026-11', '2.1', 100, null], ['2026-11', '5.1', 80, null], ['2026-11', '6.2', 50, null]],
};
const {registro, avisos} = R.leerPesosRMP(hojas);
assert.equal(registro.partidas.length, 3); assert.deepEqual(registro.partidas.map(x => x.mideAtlas), [false, true, true]); pruebas++;
assert.deepEqual(Object.keys(registro.meses).sort(), ['2026-08', '2026-09', '2026-10', '2026-11'], 'fechas de Excel y formatos mm-aaaa se leen como aaaa-mm'); pruebas++;
assert.deepEqual(avisos, []); pruebas++;

// Errores en español con la fila.
assert.throws(() => R.leerPesosRMP({}), /Falta la hoja «Pesos»/); pruebas++;
assert.throws(() => R.leerPesosRMP({Pesos: [R.COLUMNAS_PESOS, ['cinco', 'x', 10, 'No']]}), /fila 2: «cinco» no es un código/); pruebas++;
assert.throws(() => R.leerPesosRMP({Pesos: [R.COLUMNAS_PESOS, ['5.1', 'x', 10, 'No'], ['5.1', 'y', 5, 'No']]}), /repetida/); pruebas++;
assert.throws(() => R.leerPesosRMP({Pesos: [R.COLUMNAS_PESOS, ['5.1', 'x', 10, 'No']], 'Avance mensual': [R.COLUMNAS_MESES, ['2026-10', '9.9', 1, 1]]}), /no está en la hoja «Pesos»/); pruebas++;
assert.throws(() => R.leerPesosRMP({Pesos: [R.COLUMNAS_PESOS, ['5.1', 'x', 10, 'No']], 'Avance mensual': [R.COLUMNAS_MESES, ['2026-10', '5.1', 120, 1]]}), /plan acumulado va de 0 a 100/); pruebas++;
// Pesos que no suman 100: se avisa y se llevan a 100 en proporción.
assert.match(R.leerPesosRMP({Pesos: [R.COLUMNAS_PESOS, ['5.1', 'x', 30, 'No'], ['6.1', 'y', 30, 'No']]}).avisos[0], /suman 60 %/); pruebas++;

// Curvas a hoy 22-11-2026. ATLAS mide 5.1 (70 %) y 6.2 (40 %) en el mes actual.
const c = R.curvasRMP(registro, {hoy: '2026-11-22', atlas: new Map([['5.1', 70], ['6.2', 40]])});
assert.deepEqual(c.puntos.map(x => x.mes), ['2026-08', '2026-09', '2026-10', '2026-11']); pruebas++;
// Plan de octubre: 0,6·100 + 0,3·60 + 0,1·30 = 81. Real de octubre: 0,6·95 + 0,3·40 + 0,1·10 = 70.
assert.deepEqual(c.puntos[2], {mes: '2026-10', plan: 81, real: 70}); pruebas++;
// Noviembre: obra gruesa sin real nuevo arrastra 95; tabiquería y pavimentos toman ATLAS: 0,6·95 + 0,3·70 + 0,1·40 = 82.
assert.equal(c.puntos[3].real, 82); assert.equal(c.puntos[3].plan, 89); assert.equal(c.conAtlas, 2); pruebas++;
assert.equal(c.cumplimiento, 82 / 89); assert.ok(Math.abs(c.desviacion - 7 / 89) < 1e-12); pruebas++;
assert.deepEqual(c.eficiencia.map(e => e.valor), [.94, .91, .86, .92]); pruebas++;
// Últimos 4 meses: avance de cada mes (no acumulado).
assert.deepEqual(c.ultimos.map(u => [u.mes, u.plan, u.real]), [['2026-08', 54, 51], ['2026-09', 13, 9.8], ['2026-10', 14, 9.2], ['2026-11', 8, 12]]); pruebas++;
// Proyección desde el último real hasta 100 %, con el ritmo de los últimos meses.
assert.equal(c.proyeccion[0].mes, '2026-11'); assert.equal(c.proyeccion.at(-1).valor, 100); assert.ok(c.proyeccion.length > 2); pruebas++;
assert.equal(c.fuenteProyeccion, 'ritmo'); pruebas++;
// Hoja «Reprogramación» (opcional, con o sin tilde): la proyección parte del real de noviembre (82) y recorre lo que le
// falta a la reprogramación (80 en nov) en la misma proporción: dic 90 → 82 + 10·18/20 = 91; ene 100 → 100, y termina.
const conReprog = R.leerPesosRMP({...hojas, Reprogramacion: [R.COLUMNAS_REPROG, ['2026-10', 70], ['2026-11', 80], ['2026-12', 90], ['2027-01', 100], ['2027-02', 100]]}).registro;
assert.deepEqual(conReprog.reprogramacion, {'2026-10': 70, '2026-11': 80, '2026-12': 90, '2027-01': 100, '2027-02': 100}); pruebas++;
const cr = R.curvasRMP(conReprog, {hoy: '2026-11-22', atlas: new Map([['5.1', 70], ['6.2', 40]])});
assert.equal(cr.fuenteProyeccion, 'reprogramacion');
assert.deepEqual(cr.proyeccion, [{mes: '2026-11', valor: 82}, {mes: '2026-12', valor: 91}, {mes: '2027-01', valor: 100}]); pruebas++;
assert.deepEqual(cr.puntos, c.puntos, 'la reprogramación no cambia plan ni real'); pruebas++;
// Reprogramación ya terminada al mes del último real: vuelve al ritmo.
assert.equal(R.proyeccionReprogramada({'2026-10': 100, '2026-12': 100}, {mes: '2026-11', real: 82}).length, 0); pruebas++;
assert.throws(() => R.leerPesosRMP({...hojas, 'Reprogramación': [R.COLUMNAS_REPROG, ['2026-10', 140]]}), /Reprogramación», fila 2: el acumulado va de 0 a 100/); pruebas++;
assert.deepEqual(R.plantillaRMP()[R.HOJA_REPROG][0], R.COLUMNAS_REPROG); pruebas++;
// ATLAS por debajo de lo ya informado (aún no se marca todo en terreno): el acumulado no retrocede.
const bajo = R.curvasRMP(registro, {hoy: '2026-11-22', atlas: new Map([['5.1', 0], ['6.2', 40]])});
assert.equal(bajo.puntos[3].real, 0.6 * 95 + 0.3 * 40 + 0.1 * 40); assert.equal(bajo.conAtlas, 1); pruebas++;
// Sin ATLAS: el mes actual usa lo último informado por Planificación.
assert.equal(R.curvasRMP(registro, {hoy: '2026-11-22'}).puntos[3].real, 70); pruebas++;
// Meses futuros sin real.
assert.equal(R.curvasRMP(registro, {hoy: '2026-10-05'}).puntos[3].real, null); pruebas++;

// Real de ATLAS por partida EETT sumando pisos: m² ejecutados sobre m² totales.
const piso = (codigo, cantidad, pct) => ({tipo: 'partida', id: codigo + '.1', cantidad, pct, recinto: {code: 'X'}});
const a = R.avanceAtlas(['5.1', '7.1'], [[piso('5.1', 100, 50)], [piso('5.1', 300, 100)], []]);
assert.equal(a.get('5.1'), 87.5); assert.equal(a.has('7.1'), false); pruebas++;

console.log(`Curvas RMP: ${pruebas} comprobaciones aprobadas (planilla, errores, curva S, ATLAS en el mes actual, eficiencia, 4 meses, cumplimiento, proyección con ritmo y con reprogramación).`);
