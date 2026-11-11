import assert from 'node:assert/strict';
import {newMarking, validateMarking, addMarkedRoom, removeMarkedRoom, upgradeMarking, setEstados, addCut, removeCut, compareCuts, markingItems, actual, PLANTILLAS, CAMBIOS, MAX_ESTADOS} from './dist/marking-model.mjs';

// Proyectos sobre los documentos de marcado: leyenda de estados, pintado por estado, cortes con fecha y comparación.
const datos = {name: 'Pisos vinílicos', author: 'QA', purpose: 'Levantamiento de vinílicos instalados'}, source = {code: 'HPC-ARQ-PLA-N01-A-501', revision: 'Rev01_V3'};
const room = (id, code) => ({id, code, name: 'Recinto ' + code});
const [a, b, c] = [room('ra', '5.1-1'), room('rb', '5.2-1'), room('rc', '5.3-1')];

// Un documento antiguo (esquema 1) sigue siendo válido y se lleva al esquema 2 con un estado «Marcado» de su color.
const antiguo = {schema: 1, specialty: 'architecture', id: 'doc-1', level: 'N01', ...datos, color: '#aa3300', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', version: 3, nextNumber: 2,
  rooms: [{id: 'ra', code: '5.1-1', name: 'Recinto 5.1-1', source: source.code, revision: source.revision, number: 1}]};
assert.equal(validateMarking(antiguo), antiguo);
const mejorado = upgradeMarking(antiguo);
assert.equal(mejorado.schema, 2); assert.equal(mejorado.version, 3, 'la conversión no cambia la versión guardada');
assert.deepEqual(mejorado.estados, [{id: 'marcado', nombre: 'Marcado', color: '#aa3300'}]); assert.equal(mejorado.rooms[0].estado, 'marcado');

// Proyecto con la plantilla de avance: el pincel decide el estado; repetir el mismo estado no cambia nada; otro estado conserva el número.
let p = newMarking({...datos, estados: PLANTILLAS.avance}, 'N01', 'p1');
assert.deepEqual(p.estados.map(e => e.nombre), ['Pendiente', 'En ejecución', 'Terminado']);
p = addMarkedRoom(p, a, source, 'terminado'); p = addMarkedRoom(p, b, source, 'ejecucion'); p = addMarkedRoom(p, c, source);
assert.deepEqual(p.rooms.map(r => [r.number, r.estado]), [[1, 'terminado'], [2, 'ejecucion'], [3, 'pendiente']], 'sin estado indicado se usa el primero de la leyenda');
assert.equal(addMarkedRoom(p, a, source, 'terminado'), p, 'tocar con el mismo estado no cambia el proyecto');
assert.equal(addMarkedRoom(p, a, source), p, 'tocar sin estado un recinto ya pintado no lo cambia');
assert.deepEqual(addMarkedRoom(p, a, source, 'pendiente').rooms.find(r => r.id === 'ra'), {...p.rooms[0], estado: 'pendiente'}, 'cambiar el estado conserva el número');
assert.throws(() => addMarkedRoom(p, room('rx', '9-1'), source, 'inventado'), /leyenda/);

// Leyenda: nombres y colores obligatorios, sin repetidos y con máximo de estados; quitar un estado lleva sus recintos al primero.
assert.throws(() => setEstados(p, []), /entre 1 y/);
assert.throws(() => setEstados(p, [{id: 'x', nombre: 'A', color: '#000000'}, {id: 'y', nombre: ' a ', color: '#111111'}]), /repetidos/);
assert.throws(() => setEstados(p, [{id: 'x', nombre: 'A', color: 'red'}]), /incompleto/);
assert.throws(() => setEstados(p, Array.from({length: MAX_ESTADOS + 1}, (_, i) => ({id: 'e' + i, nombre: 'E' + i, color: '#000000'}))), /entre 1 y/);
const sinEjecucion = setEstados(p, [PLANTILLAS.avance[0], PLANTILLAS.avance[2]]);
assert.equal(sinEjecucion.rooms.find(r => r.id === 'rb').estado, 'pendiente'); assert.equal(sinEjecucion.color, PLANTILLAS.avance[0].color);

// Cortes: guardan los estados del momento; los cambios posteriores no los alteran.
p = addCut(p, {id: 'c-sep', nombre: 'Cierre septiembre', fecha: '2026-09-30', autor: 'QA', at: '2026-09-30T20:00:00.000Z'});
assert.throws(() => addCut(p, {id: 'c-mal', nombre: 'Sin fecha', fecha: '', autor: 'QA'}), /Corte mal registrado/);
assert.throws(() => addCut(p, {id: 'c-mal', nombre: ' ', fecha: '2026-10-01', autor: 'QA'}), /Corte mal registrado/);
p = addMarkedRoom(p, c, source, 'terminado'); p = addMarkedRoom(p, b, source, 'pendiente'); p = addMarkedRoom(p, room('rd', '5.4-1'), source, 'ejecucion'); p = removeMarkedRoom(p, 'ra');
assert.deepEqual(p.cortes[0].rooms.map(r => r.estado), ['terminado', 'ejecucion', 'pendiente'], 'el corte no cambia con el avance posterior');
const oct = addCut(p, {id: 'c-oct', nombre: 'Cierre octubre', fecha: '2026-10-31', autor: 'QA', at: '2026-10-31T20:00:00.000Z'});
assert.deepEqual(oct.cortes.map(x => x.id), ['c-sep', 'c-oct']); assert.deepEqual(removeCut(oct, 'c-sep').cortes.map(x => x.id), ['c-oct']);

// Comparación con el orden de la leyenda: avanza, sigue igual o retrocede; recintos nuevos avanzan y los quitados retroceden. Totaliza m².
const areas = {ra: 20, rb: 10, rc: 5, rd: 8};
const comp = compareCuts(p.estados, p.cortes[0], actual(p), id => areas[id]);
const cambio = Object.fromEntries(comp.filas.map(f => [f.id, f.cambio]));
assert.deepEqual(cambio, {ra: 'retrocedio', rb: 'retrocedio', rc: 'avanzo', rd: 'avanzo'});
assert.deepEqual(comp.totales, {avanzo: 2, igual: 0, retrocedio: 2});
assert.deepEqual(comp.porEstado.map(e => [e.nombre, e.antes, e.despues, e.m2Antes, e.m2Despues]), [['Pendiente', 1, 1, 5, 10], ['En ejecución', 1, 1, 10, 8], ['Terminado', 1, 1, 20, 5]]);
assert.equal(compareCuts(p.estados, p.cortes[0], p.cortes[0]).totales.igual, 3, 'un corte comparado consigo mismo no cambia');

// Colores en el plano: estado de cada recinto o, al comparar, el tipo de cambio.
assert.deepEqual(markingItems(p).map(x => [x.id, x.color, x.number]), [['rb', '#9aa3ad', 2], ['rc', '#2e9e5b', 3], ['rd', '#d9a21b', 4]]);
assert(markingItems(p, comp).every(x => x.color === CAMBIOS[comp.filas.find(f => f.id === x.id).cambio].color && x.number === null));
// Exportación: rótulo del piso con simbología y tabla de recintos (marcado, comparación y levantamiento), y hojas PDF.
const {datosExportacion, codigoPiso, altoRotulo, paginasProyecto} = await import('./dist/marking-overlay.mjs');
const L = await import('./dist/levantamiento-model.mjs');
assert.equal(codigoPiso('N-1'), 'S01'); assert.equal(codigoPiso('N02'), 'N02');
const ex = datosExportacion(p);
assert.equal(ex.piso, 'N01'); assert.deepEqual(ex.columnas, ['N°', 'Código', 'Recinto', 'Estado']);
assert.deepEqual(ex.leyenda.map(e => [e.nombre, e.n]), p.estados.map(e => [e.nombre, p.rooms.filter(r => r.estado === e.id).length]));
assert.deepEqual(ex.filas.map(f => [f[0], f[1], f[3].color]), p.rooms.map(r => [String(r.number), r.code, p.estados.find(e => e.id === r.estado).color]));
const exComp = datosExportacion(p, {antes: p.cortes[0], despues: actual(p), resultado: comp});
assert.deepEqual(exComp.columnas, ['Código', 'Recinto', 'Antes', 'Después', 'Cambio']); assert.equal(exComp.filas.length, comp.filas.length);
assert.deepEqual(exComp.leyenda.map(e => e.n), [2, 0, 2]); assert.equal(exComp.filas[0][4].texto, 'Avanzó');
assert.equal(exComp.filas.find(f => f[2].texto === 'Sin marcar')[2].color, '#ffffff', 'un recinto que no estaba en el corte sale sin marcar');
const exAntiguo = datosExportacion(antiguo); assert.deepEqual(exAntiguo.columnas, ['N°', 'Código', 'Recinto']); assert.deepEqual(exAntiguo.leyenda, [{nombre: antiguo.name, color: '#aa3300', n: 1}]);
let lev = L.nuevoLevantamiento({name: 'Cielos', author: 'QA', purpose: 'Seguimiento', columnas: [{id: 'c01', nombre: 'Estado OOCC', tipo: 'estado', enlace: 'CIE', opciones: [{id: 'o01', nombre: 'Tapado', color: '#2e9e5b', final: true}, {id: 'o02', nombre: 'Estructurado', color: '#c26a00'}]}]}, 'N-1', 'lev1');
lev = L.fijarValor(lev, {code: '5.1-1', name: ''}, 'c01', 'o02'); lev = L.fijarValor(lev, {code: '5.2-1', name: 'Bodega'}, 'c01', 'o01');
const exLev = datosExportacion(lev, null, (code, enlace) => code === '5.1-1' && enlace === 'CIE' ? {installation: 'Instalado'} : null, code => 'Plano ' + code);
assert.equal(exLev.piso, 'S01'); assert.deepEqual(exLev.columnas, ['Código', 'Recinto', 'Listo para instalar']);
assert.deepEqual(exLev.filas, [['5.1-1', 'Plano 5.1-1', {texto: 'Listo para instalar', color: '#2e9e5b'}], ['5.2-1', 'Bodega', {texto: 'Listo para instalar', color: '#2e9e5b'}]], 'usa el estado del rombo y el nombre del plano');
assert.deepEqual(datosExportacion(lev).leyenda.map(e => [e.nombre, e.n]), [['Listo para instalar', 1], ['Pendiente', 1]]);
// Filtro de la tabla: cruza dos columnas (tipo de pavimento y estatus) y acota la tabla, el plano y la exportación.
let pav = L.nuevoLevantamiento({name: 'Pavimentos', author: 'QA', purpose: 'Producción', columnas: [
  {id: 'c01', nombre: 'Tipo Pavimento', tipo: 'lista', enlace: null, opciones: [{id: 'o01', nombre: '103 - Vinílico Acústico', color: '#e070e0'}, {id: 'o02', nombre: '105 - Vinílico Homogéneo', color: '#4060b0'}]},
  {id: 'c02', nombre: 'Estatus', tipo: 'estado', enlace: null, opciones: [{id: 'o01', nombre: 'Instalado 100%', color: '#2e9e5b', final: true}, {id: 'o02', nombre: 'No instalado', color: '#c21f1f'}]}]}, 'N02', 'pav1');
for (const [code, tipo, est] of [['1.1-1', 'o01', 'o01'], ['1.2-1', 'o01', 'o02'], ['1.3-1', 'o02', 'o01'], ['1.4-1', null, 'o02']]) { pav = L.fijarValor(pav, {code, name: 'R ' + code}, 'c02', est); if (tipo) pav = L.fijarValor(pav, {code, name: 'R ' + code}, 'c01', tipo); }
pav = L.validarLevantamiento({...pav, vista: 'c02'});
const filtro = {filtros: {c01: ['103 - Vinílico Acústico']}, orden: null};
assert.equal(L.filtroActivo(filtro), true); assert.equal(L.filtroActivo({filtros: {}}), false); assert.equal(L.filtroActivo(null), false);
assert.deepEqual(L.filasFiltradas(pav, filtro).map(f => f.code), ['1.1-1', '1.2-1']);
assert.deepEqual(L.filasFiltradas(pav, {filtros: {c01: ['Sin dato']}}).map(f => f.code), ['1.4-1'], '«Sin dato» también se filtra');
assert.deepEqual(L.filasFiltradas(pav, {filtros: {c01: ['103 - Vinílico Acústico'], c02: ['No instalado']}}).map(f => f.code), ['1.2-1']);
assert.deepEqual(L.filasFiltradas(pav, {filtros: {c02: []}}), [], 'columna filtrada sin valores: ninguna fila');
assert.equal(L.filasFiltradas(pav, null).length, 4);
assert.equal(L.textoFiltro(pav, {filtros: {c01: ['103 - Vinílico Acústico'], c02: ['No instalado', 'Sin dato']}}), 'Tipo Pavimento: 103 - Vinílico Acústico · Estatus: No instalado, Sin dato');
const exPav = datosExportacion(pav, null, null, () => '', filtro);
assert.deepEqual(exPav.filas.map(f => [f[0], f[2].texto]), [['1.1-1', 'Instalado 100%'], ['1.2-1', 'No instalado']], 'la exportación lleva solo los recintos filtrados, coloreados por la vista');
assert.deepEqual(exPav.leyenda.map(e => [e.nombre, e.n]), [['Instalado 100%', 1], ['No instalado', 1]]);
assert.equal(exPav.detalle, 'Plano coloreado por: Estatus · Filtro: Tipo Pavimento: 103 - Vinílico Acústico · 2 de 4 recintos');
assert.equal(datosExportacion(pav).filas.length, 4); assert.equal(datosExportacion(pav).detalle, 'Plano coloreado por: Estatus');
assert(altoRotulo(ex.leyenda, 10) > 9 * 10 * .78 && altoRotulo(new Array(20).fill(0), 10) === altoRotulo(new Array(6).fill(0), 10), 'la franja crece hasta seis filas de simbología');
const PDFLib = (await import('node:module')).createRequire(import.meta.url)('./dist/vendor/pdf-lib.min.js');
const pdf = await PDFLib.PDFDocument.create();
const largo = {...exLev, titulo: 'Título — con «signos» y → flecha', filas: Array.from({length: 120}, (_, i) => [`9.${i}-1`, 'Recinto de nombre muy largo '.repeat(6), {texto: 'Listo para instalar', color: i % 2 ? '#2e9e5b' : 'sin-color'}])};
assert.equal(await paginasProyecto(pdf, PDFLib, largo, {alcance: 'Nivel −1 / Ejes A-W', nota: 'Superficies auxiliares de consulta.', fuentes: 'HPC-ARQ-PLA-S01-A-501 (Rev01_V1); '.repeat(40)}), 4, 'la tabla continúa en hojas A4 con su encabezado');
assert.equal(pdf.getPageCount(), 4); assert((await pdf.save()).length > 5000);
assert.equal(await paginasProyecto(await PDFLib.PDFDocument.create(), PDFLib, {...exLev, filas: [], leyenda: []}), 1);
console.log(JSON.stringify({checks: 'passed', scope: 'Proyectos: compatibilidad con marcados de un color, leyenda de estados (validación y cambios), pintado por estado con numeración estable, cortes inmutables con fecha, comparación por orden de la leyenda con m² y colores del plano; exportación con rótulo del piso, simbología y tabla de recintos en PDF.'}));
