// Programa de obra: lectura del XML de Project, paso a pisos de Atlas, revisiones, partidas, ventanas por sector, curva
// programada, Nube (cliente y SQL). El XML de prueba es inventado: el programa real de Sacyr no va en el repositorio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from './dist/programa-obra-model.mjs';
import {curvaConPrograma, curvaReal} from './dist/curva-avance.mjs';

// ---------- XML de prueba (estructura del programa: partida → módulo → piso) ----------
const tarea = (uid, esquema, nombre, inicio, fin, {resumen = 0, texto1 = '', extra = ''} = {}) => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${nombre}</Name><WBS>${esquema}</WBS><OutlineNumber>${esquema}</OutlineNumber><OutlineLevel>${esquema.split('.').length}</OutlineLevel><Start>${inicio}T08:00:00</Start><Finish>${fin}T18:00:00</Finish><Milestone>0</Milestone><Summary>${resumen}</Summary><Cost>123456789</Cost>${extra}<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink><Baseline><Number>0</Number><Start>2020-01-01T08:00:00</Start><Finish>2020-01-02T08:00:00</Finish></Baseline>${texto1 ? `<ExtendedAttribute><FieldID>188743731</FieldID><Value>${texto1}</Value></ExtendedAttribute>` : ''}<ExtendedAttribute><FieldID>188744012</FieldID><Value>38,93 %</Value></ExtendedAttribute></Task>`;
const R = '2026-01-01', S = '2027-12-31';
const tareas = [
  tarea(0, '0', 'OBRA DE PRUEBA', R, S, {resumen: 1}),
  tarea(1, '1', 'TERMINACIONES', R, S, {resumen: 1, texto1: '6'}),
  tarea(2, '1.1', 'Pinturas', R, S, {resumen: 1, texto1: '6.4'}),
  tarea(3, '1.1.1', 'Pinturas en paramentos verticales', R, S, {resumen: 1, texto1: '6.4.1'}),
  tarea(4, '1.1.1.1', 'MÓDULO A', R, S, {resumen: 1}),
  tarea(5, '1.1.1.1.1', '1°Subterráneo', '2026-03-02', '2026-05-29'),
  tarea(6, '1.1.1.1.2', '2°Piso', '2026-09-01', '2026-12-30'),
  tarea(7, '1.1.1.1.3', '3°Subterráneo', '2026-02-02', '2026-03-31'),
  tarea(8, '1.1.1.1.4', 'Cubierta', '2026-02-02', '2026-03-31'),
  tarea(9, '1.1.1.2', 'MÓDULO B', R, S, {resumen: 1}),
  tarea(10, '1.1.1.2.1', '1°Subterráneo', '2026-04-01', '2026-04-30'),
  tarea(11, '1.1.2', 'Pinturas en cielos', R, S, {resumen: 1, texto1: '6.4.2'}),
  tarea(12, '1.1.2.1', 'MÓDULO A (ED.PRINCIPAL)', R, S, {resumen: 1}),
  tarea(13, '1.1.2.1.1', '2°Piso', '2026-07-01', '2027-03-30'),
  tarea(14, '1.1.2.1.2', '2°Piso', '2027-03-31', '2027-04-03'),
  tarea(15, '2', 'OBRA GRUESA', R, S, {resumen: 1, texto1: '2'}),
  tarea(16, '2.1', 'SOBRERADIERES Y SOBRELOSAS', R, S, {resumen: 1, texto1: '2.6'}),
  tarea(17, '2.1.1', 'Sobrelosas &amp; afinados', R, S, {resumen: 1, texto1: '2.6.2'}),
  tarea(18, '2.1.1.1', 'Módulo A', R, S, {resumen: 1}),
  tarea(19, '2.1.1.1.1', '2°Piso', '2025-06-02', '2025-08-29'),
  tarea(20, '2.1.2', 'Sobrerradier', R, S, {resumen: 1, texto1: '2.6.3'}),
  tarea(21, '2.1.2.1', 'MÓDULO A', R, S, {resumen: 1}),
  tarea(22, '2.1.2.1.1', '2°Piso', '2025-09-01', '2025-10-31'),
  tarea(23, '3', 'HITOS', R, S, {resumen: 1}),
  tarea(24, '3.1', 'Entrega de terreno', '2026-01-05', '2026-01-05'),
  tarea(25, '4', 'Pavimentos', R, S, {resumen: 1, texto1: '6.1.4'}),
  tarea(26, '4.1', 'MÓDULO A', R, S, {resumen: 1}),
  tarea(27, '4.1.1', '2°Piso', '2026-10-01', '2026-11-30'),
  tarea(28, '5', 'ESTRUCTURA', R, S, {resumen: 1, texto1: '2.4'}),
  tarea(29, '5.1', 'MÓDULO A', R, S, {resumen: 1}),
  tarea(30, '5.1.1', '2°Piso (Remanente 89,9%)', '2024-01-02', '2024-03-29', {texto1: '2.4.1.1'})
];
const cabecera = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion><Name>prueba.xml</Name><Title>OBRA DE PRUEBA</Title><StatusDate>2026-10-31T18:00:00</StatusDate><Calendars><Calendar><UID>1</UID><Name>Estándar</Name></Calendar></Calendars><ExtendedAttributes><ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>Ítem</Alias></ExtendedAttribute></ExtendedAttributes><Tasks>`;
const xml = cabecera + tareas.join('\n') + '</Tasks><Resources><Resource><UID>1</UID><Name>Pintor [462.107]</Name><Cost>99</Cost></Resource></Resources></Project>';

// ---------- Lectura ----------
assert.equal(P.pisoAtlas('1°Subterráneo'), 'N-1');
assert.equal(P.pisoAtlas('2°Piso'), 'N02');
assert.equal(P.pisoAtlas('NIVEL 4'), 'N04');
assert.equal(P.pisoAtlas('3°Subterráneo'), null);
assert.equal(P.pisoAtlas('Cubierta'), null);
assert.equal(P.pisoAtlas('1°Subterráneo (Remanente)'), 'N-1');
assert.equal(P.moduloDe('MÓDULO A (ED.PRINCIPAL)'), 'A');
assert.equal(P.moduloDe('Módulo B'), 'B');
assert.equal(P.moduloDe('MODULO DE EXPANSION DE ENTRADAS DIGITALES,'), null);
const leido = P.leerXML(xml);
assert.deepEqual(leido.cabecera, {nombre: 'prueba.xml', titulo: 'OBRA DE PRUEBA', estado: '2026-10-31', guardado: null, texto1: '188743731'});
assert.equal(leido.tareas.length, tareas.length);
const t6 = leido.tareas.find(t => t.uid === 6);
assert.deepEqual(t6, {uid: 6, nombre: '2°Piso', esquema: '1.1.1.1.2', nivel: 5, inicio: '2026-09-01', fin: '2026-12-30', resumen: false, hito: false, texto1: ''}, 'la línea base y las predecesoras no pisan las fechas propias');
assert.equal(leido.tareas.find(t => t.uid === 17).nombre, 'Sobrelosas & afinados');
assert.equal(leido.tareas.find(t => t.uid === 3).texto1, '6.4.1');
assert.throws(() => P.leerXML('<?xml version="1.0"?><Workbook></Workbook>'), /no es un XML de Project/);

// Por partes: trozos chicos que cortan etiquetas; se deja de leer en </Tasks> (los recursos traen montos y no se leen).
const bytes = new TextEncoder().encode(xml + '<Assignments>' + 'x'.repeat(5000) + '</Assignments>');
let pedidos = 0;
const finTareas = Buffer.from(bytes).indexOf('</Tasks>');
const fuente = (tam, {fallarTrasTareas = false} = {}) => { let i = 0; const fin = bytes.length; return new ReadableStream({pull(c) { pedidos++; if (i >= fin) return c.close(); if (fallarTrasTareas && i > finTareas + 2 * tam) return c.error(Error('leyó de más')); const corte = bytes.subarray(i, i + tam); i += tam; c.enqueue(corte); }}); };
for (const tam of [7, 64, 1000, 1 << 20]) {
  const r = await P.leerXMLPorPartes(fuente(tam, {fallarTrasTareas: true}));
  assert.deepEqual(r, leido, 'mismo resultado leyendo de a ' + tam + ' bytes');
}
pedidos = 0; await P.leerXMLPorPartes(fuente(64)); assert.ok(pedidos * 64 < bytes.length - 4000, 'corta en </Tasks>');
let avance = 0; await P.leerXMLPorPartes(fuente(100), {alAvanzar: b => { avance = b; }}); assert.ok(avance > 1000);
await assert.rejects(P.leerXMLPorPartes(new Blob(['<html><body>' + 'x'.repeat(500) + '</body></html>']).stream()), /no es un XML de Project/);

// ---------- Programa por piso ----------
const pp = P.programaPorPiso(leido, {archivo: 'prueba.xml'});
assert.deepEqual(Object.keys(pp.pisos).sort(), ['N-1', 'N02']);
assert.deepEqual(pp.revision, {archivo: 'prueba.xml', titulo: 'OBRA DE PRUEBA', estado: '2026-10-31'});
assert.deepEqual(pp.fuera, {sinPiso: 3, otroModulo: 1, sinCodigo: 0}, 'hito, 3°Subterráneo y cubierta sin piso; Módulo B fuera');
const n02 = pp.pisos.N02;
assert.deepEqual(n02.tareas.map(t => t.codigo), ['2.4.1.1', '2.6.2', '2.6.3', '6.1.4', '6.4.1', '6.4.2']);
assert.equal(n02.tareas[0].partida, 'ESTRUCTURA', 'código en la tarea del piso: la partida es la de arriba, no «2°Piso»');
assert.deepEqual(n02.tareas.find(t => t.codigo === '6.4.2'), {codigo: '6.4.2', partida: 'Pinturas en cielos', inicio: '2026-07-01', fin: '2027-04-03', uids: [13, 14], tramos: [['2026-07-01', '2027-03-30'], ['2027-03-31', '2027-04-03']]}, 'dos tareas de una partida en el piso: una con sus tramos');
assert.deepEqual(pp.pisos['N-1'].tareas.map(t => [t.codigo, t.inicio, t.fin]), [['6.4.1', '2026-03-02', '2026-05-29']]);
assert.ok(!JSON.stringify(pp).includes('462.107') && !JSON.stringify(pp).includes('123456789'), 'sin recursos ni montos');
const registro = {...n02, cargada: '2026-11-16T10:00:00.000Z', por: 'Planificación'};
assert.equal(P.validarPrograma(registro), registro);
assert.throws(() => P.validarPrograma({...registro, nivel: 'N10'}), /piso/);
assert.throws(() => P.validarPrograma({...registro, tareas: [...registro.tareas, registro.tareas[0]]}), /repetida/);
assert.throws(() => P.validarPrograma({...registro, tareas: [{...registro.tareas[0], fin: '2020-01-01'}]}), /inválida/);
assert.equal(P.idPrograma('N-1'), 'programa-N-1');

// Revisiones: cambios y ventanas conservadas.
const rev2 = {...n02, tareas: n02.tareas.filter(t => t.codigo !== '2.6.3').map(t => t.codigo === '6.4.1' ? {...t, fin: '2027-01-15'} : t).concat([{codigo: '6.10.2', partida: 'Guardapolvos', inicio: '2027-01-04', fin: '2027-02-26', uids: [99], tramos: [['2027-01-04', '2027-02-26']]}])};
const cambios = P.compararProgramas(n02, rev2);
assert.deepEqual(cambios.map(c => [c.codigo, c.tipo]), [['6.4.1', 'fechas'], ['6.10.2', 'nueva'], ['2.6.3', 'quitada']]);
assert.equal(cambios[0].corre, 16);
assert.deepEqual(P.compararProgramas(null, n02).length, 6);
const conVentanas = {...n02, ventanas: {'6.4.1': {orden: ['1', '2', '3'], sectores: [{sector: '1', inicio: '2026-09-01', fin: '2026-10-15'}]}, '2.6.3': {orden: ['1'], sectores: []}}};
assert.deepEqual(Object.keys(P.conVentanasPrevias(rev2, conVentanas).ventanas), ['6.4.1'], 'la partida quitada pierde sus ventanas');
assert.equal(P.conVentanasPrevias(rev2, null).ventanas, undefined);

// ---------- Partidas de Atlas → tareas ----------
assert.equal(P.tareaDeItem(n02, '6.4.1.2').codigo, '6.4.1');
assert.equal(P.tareaDeItem(n02, '6.4.1').codigo, '6.4.1');
assert.deepEqual(P.tareaDeItem(n02, '2.6'), {codigo: '2.6', partida: 'Sobrelosas & afinados · Sobrerradier', inicio: '2025-06-02', fin: '2025-10-31', compuesta: true}, 'el programa abre 2.6 en partes');
assert.equal(P.tareaDeItem(n02, 'T-CIE-PINTURA-ALTA').codigo, '6.4.2');
assert.equal(P.tareaDeItem(n02, 'T-PAV-109').codigo, '6.1.4', 'genérica de pavimento: la familia 6.1 del programa');
assert.equal(P.tareaDeItem(n02, '6.3.2'), null);
assert.equal(P.tareaDeItem(null, '6.4.1'), null);

// Avance real de una tarea: por m² y por sector; sin m² cada recinto pesa uno.
const partida = (id, code, cantidad, pct) => ({id, item: id, tipo: 'partida', cantidad, pct, recinto: {code}});
const sectores = {A: '1', B: '1', C: '2', D: '3'};
const ps = [partida('6.4.1.1', 'A', 100, 100), partida('6.4.1.2', 'B', 50, 50), partida('6.4.1.1', 'C', 50, 0), partida('6.4.1.1', 'D', 0, 0), partida('6.2.2', 'A', null, 100)];
const conM2 = P.avanceTarea(n02.tareas.find(t => t.codigo === '6.4.1'), ps.filter(p => p.cantidad > 0), c => sectores[c]);
assert.equal(conM2.unidad, 'm²'); assert.equal(conM2.total, 200); assert.equal(conM2.ejecutado, 125); assert.equal(conM2.pct, 62.5);
assert.deepEqual(conM2.porSector['1'], {total: 150, ejecutado: 125, pendiente: 25, recintos: ['A', 'B'], pendientes: ['B']});
assert.deepEqual(conM2.porSector['2'].pendientes, ['C']);
const porRecinto = P.avanceTarea(n02.tareas.find(t => t.codigo === '6.4.1'), ps, c => sectores[c]);
assert.equal(porRecinto.unidad, 'recintos', 'una partida sin m² (D) hace contar recintos');
assert.equal(porRecinto.total, 4); assert.equal(porRecinto.pct, 37.5);
assert.equal(P.avanceTarea(n02.tareas.find(t => t.codigo === '6.1.4'), ps).pct, null, 'sin partidas en Atlas');

// ---------- Fechas ----------
assert.equal(P.fraccionProgramada('2026-11-01', '2026-11-10', '2026-10-31'), 0);
assert.equal(P.fraccionProgramada('2026-11-01', '2026-11-10', '2026-11-05'), 0.5);
assert.equal(P.fraccionProgramada('2026-11-01', '2026-11-10', '2026-11-10'), 1);
assert.equal(P.fraccionProgramada('2026-11-01', '2026-11-01', '2026-11-01'), 1, 'un hito cumple su día');
const t641 = n02.tareas.find(t => t.codigo === '6.4.1'); // 01-09-2026 → 30-12-2026
assert.equal(P.proyeccion(t641, 0, '2026-10-01'), null);
assert.equal(P.proyeccion(t641, 100, '2026-10-01'), null);
assert.deepEqual(P.proyeccion(t641, 25, '2026-09-30'), {termino: '2026-12-29', atraso: -1});
assert.deepEqual(P.proyeccion(t641, 10, '2026-09-30'), {termino: '2027-06-27', atraso: 179});
const prox = P.tareasProximas(n02, '2026-09-15');
assert.deepEqual(prox.enCurso.map(t => t.codigo), ['6.4.1', '6.4.2']);
assert.deepEqual(prox.proximas.map(t => t.codigo), ['6.1.4']);
assert.deepEqual(prox.vencidas.map(t => t.codigo), ['2.6.3', '2.6.2', '2.4.1.1']);
assert.equal(prox.limite, '2026-10-27');

// ---------- Ventanas por sector ----------
const antes = P.ventanasPorSector(t641, {1: 50, 2: 25, 3: 25}, {hoy: '2026-08-01'});
assert.equal(antes.desde, '2026-09-01'); assert.equal(antes.vencida, false);
assert.deepEqual(antes.sectores, [{sector: '1', inicio: '2026-09-01', fin: '2026-10-31'}, {sector: '2', inicio: '2026-11-01', fin: '2026-11-30'}, {sector: '3', inicio: '2026-12-01', fin: '2026-12-30'}]);
const empezada = P.ventanasPorSector(t641, {1: 0, 2: 10, 3: 30}, {hoy: '2026-11-01', orden: ['3', '2', '1']});
assert.deepEqual(empezada.sectores.map(s => s.sector), ['3', '2'], 'sin pendiente no hay ventana');
assert.equal(empezada.sectores[0].inicio, '2026-11-01'); assert.equal(empezada.sectores.at(-1).fin, '2026-12-30');
assert.equal(P.sumarDias(empezada.sectores[0].fin, 1), empezada.sectores[1].inicio, 'una tras otra');
const vencida = P.ventanasPorSector(t641, {1: 1}, {hoy: '2027-02-01'});
assert.equal(vencida.vencida, true); assert.deepEqual(vencida.sectores, [{sector: '1', inicio: '2026-09-01', fin: '2026-12-30'}]);
assert.deepEqual(P.ventanasPorSector(t641, {}, {hoy: '2026-08-01'}).sectores, []);
assert.equal(P.validarVentanas(antes), antes);
assert.throws(() => P.validarVentanas({sectores: [{sector: '1', inicio: '2026-10-02', fin: '2026-10-01'}]}), /termina antes/);
assert.throws(() => P.validarVentanas({sectores: [{sector: '1', inicio: '2026-10-01', fin: '2026-10-02'}, {sector: '1', inicio: '2026-10-03', fin: '2026-10-04'}]}), /repetido/);
assert.throws(() => P.validarPrograma({...registro, ventanas: {'6.4.1': {sectores: [{sector: '1', inicio: 'x', fin: 'y'}]}}}), /inválida/);
assert.deepEqual(P.fueraDelPrograma(t641, {sectores: [{sector: '1', inicio: '2026-09-01', fin: '2026-10-01'}, {sector: '3', inicio: '2026-12-01', fin: '2027-01-20'}]}), ['3']);

// ---------- Actividades ligadas ----------
const progV = {...n02, ventanas: {'6.4.1': antes}};
assert.equal(P.ventanaDe(progV, '6.4.1', 2).fin, '2026-11-30');
const v = P.vinculo(t641, P.ventanaDe(progV, '6.4.1', '2'), pp.revision);
assert.deepEqual(v, {codigo: '6.4.1', partida: 'Pinturas en paramentos verticales', inicio: '2026-11-01', fin: '2026-11-30', sector: '2', estado: '2026-10-31'});
assert.equal(P.avisoActividad({programa: v, finPlan: null}, progV), null, 'en el plan intermedio aún no tiene fechas');
assert.equal(P.avisoActividad({programa: v, finPlan: '2026-11-27'}, progV), null);
assert.deepEqual(P.avisoActividad({programa: v, finPlan: '2026-12-04'}, progV), {fin: '2026-11-30', atraso: 4}, 'termina después de su ventana');
assert.deepEqual(P.avisoActividad({programa: P.vinculo(t641), finPlan: '2027-01-02'}, n02), {fin: '2026-12-30', atraso: 3}, 'sin sector: el término de la partida');
assert.equal(P.avisoActividad({finPlan: '2030-01-01'}, n02), null);

// ---------- Curva programada ----------
const planes = [{inicio: '2026-11-02', fin: '2026-11-15'}, {inicio: '2026-11-02', fin: '2026-11-15'}, null, null];
const curva = curvaConPrograma(['2026-11-10'], 4, '2026-11-16', planes);
assert.equal(curva.at(-1).fecha, '2026-11-16'); assert.equal(curva.at(-1).programado, 50, 'dos de cuatro programadas al 100 %');
assert.equal(curva.at(-1).real, 25);
assert.equal(curva[0].programado, 0);
const futura = curvaConPrograma([], 2, '2026-11-02', [{inicio: '2026-11-02', fin: '2026-11-29'}, {inicio: '2026-12-01', fin: '2026-12-31'}]);
assert.equal(futura[0].fecha, '2026-10-26'); assert.equal(futura[0].real, 0); assert.equal(futura[0].programado, 0);
assert.ok(futura.length >= 9 && futura.at(-1).programado === 100 && futura.at(-1).real === null, 'después de hoy solo la línea programada');
assert.deepEqual(curvaConPrograma(['2026-11-10'], 4, '2026-11-16', [null, null]), curvaReal(['2026-11-10'], 4, '2026-11-16'), 'sin programa, la curva de siempre');

// ---------- Nube (cliente) con Supabase simulado ----------
const almacen = new Map();
globalThis.localStorage = {getItem: k => almacen.has(k) ? almacen.get(k) : null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k)};
Object.defineProperty(globalThis, 'navigator', {value: {onLine: true}, configurable: true});
localStorage.setItem('atlas-nube-sesion', JSON.stringify({token: 't', user: {username: 'plan@hpc.test', role: 'editor'}}));
const filas = new Map(); let conflicto = false;
globalThis.fetch = async (ruta, {method = 'GET', body} = {}) => {
  const json = (status, d) => ({ok: status < 400, status, json: async () => d});
  if (method === 'GET') return json(200, {registros: [...filas.values()].filter(f => ruta.endsWith('tipo=' + f.tipo))});
  const b = JSON.parse(body), previa = filas.get(b.id);
  if (conflicto || (previa?.version || 0) !== b.version) { conflicto = false; return json(409, {error: 'Otro equipo guardó primero.'}); }
  const fila = {tipo: b.tipo, id: b.id, version: b.version + 1, data: b.data}; filas.set(b.id, fila); return json(200, fila);
};
const N = await import('./dist/programa-obra-nube.mjs');
assert.equal(N.programaDe('N02'), null);
const hechos = await N.guardarProgramaNube(pp.pisos, {por: 'Planificación', cargada: '2026-11-16T10:00:00.000Z'});
assert.deepEqual(hechos.map(h => [h.nivel, h.tareas]), [['N-1', 1], ['N02', 6]]);
assert.equal(filas.get('programa-N02').data.por, 'Planificación');
assert.equal(N.programaDe('N02').tareas.length, 6);
await N.guardarVentanasNube('N02', '6.4.1', antes, {por: 'Planificación', at: '2026-11-16T11:00:00.000Z'});
assert.deepEqual(N.programaDe('N02').ventanas['6.4.1'].sectores, antes.sectores);
assert.equal(filas.get('programa-N02').version, 2);
await assert.rejects(N.guardarVentanasNube('N02', '9.9.9', antes, {por: 'x'}), /no está en el programa/);
await assert.rejects(N.guardarVentanasNube('N02', '6.4.1', {sectores: [{sector: '1', inicio: '2026-10-02', fin: '2026-10-01'}]}, {por: 'x'}), /termina antes/);
// Nueva revisión: conserva las ventanas de las partidas que siguen y anota los cambios.
await N.guardarProgramaNube({N02: rev2}, {por: 'Oficina técnica'});
assert.deepEqual(Object.keys(N.programaDe('N02').ventanas), ['6.4.1']);
assert.equal(N.programaDe('N02').resumen.cambios, 3);
assert.equal(N.programaDe('N02').resumen.anterior.archivo, 'prueba.xml');
await N.guardarVentanasNube('N02', '6.4.1', null, {por: 'Planificación'});
assert.deepEqual(N.programaDe('N02').ventanas, {});
// Conflicto de versión: se baja lo de la nube y se pide repetir.
conflicto = true;
await assert.rejects(N.guardarProgramaNube({N02: n02}, {por: 'Oficina técnica'}), /Otro equipo guardó el programa de N02/);
await assert.rejects(N.guardarProgramaNube({N02: n02}, {por: ''}), /Inicia sesión/);
// Otro equipo: baja todo de la nube.
almacen.delete('atlas-programa-obra');
assert.equal(await N.refrescarProgramaNube(), true);
assert.deepEqual(N.pisosConPrograma().sort(), ['N-1', 'N02']);
assert.equal(await N.refrescarProgramaNube(), false, 'sin cambios no avisa');

// ---------- Servidor y SQL ----------
assert.match(fs.readFileSync(new URL('./server/campo.mjs', import.meta.url), 'utf8'), /const TIPOS = \[[^\]]*'programa'\]/);
assert.match(fs.readFileSync(new URL('./dist/nube.mjs', import.meta.url), 'utf8'), /refrescarProgramaNube\(\)/);
const sql = fs.readFileSync(new URL('./supabase/programa-obra.sql', import.meta.url), 'utf8');
assert.match(sql, /check \(tipo in \('proyecto','observacion','contorno','planilla','avance','programa'\)\)/);
assert.match(sql, /p_tipo not in \('proyecto','observacion','contorno','planilla','avance','programa'\)/);
for (const tipo of ['proyecto', 'observacion', 'contorno', 'planilla', 'avance', 'programa']) assert.match(sql, new RegExp("if p_tipo = '" + tipo + "' and"), tipo);
assert.match(sql, /^begin;[\s\S]*commit;\s*$/m);
if (process.env.PGLITE_MODULE) {
  const {PGlite} = await import(process.env.PGLITE_MODULE), db = new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon;`);
  for (const archivo of ['campo', 'contornos', 'planillas-avance', 'avance-terreno', 'programa-obra', 'programa-obra']) await db.exec(fs.readFileSync(new URL(`./supabase/${archivo}.sql`, import.meta.url), 'utf8'));
  const guardar = (rol, tipo, id, version, data) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: '11111111-1111-4111-8111-111111111111', email: 'plan@hpc.test', app_metadata: {campo_role: rol}})]);
    await tx.exec('set local role authenticated');
    return (await tx.query('select public.guardar_atlas_campo($1,$2,$3,$4::jsonb) as r', [tipo, id, version, JSON.stringify(data)])).rows[0].r;
  });
  const bueno = {...registro, ventanas: {}};
  assert.equal((await guardar('editor', 'programa', 'programa-N02', 0, bueno)).version, 1);
  assert.equal((await guardar('editor', 'programa', 'programa-N02', 1, {...bueno, ventanas: {'6.4.1': antes}})).version, 2);
  await assert.rejects(guardar('editor', 'programa', 'programa-N02', 1, bueno), /Version conflict/);
  await assert.rejects(guardar('editor', 'programa', 'programa-N03', 0, bueno), /Invalid work program/, 'el id debe calzar con el piso');
  await assert.rejects(guardar('editor', 'programa', 'programa-N02', 2, {...bueno, tareas: {}}), /Invalid work program/);
  await assert.rejects(guardar('editor', 'programa', 'programa-N02', 2, {...bueno, ventanas: []}), /Invalid work program/);
  await assert.rejects(guardar('editor', 'programa', 'programa-N02', 2, {...bueno, por: ''}), /Invalid work program/);
  await assert.rejects(guardar('lector', 'programa', 'programa-N04', 0, {...bueno, nivel: 'N04'}), /Unauthorized/);
  assert.equal((await guardar('editor', 'planilla', 'avance-N04', 0, {nivel: 'N04', recintos: {}, hojas: [], cargada: '2026-11-16', por: 'Mauro'})).version, 1, 'los demás tipos siguen');
  assert.equal((await db.query("select count(*)::int n from public.atlas_campo_historial where tipo = 'programa'")).rows[0].n, 2, 'cada revisión queda en el historial');
  await db.close();
  console.log('Programa de obra: programa-obra.sql ejecutado dos veces en PostgreSQL (PGlite): versión, validación, lector e historial.');
}
console.log('Programa de obra: XML de Project por partes, pisos y módulo, revisiones, partidas, avance por sector, ventanas, actividades ligadas, curva programada y Nube validados.');
