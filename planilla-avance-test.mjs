// Planillas de avance de la oficina: lectura de hojas con formatos distintos, guardado en la nube y precedencia con
// lo marcado en terreno. Las planillas son sintéticas, con la forma de las reales (que no se publican).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from './dist/planilla-avance-model.mjs';
import * as M from './dist/avance-model.mjs';
import {createCampo} from './server/campo.mjs';

// ---------- Hojas con la forma de las planillas reales ----------
const fila = (largo, celdas) => { const r = Array(largo).fill(null); for (const [c, v] of Object.entries(celdas)) r[Number(c)] = v; return r; };
// Cielo duro (N02): etapas con «AVANCE PARCIAL (%)», pesos escritos y total ejecutado en m².
const cieloDuro = [
  [], fila(28, {1: 'CUBICACION CIELOS DURO', 12: 'AVANCE PARCIAL', 24: 'AVANCE PONDERADO'}), [],
  fila(28, {12: 'ESTRUCTURA', 16: 'TAPADO', 20: 'HUINCHA', 24: 0.63, 25: 0.3, 26: 0.07, 27: 'PONDERADO'}),
  fila(28, {1: 'ITEM', 2: 'FECHA', 3: 'NIVEL', 4: 'CODIGO RECINTO', 5: 'NOMBRE RECINTO', 7: 'TIPO CIELO', 8: 'AREA', 10: 'AREA TOTAL', 12: 'UND.', 13: 'AVANCE PARCIAL (%)', 14: 'AVANCE PARCIAL EST', 16: 'UND.', 17: 'AVANCE PARCIAL (%)', 18: 'AVANCE PARCIAL TAP', 20: 'UND.', 21: 'AVANCE PARCIAL (%)', 22: 'AVANCE PARCIAL', 24: 'ESTRUCTURA', 25: 'TAPADO', 26: 'HUINCHA', 27: 'TOTAL EJECUTADO (m2)'}),
  fila(28, {1: 1, 3: 'N02', 4: '8.2.3.3.9-2', 5: 'Vestuarios', 7: 202, 8: 10, 10: 10, 13: 1, 14: 10, 17: 1, 18: 10, 21: 0, 24: 6.3, 25: 3, 26: 0, 27: 9.3}),
  fila(28, {1: 2, 3: 'N02', 4: '8.2.3.3.5-1', 5: 'Bodega', 7: 201, 8: 20, 10: 20, 13: 1, 17: 1, 21: 1, 27: 20}),
  fila(28, {1: 3, 3: 'N02', 4: 'CU,8,2,3-9', 5: 'Coma en el código', 7: 201, 8: 5, 10: 5, 27: 0}),
  fila(28, {1: 4, 3: 'N02', 4: '9.9.9.9-1', 5: 'No existe en Atlas', 7: 201, 8: 5, 10: 5, 13: 1, 27: 3.15}),
  fila(28, {10: 40, 27: 32.45}) // total de la hoja: sin código
];
// Pavimento (N02): total en «AVANCE (%)». Dos filas del mismo recinto se ponderan por superficie.
const pavimento = [
  [], [], [], fila(26, {12: 'REPARACIÓN SOBRELOSA', 16: 'AUTONIVELANTE', 20: 'PAVIMENTO'}), [],
  fila(26, {1: 'ITEM', 3: 'NIVEL', 4: 'CÓDIGO RECINTO', 5: 'RECINTO', 6: 'PAVIMENTO', 10: 'AREA PAVIMENTO', 12: 'UNI', 13: 'AVANCE PARCIAL (%)', 14: 'AVANCE PARCIAL(m2)', 16: 'UNI', 17: 'AVANCE PARCIAL (%)', 20: 'UNI', 21: 'AVANCE PARCIAL (%)', 24: 'AVANCE (m2)', 25: 'AVANCE (%)'}),
  fila(26, {1: 1, 3: 'N02', 4: '8.2.3.3.9-2', 6: 105, 10: 30, 13: 1, 17: 1, 21: 1, 24: 30, 25: 1}),
  fila(26, {1: 2, 3: 'N02', 4: '8.2.3.3.9-2', 6: 105, 10: 10, 13: 1, 17: 0, 21: 0, 24: 0, 25: 0}),
  fila(26, {1: 3, 3: 'N02', 4: '8.2.3.3.5-1', 6: 105, 10: 20, 13: 0.5, 25: 0.17})
];
// Pintura (N02): muros y cielos en la misma hoja, etapas por nombre y ponderado en m².
const pintura = [
  [], fila(34, {19: 'AVANCE MUROS', 25: 'AVANCE CIELOS'}), [], fila(34, {20: 1, 21: 0.41, 22: 0.34, 23: 0.25, 26: 1, 27: 0.5, 28: 0.29, 29: 0.21}),
  fila(34, {1: 'ITEM', 3: 'NIVEL', 6: 'CÓDIGO RECINTO', 7: 'RECINTO', 16: 'TOTAL MUROS', 17: 'TOTAL CIELOS', 19: 'UNI', 20: 'PASTA', 21: 'LATEX', 22: '1RA MANO', 23: '2DA MANO', 25: 'UNI', 26: 'PASTA', 27: 'LATEX', 28: '1RA MANO', 29: '2DA MANO', 31: 'PONDERADO MUROS', 32: 'PONDERADO CIELOS'}),
  fila(34, {1: 1, 3: 'N02', 6: '8.2.3.3.9-2', 16: 100, 17: 10, 20: 1, 21: 1, 26: 1, 27: 1, 28: 1, 29: 1, 31: 41, 32: 10})
];
// Impermeabilización (S01): la columna de código existe pero viene vacía.
const sinCodigo = [[], [], [], [], fila(20, {1: 'ITEM', 3: 'NIVEL', 5: 'CÓDIGO RECINTO', 8: 'AREA', 12: 'UNI', 13: 'AVANCE PARCIAL (%)'}), fila(20, {1: 1, 8: 12, 13: 1}), fila(20, {1: 2, 8: 4, 13: 0})];
// Cielo modular (S01): el código no está bajo «CÓDIGO RECINTO» sino en la columna PMA, con el piso entre paréntesis.
const modularS01 = [[], [], fila(26, {18: 'ESTRUCTURA', 22: 'TAPADO'}),
  fila(26, {0: 'ITEM', 2: 'PMA', 3: 'NIVEL', 9: 'CÓDIGO RECINTO', 16: 'AREA', 18: 'UNI', 19: 'AVANCE PARCIAL (%)', 22: 'UNI', 23: 'AVANCE PARCIAL (%)'}),
  ...[1, 2, 3, 4, 5, 6, 7].map(i => fila(26, {0: i, 2: `CT.F.(-1)-${i}`, 3: ' S01', 16: 10, 19: 1, 23: i > 3 ? 1 : 0}))];

// ---------- Familias y códigos ----------
assert.deepEqual(['CIELO DURO  ', 'PINTURA EN CIELO DURO ', 'PINTURA TABIQUES', 'PINTURA', 'CENEFAS', 'PINTURA CENEFA', 'VINILICOS', '115 ESMALTE  EPOXICO', 'GUARDA POLVO ', 'IMPER MUROS', 'IMPER', 'COMPARTIMENTACION ', 'TABIQUERIA', 'LUMINARIAS', 'Hoja2'].map(P.familiaDeHoja),
  ['cieloDuro', 'pinturaCielo', 'pinturaMuro', 'pintura', 'cenefa', 'pinturaCenefa', 'vinilico', 'epoxico', 'guardapolvo', 'imperMuros', 'imper', 'cortafuego', null, null, null]);
const conocidos = new Set(['8.2.3.3.9-2', '8.2.3.3.5-1', 'CU.8.2.3-9', 'DI.1-3', 'CT.P.1-7', 'RT.(-1)-1']);
assert.deepEqual(['CU,8,2,3-9', 'DI 1-3', 'CT.P.1.-7', ' rt.(-1)-1 ', '8.2.3.3.9-2', '9.9.9.9-1', 'AA-AE/A1-A11', 'HPC-ARQ-FDI-075-Rev01', 'total', ''].map(c => P.normalizarCodigo(c, conocidos)),
  ['CU.8.2.3-9', 'DI.1-3', 'CT.P.1-7', 'RT.(-1)-1', '8.2.3.3.9-2', null, null, null, null, null]);

// ---------- Lectura ----------
const hojas = [{nombre: 'DATOS', aoa: [['x']]}, {nombre: 'CIELO DURO', aoa: cieloDuro}, {nombre: 'PAVIMENTO', aoa: pavimento}, {nombre: 'PINTURA', aoa: pintura}, {nombre: 'IMPER', aoa: sinCodigo}, {nombre: 'TABIQUERIA', aoa: cieloDuro}];
assert.equal(P.pisoDeLibro(hojas, 'cualquiera.xlsx'), 'N02');
assert.equal(P.pisoDeLibro([{nombre: 'DATOS', aoa: [['x']]}], 'HPC- Medicion Avance S01.xlsx'), 'N-1');
const planilla = P.leerPlanilla(hojas, {conocidos, archivo: 'HPC-Medicion Avance N02.xlsx'});
assert.equal(planilla.nivel, 'N02');
const hoja = n => planilla.hojas.filter(h => h.hoja === n);
assert.deepEqual(hoja('CIELO DURO')[0].etapas, ['Estructura', 'Tapado', 'Huincha']);
assert.deepEqual(hoja('PAVIMENTO')[0].etapas, ['Reparación sobrelosa', 'Autonivelante', 'Pavimento']); // con las tildes de la planilla
assert.deepEqual(hoja('PINTURA').map(h => [h.familia, h.etapas.join('/')]), [['pinturaMuro', 'Pasta/Latex/1ra mano/2da mano'], ['pinturaCielo', 'Pasta/Latex/1ra mano/2da mano']]);
assert.equal(hoja('IMPER')[0].motivo, 'La columna de código de recinto está vacía');
assert.equal(hoja('TABIQUERIA')[0].motivo, 'No es una partida por recinto');
assert.equal(hoja('DATOS')[0].motivo, 'No es una partida por recinto');
// Cielo duro: total ejecutado ÷ superficie; etapas por separado; el código con comas calza; el desconocido queda fuera.
assert.deepEqual(planilla.recintos['8.2.3.3.9-2'].cieloDuro, [0.93, 10, [1, 1, 0]]);
assert.deepEqual(planilla.recintos['8.2.3.3.5-1'].cieloDuro, [1, 20, [1, 1, 1]]);
assert.deepEqual(planilla.recintos['CU.8.2.3-9'].cieloDuro, [0, 5, [0, 0, 0]]);
assert.deepEqual(planilla.fuera, [{codigo: '9.9.9.9-1', familias: ['cieloDuro']}]);
// Pavimento: dos filas del recinto ponderadas por superficie (30 m² al 100 % y 10 m² al 0 %).
assert.deepEqual(planilla.recintos['8.2.3.3.9-2'].pavimento, [0.75, 40, [1, 0.75, 0.75]]);
assert.deepEqual(planilla.recintos['8.2.3.3.5-1'].pavimento, [0.17, 20, [0.5, 0, 0]]);
// Pintura: el ponderado de la oficina (m²) sobre el total de muros y de cielos.
assert.deepEqual(planilla.recintos['8.2.3.3.9-2'].pinturaMuro, [0.41, 100, [1, 1, 0, 0]]);
assert.deepEqual(planilla.recintos['8.2.3.3.9-2'].pinturaCielo, [1, 10, [1, 1, 1, 1]]);
// Sin total ni pesos escritos: pesos de la familia (cielo modular 37 / 63). El código sale de la columna que lo trae.
const s01 = P.leerPlanilla([{nombre: 'CIELO MODULAR', aoa: modularS01}], {conocidos: new Set([1, 2, 3, 4, 5, 6, 7].map(i => `CT.F.(-1)-${i}`)), archivo: 'x.xlsx'});
assert.equal(s01.nivel, 'N-1');
assert.deepEqual([s01.recintos['CT.F.(-1)-1'].cieloModular, s01.recintos['CT.F.(-1)-7'].cieloModular], [[0.37, 10, [1, 0]], [1, 10, [1, 1]]]);
// Totales por familia y diferencias entre dos cargas.
const totales = Object.fromEntries(P.totalesPorFamilia(planilla).map(t => [t.familia, t]));
assert.deepEqual([totales.cieloDuro.recintos, totales.cieloDuro.terminados, Math.round(totales.cieloDuro.ejecutado * 10) / 10, totales.cieloDuro.cantidad], [3, 1, 29.3, 35]);
const nueva = structuredClone(planilla); nueva.recintos['CU.8.2.3-9'].cieloDuro = [0.63, 5, [1, 0, 0]];
assert.deepEqual(P.compararPlanillas(planilla, nueva), [{code: 'CU.8.2.3-9', familia: 'cieloDuro', antes: 0, despues: 0.63}]);
assert.equal(P.compararPlanillas(planilla, planilla).length, 0);
assert.ok(P.compararPlanillas(null, planilla).every(c => c.antes === null && c.despues > 0));
// Validación de lo que se guarda.
const guardada = {...planilla, cargada: '2026-11-10T12:00:00.000Z', por: 'Oficina técnica'};
assert.equal(P.validarPlanilla(guardada), guardada);
assert.throws(() => P.validarPlanilla(planilla), /fecha o el responsable/);
assert.throws(() => P.validarPlanilla({...guardada, nivel: 'N09'}), /inválida/);
assert.throws(() => P.validarPlanilla({...guardada, recintos: {'1.1-1': {cieloDuro: [1.4, 1, []]}}}), /Avance inválido/);
assert.ok(JSON.stringify(guardada).length < 5000);

// ---------- Planilla → partidas del recinto ----------
const fams = planilla.recintos['8.2.3.3.9-2'];
assert.deepEqual(['6.3.3', '6.3.2', '6.3.4', '6.1.4.3', 'T-PAV-109', '6.4.2.1', '6.4.1.1', '6.2.2', '2.6', '5.1', 'T-CIE-205'].map(id => P.familiaDePartida(id, fams)),
  ['cieloDuro', 'cieloDuro', null, 'pavimento', 'pavimento', 'pinturaCielo', 'pinturaMuro', 'pinturaMuro', null, null, 'cieloDuro']);
// La hoja específica de pavimento manda sobre la general.
assert.equal(P.familiaDePartida('6.1.4.3', {pavimento: [1, 1, []], vinilico: [0.5, 1, []]}), 'vinilico');
// El empaste toma la etapa «Pasta» de la pintura de muros.
assert.deepEqual(P.avanceDePartida('6.2.2', fams, planilla.hojas), {familia: 'pinturaMuro', pct: 1, etapas: [{nombre: 'Pasta', pct: 1}]});
assert.deepEqual(P.avanceDePartida('6.3.3', fams, planilla.hojas).etapas.map(e => [e.nombre, e.pct]), [['Estructura', 1], ['Tapado', 1], ['Huincha', 0]]);

// Recinto húmedo con cielo 202, pavimento 105 y muros pintados: sus partidas con la planilla encima.
const pma = {main: [{level: 'A-N02', code: '8.2.3.3.9-2', name: 'Vestuarios', unit: 'U', area: '10', asepsis: 'BAJA', PAV: '105', CIE: '202', M1: '11', M2: '11', M3: '11', M4: '11'}], materials: new Map()};
const reporte = (registros, p) => M.reporteAvance(pma, new Map(), registros, 'N02', p).filas[0];
const nodo = (f, id) => f.nodos.find(n => n.id === id);
const sin = reporte([], null);
assert.deepEqual([nodo(sin, '6.3.3').ejecucion, nodo(sin, '6.3.3').registrada, sin.estado], ['No iniciado', false, 'Sin iniciar']);
const con = reporte([], guardada);
assert.deepEqual([nodo(con, '6.3.3').ejecucion, nodo(con, '6.3.3').pct, nodo(con, '6.3.3').fuente, nodo(con, '6.3.3').registrada], ['En ejecución', 93, 'planilla', true]);
assert.deepEqual(nodo(con, '6.3.3').etapas.map(e => e.pct), [1, 1, 0]);
assert.deepEqual([nodo(con, '6.1.4.3').ejecucion, nodo(con, '6.1.4.3').pct], ['En ejecución', 75]);
assert.deepEqual([nodo(con, '6.4.2.1').ejecucion, nodo(con, '6.4.2.1').revision], ['Instalado', 'Sin revisar']);
assert.deepEqual([nodo(con, '6.2.2').ejecucion, nodo(con, '6.4.1.1').pct], ['Instalado', 41]);
assert.equal(nodo(con, '2.6').registrada, false); // la planilla no trae sobrelosa en esta carga
assert.equal(con.registro, undefined); assert.equal(con.estado, 'En curso');
// La planilla de otro piso no se aplica.
assert.equal(nodo(reporte([], {...guardada, nivel: 'N03'}), '6.3.3').registrada, false);
// m² ejecutados de la partida desde el % de la planilla.
assert.equal(Math.round(nodo(con, '6.3.3').m2Ejecutado * 10) / 10, 9.3);

// ---------- Precedencia: la planilla es la base y lo marcado en terreno después manda ----------
const firma = {responsable: 'Capataz', fecha: '2026-11-11'};
// Terreno marca «Instalado» el cielo después de la carga: parte de lo que mostraba la planilla y manda sobre ella.
const base = {partidas: {'6.3.3': con.vigente.partidas['6.3.3']}, protocolos: {}};
const marcado = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, base, '6.3.3', {ejecucion: 'Instalado'}, {...firma, at: '2026-11-11T15:00:00.000Z'});
assert.deepEqual([marcado.partidas['6.3.3'].ejecucion, marcado.partidas['6.3.3'].at, marcado.partidas['6.3.3'].fuente, marcado.partidas['6.3.3'].etapas.map(e => e.pct)], ['Instalado', '2026-11-11T15:00:00.000Z', undefined, [1, 1, 1]]); // instalada: sus etapas quedan completas
const tras = reporte([marcado], guardada);
assert.deepEqual([nodo(tras, '6.3.3').ejecucion, nodo(tras, '6.3.3').fuente], ['Instalado', null]);
assert.equal(nodo(tras, '6.1.4.3').fuente, 'planilla'); // las demás partidas siguen con la planilla
// La siguiente planilla (más nueva que lo marcado) vuelve a mandar en la ejecución…
const siguiente = {...guardada, cargada: '2026-11-17T12:00:00.000Z'};
assert.deepEqual([nodo(reporte([marcado], siguiente), '6.3.3').pct, nodo(reporte([marcado], siguiente), '6.3.3').fuente], [93, 'planilla']);
// …y la revisión de terreno se conserva: conforme solo si la planilla la da por instalada.
const revisado = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, {partidas: {'6.4.2.1': con.vigente.partidas['6.4.2.1']}, protocolos: {'P-INST-CIELO': {estado: 'Liberado'}}}, '6.4.2.1', {revision: 'Con observaciones'}, {...firma, at: '2026-11-11T16:00:00.000Z'});
assert.deepEqual([nodo(reporte([revisado], siguiente), '6.4.2.1').revision, nodo(reporte([revisado], siguiente), '6.4.2.1').ejecucion], ['Con observaciones', 'Instalado']);
const conforme = {...marcado, partidas: {'6.3.3': {ejecucion: 'Instalado', revision: 'Conforme', pct: 100, at: '2026-11-11T15:00:00.000Z'}}};
assert.equal(nodo(reporte([conforme], siguiente), '6.3.3').revision, 'Sin revisar'); // la planilla dice 93 %: no puede quedar conforme
// Un registro de terreno anterior a la carga (sin hora por partida) cede ante la planilla; uno posterior, no.
const viejo = {key: 'N02|8.2.3.3.9-2', code: '8.2.3.3.9-2', level: 'N02', version: 1, at: '2026-11-01T10:00:00.000Z', responsable: 'Capataz', fecha: '2026-11-01', protocolos: {}, partidas: {'6.3.3': {ejecucion: 'No iniciado', revision: 'Sin revisar', pct: 0}}};
assert.equal(nodo(reporte([viejo], guardada), '6.3.3').pct, 93);
assert.equal(nodo(reporte([{...viejo, at: '2026-11-12T10:00:00.000Z'}], guardada), '6.3.3').pct, 0);
// Al marcar otra partida, las que no tenían hora quedan como estaban y valen la hora del registro anterior (no pasan a ser «más nuevas»).
const otro = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, viejo, '6.1.4.3', {ejecucion: 'En ejecución', pct: 20}, {...firma, at: '2026-11-12T09:00:00.000Z'});
assert.deepEqual([otro.partidas['6.3.3'], otro.atSinHora, otro.partidas['6.1.4.3'].at], [viejo.partidas['6.3.3'], '2026-11-01T10:00:00.000Z', '2026-11-12T09:00:00.000Z']);
const tercero = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, otro, '6.1.4.3', {pct: 30}, {...firma, at: '2026-11-13T09:00:00.000Z'});
assert.equal(tercero.atSinHora, '2026-11-01T10:00:00.000Z');
assert.equal(nodo(reporte([otro], guardada), '6.3.3').fuente, 'planilla');
assert.deepEqual([nodo(reporte([otro], guardada), '6.1.4.3').pct, nodo(reporte([otro], guardada), '6.1.4.3').fuente], [20, null]);
assert.deepEqual(M.validarRegistro(otro, con.nodos), []);

// ---------- Etapas marcadas en terreno ----------
// Marcar etapas guarda el % de cada una; cambiar solo la ejecución completa o vacía las etapas que traía.
const conEtapas = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, {partidas: {}, protocolos: {}}, '6.3.3',
  {ejecucion: 'Instalado', pct: 100, etapas: [{nombre: 'Estructura', pct: 1}, {nombre: 'Tapado', pct: 1}, {nombre: 'Huincha', pct: 7}]}, {...firma, at: '2026-11-11T17:00:00.000Z'});
assert.deepEqual(conEtapas.partidas['6.3.3'].etapas.map(e => e.pct), [1, 1, 1], 'el % de una etapa queda entre 0 y 1');
const sinMarcar = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, conEtapas, '6.3.3', {ejecucion: 'No iniciado'}, {...firma, at: '2026-11-11T18:00:00.000Z'});
assert.deepEqual(sinMarcar.partidas['6.3.3'].etapas.map(e => e.pct), [0, 0, 0]);
const revisada = M.actualizarNodo({code: '8.2.3.3.9-2', level: 'N02'}, con.nodos, conEtapas, '6.3.3', {revision: 'Con observaciones'}, {...firma, at: '2026-11-11T18:00:00.000Z'});
assert.deepEqual(revisada.partidas['6.3.3'].etapas.map(e => e.pct), [1, 1, 1], 'la revisión no toca las etapas');
assert.deepEqual(nodo(reporte([{...conEtapas, key: 'N02|8.2.3.3.9-2', code: '8.2.3.3.9-2', level: 'N02'}], guardada), '6.3.3').etapas.map(e => e.pct), [1, 1, 1]);

// ---------- Avance de una partida por recinto (panel por partida y Proyectos) ----------
assert.deepEqual(P.categoriasFamilia(['Estructura', 'Tapado', 'Huincha']), ['Sin iniciar', 'En estructura', 'En tapado', 'En huincha', 'Terminado']);
assert.deepEqual([[0, [0, 0, 0]], [0.3, [1, 0, 0]], [0.63, [1, 0.5, 0]], [0.93, [1, 1, 0]], [1, [1, 1, 1]], [0.2, [0.3, 0, 0]]].map(([p, e]) => P.categoriaEtapas(p, e, ['Estructura', 'Tapado', 'Huincha'])),
  ['Sin iniciar', 'En tapado', 'En tapado', 'En huincha', 'Terminado', 'En estructura']);
assert.equal(P.categoriaEtapas(0.9, [1, 1, 1], ['Estructura', 'Tapado', 'Huincha']), 'En huincha', 'manda el total de la oficina');
assert.equal(Object.keys(P.coloresFamilia(['A', 'B'])).length, 4);
assert.deepEqual(P.pesosDe(guardada, 'cieloDuro'), [0.63, 0.3, 0.07], 'pesos escritos en la hoja');
assert.deepEqual(P.pesosDe({hojas: [{familia: 'cieloModular', etapas: ['Estructura', 'Tapado']}]}, 'cieloModular'), [0.37, 0.63], 'pesos habituales de la partida');
assert.deepEqual(P.pesosDe({hojas: [{familia: 'imper', etapas: ['A', 'B', 'C', 'D']}]}, 'imper'), [0.25, 0.25, 0.25, 0.25]);
assert.equal(Math.round(P.pctDeEtapas([1, 1, 0], [0.63, 0.3, 0.07]) * 100), 93);
const porCodigo = new Map([[con.code, con]]);
let fam = P.avanceFamilia(guardada, 'cieloDuro', porCodigo);
assert.deepEqual(fam.filas.map(f => [f.code, f.categoria, f.fuente]), [['8.2.3.3.5-1', 'Terminado', 'planilla'], ['8.2.3.3.9-2', 'En huincha', 'planilla'], ['CU.8.2.3-9', 'Sin iniciar', 'planilla']]);
assert.deepEqual([fam.terminados, fam.pendientes, Math.round(fam.ejecutado * 10) / 10, fam.cantidad], [1, 2, 29.3, 35]);
// Lo marcado en terreno después de la carga manda en el panel.
const filaTerreno = reporte([{...conEtapas, key: 'N02|8.2.3.3.9-2', code: '8.2.3.3.9-2', level: 'N02', version: 1, responsable: 'Capataz', fecha: '2026-11-11', at: '2026-11-11T17:00:00.000Z'}], guardada);
fam = P.avanceFamilia(guardada, 'cieloDuro', new Map([[filaTerreno.code, filaTerreno]]));
assert.deepEqual(fam.filas.find(f => f.code === '8.2.3.3.9-2'), {...fam.filas.find(f => f.code === '8.2.3.3.9-2'), fuente: 'terreno', categoria: 'Terminado', pct: 1, et: [1, 1, 1]});
// Cambios desde la carga anterior (detalle guardado con la carga).
const conDetalle = {...guardada, resumen: {anterior: '2026-11-03T12:00:00.000Z', detalle: [['8.2.3.3.5-1', 'cieloDuro', 0.5, 1], ['8.2.3.3.9-2', 'pavimento', 0, 0.75]]}};
assert.deepEqual([P.cambiosFamilia(conDetalle, 'cieloDuro').recintos, P.cambiosFamilia(conDetalle, 'cieloDuro').avance], [1, 10]);
assert.equal(P.cambiosFamilia(guardada, 'cieloDuro').anterior, null);

// Proyecto de la partida (enlazado a la planilla) y hoja de ruta de pendientes.
const {proyectoPartida, unidadFamilia} = await import('./dist/proyecto-partida.mjs');
const L = await import('./dist/levantamiento-model.mjs');
fam = P.avanceFamilia(guardada, 'cieloDuro', porCodigo);
const proyecto = proyectoPartida(fam, {nivel: 'N02', autor: 'Oficina', docId: 'p1', at: '2026-11-11T10:00:00.000Z'});
assert.deepEqual([proyecto.name, proyecto.vista, proyecto.version, proyecto.filas.length, proyecto.columnas[0].enlace, proyecto.columnas[0].opciones.map(o => o.nombre)],
  ['Avance · Cielo duro', 'c01', 1, 3, 'P:cieloDuro', ['Sin iniciar', 'En estructura', 'En tapado', 'En huincha', 'Terminado']]);
const ruta = proyectoPartida(fam, {nivel: 'N02', autor: 'Oficina', docId: 'p2', hojaDeRuta: true, filas: fam.filas.filter(f => f.categoria !== 'Terminado'), at: '2026-11-11T10:00:00.000Z'});
assert.deepEqual([ruta.name, ruta.filas.length, ruta.columnas.map(c => c.nombre)], ['Hoja de ruta · Cielo duro · 11-11-2026', 2, ['Estado cielo duro', 'Hoja de ruta', 'Detalle']]);
assert.equal(ruta.filas.find(f => f.code === '8.2.3.3.9-2').valores.c03, 'Estructura 100 % · Tapado 100 % · Huincha 0 % · pendiente 0,7 m²');
assert.deepEqual([unidadFamilia('cortafuego'), unidadFamilia('cieloDuro')], ['ml', 'm²']);
// La columna enlazada toma la categoría vigente; sin enlace usa el valor guardado. El editor no acepta enlaces raros.
const col = proyecto.columnas[0], filaP = proyecto.filas.find(f => f.code === '8.2.3.3.9-2');
assert.equal(L.opcion(col, L.valor(col, filaP, (code, enlace) => enlace === 'P:cieloDuro' ? {categoria: 'Terminado'} : null).id).nombre, 'Terminado');
assert.equal(L.valor(col, filaP, (code, enlace) => enlace === 'P:cieloDuro' ? {categoria: 'Terminado'} : null).rombo, true);
assert.equal(L.opcion(col, L.valor(col, filaP, null).id).nombre, 'En huincha');
assert.throws(() => L.validarLevantamiento({...proyecto, columnas: [{...col, enlace: 'P:x y'}]}), /Solo una columna/);
assert.throws(() => L.validarLevantamiento({...proyecto, columnas: [{...col, tipo: 'texto', enlace: 'P:cieloDuro'}]}), /Solo una columna/);

// ---------- Devolver la planilla con lo de terreno ----------
const Dv = await import('./dist/planilla-avance-devolver.mjs');
// Celdas: se reemplaza el valor (sin tocar estilo), se inserta en orden la que no existía y no se toca una fórmula.
const xml = '<worksheet><sheetData><row r="5" spans="1:5"><c r="B5" s="3"/><c r="D5" s="4" t="s"><v>7</v></c><c r="E5"><f>B5*2</f><v>0</v></c></row><row r="6" s="2" customFormat="1"/></sheetData></worksheet>';
assert.equal(Dv.escribirCelda(xml, 'B5', 1), '<worksheet><sheetData><row r="5" spans="1:5"><c r="B5" s="3"><v>1</v></c><c r="D5" s="4" t="s"><v>7</v></c><c r="E5"><f>B5*2</f><v>0</v></c></row><row r="6" s="2" customFormat="1"/></sheetData></worksheet>');
assert.equal(Dv.escribirCelda(xml, 'D5', 0.5).includes('<c r="D5" s="4"><v>0.5</v></c>'), true, 'quita el tipo texto');
assert.equal(Dv.escribirCelda(xml, 'C5', 1).includes('<c r="B5" s="3"/><c r="C5"><v>1</v></c><c r="D5"'), true, 'inserta en orden de columna');
assert.equal(Dv.escribirCelda(xml, 'E5', 1), null, 'no toca fórmulas');
assert.equal(Dv.escribirCelda(xml, 'A6', 1).includes('<row r="6" s="2" customFormat="1"><c r="A6"><v>1</v></c></row>'), true);
assert.equal(Dv.escribirCelda(xml, 'A9', 1), null, 'fila inexistente');
// Avance de terreno posterior a la carga y celdas a escribir en la hoja del cielo duro.
const terreno = Dv.avanceDeTerreno(guardada, {filas: [filaTerreno]});
assert.deepEqual([...terreno.porFamilia.keys()], ['cieloDuro']);
assert.deepEqual(terreno.porFamilia.get('cieloDuro').get('8.2.3.3.9-2'), [1, 1, 1]);
const plan = Dv.celdasDevolver([{nombre: 'CIELO DURO', aoa: cieloDuro, origen: {r: 0, c: 0}}], terreno.porFamilia, conocidos);
assert.deepEqual(plan.celdas.map(c => [c.ref, c.valor]), [['V6', 1]], 'solo cambia la huincha de ese recinto');
// Escritura en un libro de Excel real (SheetJS): se conserva lo demás y queda para recalcular al abrir.
const {createRequire: requerir} = await import('node:module'), XL = requerir(import.meta.url)('./dist/vendor/xlsx.full.min.js');
const libro = XL.utils.book_new(), hojaX = XL.utils.aoa_to_sheet(cieloDuro);
hojaX.AB6 = {t: 'n', f: 'SUM(Y6:AA6)', v: 9.3}; XL.utils.book_append_sheet(libro, hojaX, 'CIELO DURO'); XL.utils.book_append_sheet(libro, XL.utils.aoa_to_sheet([['x']]), 'DATOS');
const original = new Uint8Array(XL.write(libro, {type: 'array', bookType: 'xlsx'})), escrito = Dv.escribirPlanilla(XL, original, plan.celdas);
assert.deepEqual([escrito.escritas, escrito.conFormula, escrito.sinFila], [1, 0, 0]);
const releido = XL.read(escrito.bytes, {type: 'array', cellFormula: true});
assert.deepEqual([releido.Sheets['CIELO DURO'].V6.v, releido.Sheets['CIELO DURO'].AB6.f, releido.Sheets['CIELO DURO'].E6.v, releido.Sheets.DATOS.A1.v], [1, 'SUM(Y6:AA6)', '8.2.3.3.9-2', 'x']);
assert.match(new TextDecoder().decode(XL.CFB.find(XL.CFB.read(escrito.bytes, {type: 'array'}), '/xl/workbook.xml').content), /fullCalcOnLoad="1"/);
assert.equal(Dv.escribirPlanilla(XL, original, [{hoja: 'CIELO DURO', ref: 'AB6', valor: 1}]).conFormula, 1);

// ---------- Nube: el servidor acepta el tipo «planilla» y el SQL lo valida ----------
const llamadas = [];
const campo = createCampo({SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'k'}, async (url, init) => {
  llamadas.push([new URL(url).pathname + new URL(url).search, init.body ? JSON.parse(init.body) : null]);
  return {ok: true, status: 200, json: async () => new URL(url).pathname.startsWith('/rest/v1/rpc/') ? {tipo: 'planilla', id: 'avance-N02', version: 1} : []};
});
const pedir = async (method, ruta, body) => {
  const datos = body ? Buffer.from(JSON.stringify(body)) : null, res = {writeHead(s) { this.status = s; }, end(t) { this.body = JSON.parse(t); }};
  const req = {method, headers: {'x-campo-session': 't', host: 'atlas', ...(body ? {'content-type': 'application/json'} : {})}, socket: {}, async *[Symbol.asyncIterator]() { if (datos) yield datos; }};
  await campo(req, res, new URL('http://atlas' + ruta)); return res;
};
assert.equal((await pedir('POST', '/api/campo', {tipo: 'planilla', id: 'avance-N02', version: 0, data: guardada})).status, 200);
assert.deepEqual([llamadas.at(-1)[0], llamadas.at(-1)[1].p_tipo, llamadas.at(-1)[1].p_id], ['/rest/v1/rpc/guardar_atlas_campo', 'planilla', 'avance-N02']);
assert.equal((await pedir('GET', '/api/campo?tipo=planilla')).status, 200);
assert.match(llamadas.at(-1)[0], /tipo=eq\.planilla/);
assert.equal((await pedir('GET', '/api/campo?tipo=otra')).status, 400);
const sql = fs.readFileSync(new URL('./supabase/planillas-avance.sql', import.meta.url), 'utf8');
assert.match(sql, /check \(tipo in \('proyecto','observacion','contorno','planilla'\)\)/);
assert.match(sql, /p_tipo = 'planilla' and .*'avance-' \|\| \(p_data->>'nivel'\)/s);
assert.match(sql, /p_tipo = 'contorno'/); // no pierde la validación de contornos al reemplazar la función

// ---------- Planillas reales (opcional, fuera del repo): PLANILLAS_AVANCE=carpeta con los .xlsx ----------
if (process.env.PLANILLAS_AVANCE) {
  const {createRequire} = await import('node:module'), XLSX = createRequire(import.meta.url)('./dist/vendor/xlsx.full.min.js');
  const rooms = JSON.parse(fs.readFileSync(new URL('./dist/progress-room-levels.json', import.meta.url), 'utf8')).rooms;
  for (const archivo of fs.readdirSync(process.env.PLANILLAS_AVANCE).filter(f => /\.xlsx$/i.test(f))) {
    const libro = XLSX.read(fs.readFileSync(process.env.PLANILLAS_AVANCE + '/' + archivo), {type: 'buffer'});
    const hs = libro.SheetNames.filter((_, i) => !libro.Workbook?.Sheets?.[i]?.Hidden).map(nombre => ({nombre, aoa: XLSX.utils.sheet_to_json(libro.Sheets[nombre], {header: 1, raw: true, defval: null})}));
    const piso = P.pisoDeLibro(hs, archivo), p = P.leerPlanilla(hs, {conocidos: new Set(Object.keys(rooms).filter(c => rooms[c].includes(piso))), archivo});
    assert.ok(piso && Object.keys(p.recintos).length > 250, archivo + ': pocos recintos');
    assert.ok(JSON.stringify(p).length < 400000, archivo + ': demasiado grande para la nube');
    P.validarPlanilla({...p, cargada: new Date().toISOString(), por: 'prueba'});
    console.log(`${archivo}: piso ${piso}, ${Object.keys(p.recintos).length} recintos, ${p.hojas.filter(h => h.recintos).length} hojas, ${p.fuera.length} códigos fuera`);
  }
}
console.log('planilla-avance-test: ok');
