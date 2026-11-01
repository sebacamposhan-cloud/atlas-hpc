import assert from 'node:assert/strict';
import * as L from './dist/levantamiento-model.mjs';
import {validateMarking, upgradeMarking, markingItems, esLevantamiento} from './dist/marking-model.mjs';

// Planilla sintética con la forma de un levantamiento real: Nivel, código, una lista (tipo de cielo), estados escritos de
// varias maneras (Instalado / Instalada / instalado, No Aplica), nombre del recinto y observaciones libres.
const cab = ['Nivel', 'Código de Recinto', 'Tipo de Cielo', 'Estatus de Cielo', 'Estatus de Pavimento', 'Estatus de Puerta', 'Estatus de Pintura', 'Estatus de Ventana', 'Tipo de Recinto', 'Observaciones'];
const filas = [];
const est = ['Instalado', 'Instalada', 'instalado', 'No Instalado', 'No instalada'], cielos = ['Modular Estructurado', 'Duro Estructurado', 'Duro Tapado', 'Duro tapado'];
for (let i = 0; i < 40; i++) filas.push([['N01', 'N02', 'S01', 'N03'][i % 4], `9.9.${i}-1`, cielos[i % 4], est[i % 5], est[(i + 1) % 5], est[(i + 2) % 5], est[(i + 3) % 5], i % 3 ? 'No Aplica' : est[i % 5], 'Recinto ' + i, i === 7 ? 'Falta instalación de RMF' : '']);
filas.push(['N01', '9.9.0-1', 'Duro Tapado', 'Instalado', 'Instalado', 'Instalado', 'Instalado', 'Instalado', 'Repetido', ''], ['N09', '9.9.99-1', '', '', '', '', '', '', 'Piso raro', '']);
const p = L.proponer([['Levantamiento de artefactos'], cab, ...filas]);
assert.deepEqual([p.indiceNivel, p.indiceCodigo, p.filas], [0, 1, 42]);
const col = n => p.columnas.find(c => c.nombre === n);
assert.deepEqual(p.columnas.map(c => [c.nombre, c.tipo]), [['Tipo de Cielo', 'lista'], ['Estatus de Cielo', 'estado'], ['Estatus de Pavimento', 'estado'], ['Estatus de Puerta', 'estado'], ['Estatus de Pintura', 'estado'], ['Estatus de Ventana', 'estado'], ['Tipo de Recinto', 'texto'], ['Observaciones', 'texto']]);
assert.deepEqual(col('Tipo de Cielo').opciones.map(o => o.nombre).sort(), ['Duro estructurado', 'Duro tapado', 'Modular estructurado'], 'variantes de mayúsculas unidas');
assert.deepEqual(col('Estatus de Cielo').opciones.map(o => [o.nombre, !!o.final]).sort(), [['Instalado', true], ['No instalado', false]], 'Instalada e instalado son Instalado');
assert(col('Estatus de Ventana').opciones.find(o => o.nombre === 'No aplica').noAplica, '«No aplica» no bloquea el listo');
assert.deepEqual(['Estatus de Pavimento', 'Estatus de Cielo', 'Estatus de Pintura', 'Estatus de Puerta'].map(n => col(n).enlace), ['PAV', 'CIE', 'MUROS', null]);
assert.deepEqual(p.niveles.sort(), ['N01', 'N02', 'N03', 'N09', 'S01']);

// Un documento por piso, unidos por grupo; los avisos dicen qué quedó fuera.
const {docs, avisos} = L.construir(p, {name: 'Recintos listos para artefactos', author: 'Oficina técnica', purpose: 'Levantamiento previo a artefactos', grupo: 'g1', ids: ['a', 'b', 'c', 'd'], at: '2026-11-01T12:00:00Z'});
assert.deepEqual(docs.map(d => [d.level, d.etiquetaNivel, d.filas.length]).sort(), [['N-1', 'S01', 10], ['N01', 'N01', 10], ['N02', 'N02', 10], ['N03', 'N03', 10]]);
assert(avisos.some(a => /9\.9\.0-1 repetido/.test(a)) && avisos.some(a => /N09/.test(a)));
docs.forEach(d => { assert.equal(validateMarking(d), d); assert(esLevantamiento(d)); assert.equal(upgradeMarking(d), d); assert.deepEqual(markingItems(d), []); });
const n01 = docs.find(d => d.level === 'N01'), f0 = n01.filas.find(f => f.code === '9.9.0-1');
assert.equal(f0.name, 'Recinto 0');
assert.equal(n01.filas.find(f => f.code === '9.9.4-1').valores[col('Observaciones').id], undefined);
assert.equal(docs.find(d => d.level === 'N03').filas.find(f => f.code === '9.9.7-1').valores[col('Observaciones').id], 'Falta instalación de RMF');

// Listo para instalar: todas las columnas de estado en su estado final o «no aplica».
assert.equal(n01.vista, L.VISTA_LISTO);
const cs = n01.columnas, idOp = (n, op) => cs.find(c => c.nombre === n).opciones.find(o => o.nombre === op).id;
const todo = Object.fromEntries(cs.filter(c => c.tipo === 'estado').map(c => [c.id, idOp(c.nombre, c.nombre === 'Estatus de Ventana' ? 'No aplica' : 'Instalado')]));
assert.equal(L.listo(n01, {code: 'x', valores: todo}), 'listo');
assert.equal(L.listo(n01, {code: 'x', valores: {...todo, [cs[2].id]: idOp(cs[2].nombre, 'No instalado')}}), 'pendiente');
assert.equal(L.listo(n01, {code: 'x', valores: {}}), null, 'sin datos no se pinta');
// Enlace con el rombo: con registro, manda el avance; sin registro, el valor guardado.
const pav = cs.find(c => c.enlace === 'PAV'), fila = {code: 'x', valores: {...todo, [pav.id]: idOp(pav.nombre, 'No instalado')}};
const rombo = (code, enlace) => enlace === 'PAV' ? {installation: 'Instalado'} : null;
assert.deepEqual(L.valor(pav, fila, rombo), {id: idOp(pav.nombre, 'Instalado'), rombo: true});
assert.deepEqual(L.valor(pav, fila, () => null), {id: idOp(pav.nombre, 'No instalado'), rombo: false});
assert.equal(L.listo(n01, fila, rombo), 'listo');
// Leyenda de la vista y de una columna.
const ley = L.leyenda(n01, n01.filas);
assert.equal(ley.reduce((s, e) => s + e.n, 0), n01.filas.length);
assert.deepEqual(L.leyenda({...n01, vista: col('Tipo de Cielo').id}, n01.filas).map(e => e.nombre).slice(-1), ['Sin dato']);

// Edición: tocar un recinto nuevo lo agrega con su nombre; quitar la columna limpia sus valores.
const e1 = L.fijarValor(n01, {code: '7.7.7-1', name: 'Bodega'}, pav.id, idOp(pav.nombre, 'Instalado'));
assert.deepEqual(e1.filas.at(-1), {code: '7.7.7-1', name: 'Bodega', valores: {[pav.id]: idOp(pav.nombre, 'Instalado')}});
assert.throws(() => L.fijarValor(n01, {code: '7.7.7-1', name: 'Bodega'}, pav.id, 'zz'), /inválido/);
const e2 = L.fijarColumnas(e1, e1.columnas.filter(c => c.id !== pav.id));
assert(e2.filas.every(f => !(pav.id in f.valores)));
assert.throws(() => L.fijarColumnas(e1, [...e1.columnas, {...e1.columnas[0]}]), /repetida/);
assert.throws(() => validateMarking({...n01, columnas: [{id: 'c1', nombre: 'Estatus', tipo: 'estado', opciones: [{id: 'o1', nombre: 'Malo', color: '#ff0000'}]}], vista: 'listo', filas: []}), /estado final/);

// Exportación: mismos encabezados, nivel de la planilla y valor vigente (los enlazados desde el rombo de su piso).
const aoa = L.exportar(docs, {N01: rombo});
assert.deepEqual(aoa[0], ['Nivel', 'Código de Recinto', ...cab.slice(2), 'Listo para instalar']);
assert.equal(aoa.length, 41);
assert.deepEqual(aoa.slice(1).map(r => r[0]).filter((v, i, a) => a.indexOf(v) === i), ['S01', 'N01', 'N02', 'N03'], 'ordenado por piso');
const filaN01 = aoa.find(r => r[1] === '9.9.0-1');
assert.equal(filaN01[cab.indexOf('Estatus de Pavimento')], 'Instalado', 'pavimento enlazado sale del rombo');
assert.equal(L.pisoDe('S01'), 'N-1'); assert.equal(L.pisoDe('n02'), 'N02'); assert.equal(L.pisoDe('N09'), null);
console.log(JSON.stringify({checks: 'passed', scope: 'Levantamiento: propuesta de columnas desde la planilla (nivel, código, lista, estados con variantes unidas, no aplica, enlace al rombo), un documento por piso, avisos, listo para instalar, enlace con el rombo, leyenda, edición de valores y columnas, validación y exportación con los mismos encabezados.'}));
