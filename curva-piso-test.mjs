// Curva del piso con el criterio del RMP (dist/curva-piso.mjs): peso por costo de línea base 1, plan con la línea base 1,
// real medido desde la planilla o el terreno, real estimado con el % de Terminaciones del RMP y referencia de la obra.
// Datos inventados (el repositorio es público).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {curvaPiso, terminacionesRMP} from './dist/curva-piso.mjs';
import {fraccionProgramada} from './dist/programa-obra-model.mjs';

let pruebas = 0;
const programa = {nivel: 'N02', tareas: [
  {codigo: '6.1.4', partida: 'Pavimento vinílico', inicio: '2026-03-01', fin: '2027-02-28', inicioBase: '2026-01-01', finBase: '2026-06-30', peso: 3},
  {codigo: '6.3.1', partida: 'Cielo modular', inicio: '2026-06-01', fin: '2027-05-31', inicioBase: '2026-04-01', finBase: '2026-12-31', peso: 1}]};
const partidas = [
  {id: '6.1.4.1', cantidad: 10, pct: 100, at: '2026-10-01T15:00:00.000Z'},   // planilla de medición
  {id: '6.1.4.1', cantidad: 30, pct: 50, at: '2026-11-10T12:00:00.000Z'},    // terreno
  {id: 'T-CIE-12', cantidad: 20, pct: 100, at: '2026-11-15T12:00:00.000Z'},  // genérica de cielo → 6.3
  {id: '6.3.1.1', cantidad: 5, pct: 0, at: null},
  {id: '9.9.9', cantidad: 8, pct: 100, at: '2026-09-01'}];                   // sin tarea en el programa
const rmp = {schema: 1, partidas: [{codigo: '2', peso: 6, mideAtlas: false}, {codigo: '6.1', peso: 2, mideAtlas: true}, {codigo: '6.3', peso: 2, mideAtlas: true}],
  meses: {'2026-07': {'2': {plan: 90, real: 80}}, '2026-08': {'6.1': {plan: 50, real: 10}, '6.3': {plan: 50, real: 20}}, '2026-09': {'6.1': {plan: 60, real: 20}, '6.3': {plan: 60, real: 30}}, '2026-10': {'6.1': {plan: 70, real: 30}, '6.3': {plan: 70, real: 40}}}};

// Terminaciones del RMP: solo el capítulo 6, ponderado, en los meses que lo informan.
assert.deepEqual([...terminacionesRMP(rmp)], [['2026-08', 15], ['2026-09', 25], ['2026-10', 35]]); pruebas++;
assert.equal(terminacionesRMP(null).size, 0); pruebas++;

const hoy = '2026-11-20', medicion = '2026-10-01T15:00:00.000Z', c = curvaPiso(partidas, programa, hoy, rmp, {medicion}), ult = c.puntos.find(p => p.fecha === hoy);
assert.equal(c.criterio, 'rmp'); assert.equal(c.tareas, 2); assert.equal(c.sinTarea, 1); assert.equal(c.pesoObra, 4); pruebas++;
// Real de hoy: pavimento (10·1 + 30·0,5)/40 = 0,625 con peso 3; cielo (20·1 + 5·0)/25 = 0,8 con peso 1 → (1,875 + 0,8)/4.
assert.equal(ult.real, Math.round(1000 * (3 * 0.625 + 0.8) / 4) / 10); pruebas++;
// Plan de hoy con la línea base 1: pavimento terminado; cielo lineal entre abril y diciembre.
assert.equal(ult.programado, Math.round(1000 * (3 + fraccionProgramada('2026-04-01', '2026-12-31', hoy)) / 4) / 10); pruebas++;
// Lo medido parte con la planilla (01-10): antes no hay real medido.
assert.equal(c.desde, '2026-10-01'); assert.equal(c.conPlanilla, true);
assert.ok(c.puntos.filter(p => p.fecha < '2026-10-01').every(p => p.real === null)); pruebas++;
// El real medido no baja.
const reales = c.puntos.filter(p => p.real != null).map(p => p.real);
assert.ok(reales.every((v, i) => !i || v >= reales[i - 1])); pruebas++;
// Estimado: Terminaciones del RMP × k, con k = real del piso al empezar a medir (3·0,25/4 = 18,75) ÷ RMP de octubre (35).
const k = 18.75 / 35; assert.ok(Math.abs(c.factor - k) < 1e-12); pruebas++;
const ago = c.puntos.find(p => p.fecha.startsWith('2026-08')), sep = c.puntos.find(p => p.fecha.startsWith('2026-09'));
assert.equal(ago.estimado, Math.round(150 * k) / 10); assert.equal(sep.estimado, Math.round(250 * k) / 10); pruebas++;
assert.ok(c.puntos.filter(p => p.fecha < '2026-08-01').every(p => p.estimado === null), 'antes de los meses del RMP no hay estimación'); pruebas++;
// La estimación empalma con lo primero medido y no sigue después.
const primero = c.puntos.findIndex(p => p.real != null);
assert.equal(c.puntos[primero].estimado, c.puntos[primero].real);
assert.ok(c.puntos.slice(primero + 1).every(p => p.estimado === null)); pruebas++;
// Referencia: el % de Terminaciones de la obra según el RMP, hasta el último mes informado.
assert.equal(ago.referencia, 15); assert.equal(ult.referencia, null); pruebas++;
// Futuro: solo plan.
assert.ok(c.puntos.filter(p => p.fecha > hoy).every(p => p.real === null && p.estimado === null && p.programado != null)); pruebas++;
assert.equal(c.puntos.at(-1).programado, 100); pruebas++;

// Sin planilla de medición: lo marcado en terreno se pone al día de a poco. El ancla es hoy (k = real de hoy ÷ RMP del
// último mes, 35) y la estimación llega hasta hoy, donde vale el real; no corta en lo primero marcado.
const sp = curvaPiso(partidas, programa, hoy, rmp), usp = sp.puntos.find(p => p.fecha === hoy), kh = usp.real / 35;
assert.equal(sp.conPlanilla, false); assert.equal(sp.desde, '2026-10-01');
assert.ok(Math.abs(sp.factor - (3 * 0.625 + 0.8) / 4 * 100 / 35) < 1e-9);
assert.equal(usp.estimado, usp.real);
assert.equal(sp.puntos.find(p => p.fecha.startsWith('2026-08')).estimado, Math.round(150 * sp.factor) / 10);
assert.ok(sp.puntos.filter(p => p.fecha > '2026-10-01' && p.fecha <= hoy).every(p => p.estimado != null && p.estimado >= p.real), 'por sobre lo marcado hasta hoy'); pruebas++;
// Sin planilla del RMP: sin estimación ni referencia.
const sinRmp = curvaPiso(partidas, programa, hoy, null, {medicion});
assert.ok(sinRmp.puntos.every(p => p.estimado === null && p.referencia === null)); assert.equal(sinRmp.factor, null); pruebas++;
// Programa importado sin línea base: fechas vigentes y peso por m² (pavimento 40, cielo 25).
const viejo = {nivel: 'N02', tareas: programa.tareas.map(({inicioBase, finBase, peso, ...t}) => t)};
const v = curvaPiso(partidas, viejo, hoy, rmp), uv = v.puntos.find(p => p.fecha === hoy);
assert.equal(v.criterio, 'vigente'); assert.equal(v.pesoObra, null);
assert.equal(uv.real, Math.round(1000 * (40 * 0.625 + 25 * 0.8) / 65) / 10);
assert.equal(uv.programado, Math.round(1000 * (40 * fraccionProgramada('2026-03-01', '2027-02-28', hoy) + 25 * fraccionProgramada('2026-06-01', '2027-05-31', hoy)) / 65) / 10); pruebas++;
// Sin tareas que calcen: sin puntos (la vista vuelve a la curva anterior).
assert.deepEqual(curvaPiso([{id: '9.9.9', cantidad: 1, pct: 100}], programa, hoy).puntos, []); pruebas++;

// La vista: dos gráficos (obra y piso) en Avance por recinto.
const vista = fs.readFileSync('dist/room-progress.mjs', 'utf8');
assert.ok(vista.includes('id="progressCurvaObra"') && vista.includes('montarCurvaObra') && vista.includes('curvaPiso(')); pruebas++;

console.log(`Curva del piso: ${pruebas} comprobaciones aprobadas (pesos por costo, línea base 1, real medido, estimado con el RMP, referencia, sin línea base).`);
