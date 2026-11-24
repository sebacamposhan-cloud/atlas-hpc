// Excel con formato de informe (dist/excel-informe.mjs): el archivo se abre con la librería xlsx (como lo abriría Excel),
// trae el encabezado del informe, la tabla con sus filas y los estilos (encabezado azul, colores de estado, anchos).
// También: el informe de puertas filtradas (puertas-model.mjs) y que el Excel de un levantamiento se vuelva a importar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {libroInforme, nombreXlsx, letra, zip} from './dist/excel-informe.mjs';
import * as P from './dist/puertas-model.mjs';
import * as L from './dist/levantamiento-model.mjs';

const require = createRequire(import.meta.url), XLSX = require('./dist/vendor/xlsx.full.min.js');

assert.equal(letra(0), 'A'); assert.equal(letra(25), 'Z'); assert.equal(letra(26), 'AA'); assert.equal(letra(27), 'AB');
assert.equal(nombreXlsx('Puertas N02 / No instalada'), 'Puertas N02 - No instalada.xlsx');

const info = {
  piso: 'N02', titulo: 'Puertas · No instaladas', tipo: 'Puertas', detalle: '2 de 394 puertas', autor: 'Persona de prueba',
  actualizado: '2026-11-24T12:00:00Z', proposito: 'Avance de instalación de puertas & <pruebas> sobre el plano.',
  leyenda: [{nombre: 'No instalada', color: '#b23a2e', n: 2}, {nombre: 'Instalada', color: '#2e7d32', n: 0}],
  columnas: ['Vano', 'Llave', 'Modelo', 'Estado'],
  filas: [[12, 'A-201', 'PI01', {texto: 'No instalada', color: '#b23a2e'}], [40, 'A-310', 'PAS3', {texto: 'No instalada', color: '#b23a2e'}]]
};
const bytes = libroInforme(info, {hoja: 'Puertas', alcance: 'Nivel 2', nota: 'Prueba & nota'});
assert.ok(bytes instanceof Uint8Array && bytes.length > 1000);
assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'es un zip');

const libro = XLSX.read(bytes, {type: 'array', cellStyles: true});
assert.deepEqual(libro.SheetNames, ['Puertas']);
const hoja = libro.Sheets.Puertas, aoa = XLSX.utils.sheet_to_json(hoja, {header: 1, defval: ''});
assert.equal(aoa[0][0], 'N02'); assert.equal(aoa[0][1], 'Puertas · No instaladas');
assert.match(aoa[1][1], /Puertas · Nivel 2 · 2 de 394 puertas/);
const texto = aoa.map(f => f.join('|')).join('\n');
assert.match(texto, /Realizado por\|Persona de prueba/);
assert.match(texto, /Propósito\|Avance de instalación de puertas & <pruebas> sobre el plano\./, 'los caracteres especiales sobreviven');
assert.match(texto, /2\|No instalada/, 'simbología con cantidad');
assert.ok(!/^0\|Instalada/m.test(texto), 'la simbología omite los estados sin puertas');
const cab = aoa.findIndex(f => f[0] === 'Vano');
assert.ok(cab > 3, 'la tabla va después del encabezado del informe');
assert.deepEqual(aoa[cab], ['Vano', 'Llave', 'Modelo', 'Estado']);
assert.deepEqual(aoa.slice(cab + 1).filter(f => f.some(Boolean)), [[12, 'A-201', 'PI01', 'No instalada'], [40, 'A-310', 'PAS3', 'No instalada']]);
// Ninguna fila antes del encabezado tiene 3 celdas con texto: el importador de levantamientos encuentra la tabla.
assert.ok(aoa.slice(0, cab).every(f => f.filter(v => String(v).trim()).length < 3));
assert.equal(hoja['!autofilter']?.ref, `A${cab + 1}:D${cab + 3}`);
assert.ok(hoja['!merges'].length >= 3);

// Estilos: lee styles.xml y la hoja del zip.
const partes = XLSX.CFB.read(bytes, {type: 'array'});
const leer = nombre => new TextDecoder().decode(XLSX.CFB.find(partes, nombre).content);
const estilos = leer('/xl/styles.xml'), xmlHoja = leer('/xl/worksheets/sheet1.xml');
assert.match(estilos, /rgb="FF1B2A56"/, 'encabezado azul');
assert.match(estilos, /<left style="thick"><color rgb="FFB23A2E"\/>/, 'barra del color del estado');
assert.match(estilos, /<sz val="26"\/>/, 'piso en grande');
assert.match(xmlHoja, /showGridLines="0"/);
assert.match(xmlHoja, /fitToWidth="1"/);
assert.match(xmlHoja, /Prueba &amp;&amp; nota/, 'el & del pie no se toma como código de Excel');
assert.match(leer('/xl/workbook.xml'), new RegExp(`_xlnm.Print_Titles" localSheetId="0">'Puertas'!\\$${cab + 1}:\\$${cab + 1}<`), 'el encabezado se repite al imprimir');

// Sin filas y con muchas columnas: hoja horizontal y aviso.
const vacio = XLSX.read(libroInforme({...info, leyenda: [], filas: [], columnas: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']}), {type: 'array'});
assert.match(XLSX.utils.sheet_to_csv(vacio.Sheets.Informe), /Sin filas\./);
assert.match(new TextDecoder().decode(XLSX.CFB.find(XLSX.CFB.read(libroInforme({...info, columnas: ['A', 'B', 'C', 'D', 'E', 'F', 'G']}), {type: 'array'}), '/xl/worksheets/sheet1.xml').content), /orientation="landscape"/);

// El zip guarda los archivos tal cual (CRC correcto: la librería lo valida al leer).
const z = XLSX.CFB.read(zip([['a.txt', new TextEncoder().encode('hola')]]), {type: 'array'});
assert.equal(new TextDecoder().decode(XLSX.CFB.find(z, 'a.txt').content), 'hola');

// Puertas: informe con el filtro de la Simbología (PDF y Excel con las mismas puertas).
const catalogo = P.validarCatalogo(JSON.parse(fs.readFileSync('dist/n02/puertas.json', 'utf8')));
const filtro = {estados: new Set(['no_instalada']), contratista: '', texto: ''};
const lista = P.filtrar(catalogo.puertas, filtro);
const inf = P.informePuertas(catalogo, null, lista, {piso: 'N02', nivelNombre: 'Nivel 2', filtro});
assert.equal(inf.archivo, 'Puertas N02 - No instalada');
assert.equal(inf.pdf.titulo, 'Puertas · No instalada');
assert.equal(inf.pdf.detalle, `${lista.length} de 394 puertas de Nivel 2 · Filtro: Estado: No instalada`);
assert.deepEqual(inf.pdf.leyenda, [{nombre: 'No instalada', color: P.ESTADOS.no_instalada.color, n: lista.length}]);
assert.equal(inf.pdf.filas.length, lista.length); assert.equal(inf.excel.filas.length, lista.length);
assert.ok(inf.pdf.filas.every(f => f[4].texto === 'No instalada'));
assert.deepEqual(inf.excel.columnas, P.ENCABEZADOS);
const vanos = inf.excel.filas.map(f => f[0]).filter(v => v !== '');
assert.ok(vanos.length && vanos.every(v => typeof v === 'number' || !/^\d+$/.test(v)), 'vanos de solo dígitos como número («40 / 41» queda texto)');
assert.ok(vanos.every((v, i) => !i || parseInt(vanos[i - 1]) <= parseInt(v)), 'vanos en orden');
assert.equal(P.textoFiltroPuertas({estados: new Set(P.ORDEN), contratista: P.SIN_CONTRATISTA, texto: ' pi01 '}), 'Contratista: sin contratista · Búsqueda: «pi01»');
const todas = P.informePuertas(catalogo, null, catalogo.puertas, {piso: 'N02'});
assert.equal(todas.pdf.titulo, 'Puertas · Avance de instalación'); assert.equal(todas.archivo, 'Puertas N02');
const libroPuertas = XLSX.read(libroInforme(inf.excel, {hoja: 'Puertas'}), {type: 'array'});
const aoaP = XLSX.utils.sheet_to_json(libroPuertas.Sheets.Puertas, {header: 1, defval: ''});
assert.equal(aoaP.filter(f => f[7] === 'No instalada').length, lista.length);

// Levantamiento: el Excel con formato se vuelve a importar (el importador encuentra la tabla bajo el encabezado).
const aoaLev = [['Nivel', 'Código de Recinto', 'Estatus', 'Listo para instalar'],
  ['N02', '3.2.1.2.3-1', {texto: 'Instalado', color: '#2e9e5b'}, {texto: 'Sí', color: '#2e9e5b'}],
  ['N02', '3.2.1.2.7-1', {texto: 'No instalado', color: '#c26a00'}, {texto: 'No', color: '#c26a00'}]];
const lev = XLSX.read(libroInforme({piso: 'N02', titulo: 'Avance · Cielo duro', tipo: 'Levantamiento', autor: 'Prueba', proposito: 'Prueba',
  leyenda: [{nombre: 'Listo para instalar', color: '#2e9e5b', n: 1}, {nombre: 'Pendiente', color: '#c26a00', n: 1}], columnas: aoaLev[0], filas: aoaLev.slice(1)}, {hoja: 'Levantamiento'}), {type: 'array'});
const propuesta = L.proponer(XLSX.utils.sheet_to_json(lev.Sheets.Levantamiento, {header: 1, defval: '', raw: false}));
assert.deepEqual(propuesta.encabezado, aoaLev[0]);
assert.equal(propuesta.filas, 2);
console.log('excel-informe ok');
