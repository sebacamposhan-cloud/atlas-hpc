// Carga de actividades de Last Planner desde Excel: encabezados con o sin tildes, fechas de Excel, revisión por fila
// (errores, otro piso, atrasadas), reprogramación, reparto exacto por semana y borradores iguales a «Nueva actividad».
import assert from 'node:assert/strict';
import * as I from './dist/lastplanner-importar.mjs';
import {createSegments} from './dist/lastplanner-cycle-model.mjs';

const actor = {id: '11111111-1111-4111-8111-111111111111', email: 'oficina@example.test', role: 'editor'};
// Encabezados en cualquier orden, con tildes, mayúsculas o sinónimos; lo desconocido se ignora.
assert.deepEqual(I.mapearEncabezados(['TÉRMINO', 'Actividad', 'Nivel', 'Código recinto', 'Encargado', 'Fecha inicio', 'Cant.', 'Un', 'Otra cosa']),
  {fin: 0, actividad: 1, piso: 2, recintos: 3, responsable: 4, inicio: 5, cantidad: 6, unidad: 7});
// Fechas: texto chileno, ISO, número de serie de Excel y objeto Date; las imposibles quedan nulas.
assert.equal(I.leerFecha('16-11-2026'), '2026-11-16');
assert.equal(I.leerFecha('16/11/2026'), '2026-11-16');
assert.equal(I.leerFecha('2026-11-16'), '2026-11-16');
assert.equal(I.leerFecha(46342), '2026-11-16');
assert.equal(I.leerFecha(new Date(2026, 10, 16)), '2026-11-16');
assert.equal(I.leerFecha('31-02-2026'), null);
assert.equal(I.leerPiso('Piso 4'), 'N04'); assert.equal(I.leerPiso('Nivel −1'), 'N-1'); assert.equal(I.leerPiso('N03'), 'N03'); assert.equal(I.leerPiso('azotea'), null);

const recintos = new Map([['10.1.1.1.5-1', {id: 'n04-r1', code: '10.1.1.1.5-1', name: 'Bodega de Equipos', level: 'N04'}], ['10.1.1.1.6-1', {id: 'n04-r2', code: '10.1.1.1.6-1', name: 'Sala', level: 'N04'}]]);
const opciones = {piso: 'N04', hoy: '2026-11-16', recintoDe: c => recintos.get(c) || null};
const filas = [I.plantilla()[0],
  ['Tabiquería sector A', 'Piso 4', '10.1.1.1.5-1, 10.1.1.1.6-1', 'Jefe de terreno', '16-11-2026', '27-11-2026', '1.200,5', 'm²', 'Arquitectura', '', 'Ala norte'],
  ['Pintura', 'N04', '10.1.1.1.5-1', 'Jefe B', '02-11-2026', '06-11-2026', 40, 'm²'],
  ['Cielos', 'N03', '3.1.1', 'Jefe B', '16-11-2026', '20-11-2026', 10, 'm²'],
  ['', 'N04', '9.9.9-1', '', '20-11-2026', '16-11-2026', 0, ''],
  ['', '', '', '', '', '', '', '']];
const rev = I.revisarPlanilla(filas, opciones);
assert.equal(rev.length, 4, 'las filas vacías se ignoran');
assert.deepEqual(rev[0].errores, []); assert.equal(rev[0].atrasada, false); assert.equal(rev[0].datos.cantidad, 1200.5); assert.equal(rev[0].recintos.length, 2);
assert.equal(rev[1].atrasada, true, 'terminó antes de hoy: se marca para reprogramar');
assert.equal(rev[2].otroPiso, true); assert.deepEqual(rev[2].errores, [], 'otro piso no es error: se carga desde ese piso');
assert.ok(rev[3].errores.length >= 5, 'faltan actividad, responsable, cantidad, unidad; fechas invertidas; recinto inexistente');
assert.ok(rev[3].errores.some(e => e.includes('9.9.9-1')));
assert.throws(() => I.revisarPlanilla([['Actividad', 'Piso']], opciones), /no tiene filas/);
assert.throws(() => I.revisarPlanilla([['Actividad', 'Piso'], ['x', 'N04']], opciones), /Faltan columnas/);

// Reprogramar conserva la duración; repartir suma exacto y respeta los días de cada semana.
assert.deepEqual(I.reprogramar(rev[1].datos, '2026-11-16'), {...rev[1].datos, inicio: '2026-11-16', fin: '2026-11-20'});
const partes = I.repartir(1200.5, '2026-11-16', '2026-11-27');
assert.equal(partes.length, 2); assert.equal(Math.round(partes.reduce((s, n) => s + n, 0) * 1e6) / 1e6, 1200.5);
assert.deepEqual(I.repartir(40, '2026-11-16', '2026-11-20'), [], 'una sola semana no necesita reparto');

// Los valores pasan por el mismo creador de borradores que «Nueva actividad», un tramo por semana.
const v = I.valoresDeFila(rev[0], {fuente: r => ({id: 'doc-' + r.id, sha256: 'a'.repeat(64), revision: 'Rev01'})});
const tramos = createSegments(v, I.repartir(v.cantidad, v.inicioPlan, v.finPlan), actor);
assert.equal(tramos.length, 2); assert.ok(tramos.every(a => a.fase === 'borrador' && a.level === 'N04' && a.alcances.length === 2 && a.alcances.every(s => s.tipo === 'recinto' && s.locationOnly)));
assert.equal(tramos[0].alcances[0].source.sha256, 'a'.repeat(64));
assert.ok(v.notas.includes('fila 2'));
console.log('Carga de Last Planner desde Excel: encabezados flexibles, fechas de Excel, errores por fila, otro piso, atrasadas para reprogramar, reparto exacto por semana y borradores del mismo creador: passed');
