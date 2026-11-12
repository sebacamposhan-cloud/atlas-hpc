import assert from 'node:assert/strict';
import fs from 'node:fs';
import {datosFiltro, nombreArchivo} from './dist/filtro-exportar.mjs';

// Datos del PDF: título con la capa y el piso, filtro aplicado, simbología sin categorías vacías y listado ordenado por código.
const info = datosFiltro({level: 'N02', nivelNombre: 'Nivel 2', capa: 'Pinturas', total: 355, autor: 'Usuario de prueba', at: '2026-11-11T22:00:00.000Z',
  filtros: [{capa: 'Sectores', valores: ['Sector 3']}, {capa: 'Pinturas', valores: []}],
  leyenda: [{nombre: '13 · Pintura epóxica', color: '#aabbcc', n: 38}, {nombre: '11 · Esmalte al agua', color: '#ccbbaa', n: 0}],
  recintos: [{code: '4.4.2.1.10-1', name: 'Box', categorias: [{nombre: '13 · Pintura epóxica', color: '#aabbcc'}]},
    {code: '4.4.2.1.2-1', name: 'Pasillo', categorias: [{nombre: '13 · Pintura epóxica', color: '#aabbcc'}, {nombre: '12 · Esmalte', color: '#123456'}]},
    {code: '4.4.2.1.3-1', name: '', categorias: []}]});
assert.equal(info.piso, 'N02');
assert.equal(info.titulo, 'Pinturas · Nivel 2');
assert.equal(info.tipo, 'Plano filtrado');
assert.equal(info.proposito, 'Plano filtrado: Sectores: Sector 3');
assert.equal(info.detalle, '3 de 355 recintos cumplen el filtro');
assert.equal(info.autor, 'Usuario de prueba');
assert.deepEqual(info.leyenda, [{nombre: '13 · Pintura epóxica', color: '#aabbcc', n: 38}]);
assert.deepEqual(info.columnas, ['Código', 'Recinto', 'Pinturas']);
assert.deepEqual(info.filas.map(f => f[0]), ['4.4.2.1.2-1', '4.4.2.1.3-1', '4.4.2.1.10-1'], 'orden numérico de códigos');
assert.deepEqual(info.filas[0][2], {texto: '13 · Pintura epóxica / 12 · Esmalte', color: '#aabbcc'});
assert.deepEqual(info.filas[1][2], {texto: 'Sin dato', color: '#ffffff'});
assert.equal(nombreArchivo(info), 'Plano filtrado - Pinturas - Sector 3');
const sinFiltro = datosFiltro({level: 'N-1', nivelNombre: 'Nivel −1', capa: 'Sectores', recintos: [{code: 'A', categorias: []}]});
assert.equal(sinFiltro.piso, 'S01');
assert.equal(sinFiltro.proposito, 'Plano coloreado por sectores, sin filtro');
assert.equal(sinFiltro.autor, 'Atlas HPC');
assert.equal(nombreArchivo(sinFiltro), 'Plano filtrado - Sectores');

// La leyenda del plano tiene el botón y la app arma el PDF recortado al ámbito del piso (el piso 1 ya no muestra la A-510).
const workspace = fs.readFileSync('dist/workspace.mjs', 'utf8'), app = fs.readFileSync('dist/app.js', 'utf8');
assert.ok(workspace.includes('<button id="exportFilter"') && workspace.includes("$('exportFilter').onclick=()=>ctx.exportarFiltro?.()") && workspace.includes('resumenFiltro,'));
assert.ok(app.includes('async function exportarFiltro(') && app.includes('createWorkspace({esc,exportarFiltro,') && app.includes('async function lienzoPlano(info)'));
assert.ok(app.includes('{canvas,ctx,u,recorte}=await lienzoPlano(info)'), 'la exportación de proyectos usa el mismo recorte');
assert.ok(!/Sector \$\{(esc\()?d\.sector/.test(app), 'Documentos originales nombra láminas, no sectores');
assert.ok(fs.readFileSync('scripts/prepare-offline.mjs', 'utf8').includes("'filtro-exportar.mjs'"));
console.log('filtro-exportar-test: ok');
