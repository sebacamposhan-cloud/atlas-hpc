import assert from 'node:assert/strict';
import {VACIO, valoresDe, filtrar, ordenar, aplicar, opciones, fijar, activos, coincide} from './dist/column-filters.mjs';

// Filtros de columna tipo Excel: valores por columna, conteos en cascada, orden estable y «todo elegido» = sin filtro.
const filas = [
  {id: 1, estado: 'Abierta', resp: 'Valencia', cat: ['Cielo'], plazo: '2026-10-30'},
  {id: 2, estado: 'Abierta', resp: 'Sacyr', cat: ['Otro', 'Muros'], plazo: null},
  {id: 3, estado: 'Cerrada', resp: 'Valencia', cat: ['Muros'], plazo: '2026-11-04'},
  {id: 4, estado: 'En corrección', resp: '', cat: [], plazo: '2026-10-28'}
];
const columnas = [
  {key: 'estado', titulo: 'Estado', valor: f => f.estado, opciones: ['Abierta', 'En corrección', 'Corregida', 'Cerrada']},
  {key: 'resp', titulo: 'Responsable', valor: f => f.resp},
  {key: 'cat', titulo: 'Categoría', valor: f => f.cat},
  {key: 'plazo', titulo: 'Plazo', valor: f => f.plazo, etiqueta: v => v.split('-').reverse().join('-'), orden: f => f.plazo || '9999'}
];
assert.deepEqual(valoresDe(columnas[1], filas[3]), [VACIO], 'vacío cuenta como (Vacías)');
assert.deepEqual(valoresDe(columnas[2], filas[3]), [VACIO], 'lista vacía también');
const ids = l => l.map(f => f.id);

const estado = {filtros: {}};
assert.deepEqual(ids(filtrar(filas, columnas, estado)), [1, 2, 3, 4], 'sin filtros pasan todas');
estado.filtros.resp = ['Valencia'];
assert.deepEqual(ids(filtrar(filas, columnas, estado)), [1, 3]);
estado.filtros.cat = ['Muros'];
assert.deepEqual(ids(filtrar(filas, columnas, estado)), [3], 'columnas con varios valores: basta uno');
// Conteos en cascada: el menú de Estado cuenta solo lo que deja Responsable y Categoría.
assert.deepEqual(opciones(filas, columnas, estado, 'estado').map(o => [o.valor, o.n]), [['Cerrada', 1]]);
// El menú de Categoría ignora su propio filtro (para poder ampliarlo) y conserva lo elegido.
assert.deepEqual(opciones(filas, columnas, estado, 'cat').map(o => [o.valor, o.n]), [['Cielo', 1], ['Muros', 1]]);
estado.filtros = {estado: ['Corregida']};
assert.deepEqual(opciones(filas, columnas, estado, 'estado').map(o => [o.valor, o.n]), [['Abierta', 2], ['En corrección', 1], ['Corregida', 0], ['Cerrada', 1]], 'orden fijo y elegido sin filas');
assert.deepEqual(opciones(filas, columnas, {filtros: {}}, 'resp').map(o => o.valor), ['Sacyr', 'Valencia', VACIO], 'alfabético y (Vacías) al final');
assert.deepEqual(opciones(filas, columnas, {filtros: {}}, 'plazo').map(o => o.etiqueta), ['28-10-2026', '30-10-2026', '04-11-2026', VACIO]);

// Elegir todo lo disponible quita el filtro.
const e2 = {filtros: {}};
fijar(e2, 'resp', ['Valencia', 'Sacyr', VACIO], ['Sacyr', 'Valencia', VACIO]);
assert.equal(e2.filtros.resp, undefined);
fijar(e2, 'resp', [VACIO], ['Sacyr', 'Valencia', VACIO]);
assert.deepEqual(ids(filtrar(filas, columnas, e2)), [4], 'se puede filtrar por (Vacías)');
assert.equal(activos(columnas, e2), 1);

// Orden estable por la clave de la columna, ascendente y descendente.
assert.deepEqual(ids(ordenar(filas, columnas, {orden: {key: 'plazo', dir: 'asc'}})), [4, 1, 3, 2]);
assert.deepEqual(ids(ordenar(filas, columnas, {orden: {key: 'plazo', dir: 'desc'}})), [2, 3, 1, 4]);
assert.deepEqual(ids(ordenar(filas, columnas, {orden: {key: 'resp', dir: 'asc'}})), [2, 1, 3, 4], 'empates conservan el orden original');
assert.deepEqual(ids(aplicar(filas, columnas, {filtros: {estado: ['Abierta']}, orden: {key: 'resp', dir: 'desc'}})), [1, 2]);
assert.deepEqual(ids(ordenar(filas, columnas, {orden: null})), [1, 2, 3, 4]);

// Búsqueda del menú sin tildes ni mayúsculas.
assert(coincide('En corrección', 'CORRECCION') && coincide('Muros y tabiques', ' tabi') && !coincide('Cielo', 'muro'));
console.log(JSON.stringify({checks: 'passed', scope: 'Filtros de columna tipo Excel: valores y (Vacías), columnas con varios valores, conteos en cascada, orden fijo o alfabético, todo elegido = sin filtro, orden estable ascendente y descendente, búsqueda sin tildes.'}));
