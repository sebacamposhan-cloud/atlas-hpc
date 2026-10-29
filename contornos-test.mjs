// Contornos corregidos con el editor interno (scripts/editor-contornos): geometría, archivo de cada piso y prioridad en la app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {resolveFootprints} from './dist/geometry-authority.mjs';
import {METROS, areaAnillo, areaM2, areaDeclarada, seCruza, errorAnillo, simplificar, crearIndice, agregarTramo, enganchar, orto, partir} from './scripts/editor-contornos/geometria.mjs';
import {NIVELES, FORMATO, validar, serializar, vacio, posicionPlano} from './scripts/editor-contornos/archivo.mjs';

// Unidades: 1 unidad = 1,7639 cm; un cuadrado de 100 unidades mide 3,11 m².
assert.ok(Math.abs(METROS - .017639) < 1e-6);
const cuadrado = [[0, 0], [100, 0], [100, 100], [0, 100]];
assert.equal(areaAnillo(cuadrado), 10000);
assert.ok(Math.abs(areaM2([{polygon: cuadrado, holes: [[[10, 10], [20, 10], [20, 20], [10, 20]]]}]) - 9900 * METROS ** 2) < 1e-9);
assert.equal(areaDeclarada('19,41'), 19.41); assert.equal(areaDeclarada('11,21 m²'), 11.21); assert.equal(areaDeclarada('1.234,5'), 1234.5); assert.equal(areaDeclarada(''), null);
assert.equal(seCruza([[0, 0], [10, 10], [10, 0], [0, 10]]), true); assert.equal(seCruza(cuadrado), false);
assert.match(errorAnillo([[0, 0], [1, 0]]), /3 vértices/);

// Enganche: extremo antes que cercano, punto medio, intersección, perpendicular desde el ancla y orto contra un muro.
const ix = crearIndice(16);
agregarTramo(ix, [0, 0], [100, 0]); agregarTramo(ix, [50, -50], [50, 50]); agregarTramo(ix, [0, 80], [100, 80]);
assert.deepEqual(enganchar([98, 2], {indices: [ix], radio: 5}), {p: [100, 0], tipo: 'extremo'});
assert.deepEqual(enganchar([25, 2], {indices: [ix], radio: 5}), {p: [25, 0], tipo: 'cercano'});
assert.equal(enganchar([49, 1], {indices: [ix], radio: 5}).tipo, 'interseccion');
assert.equal(enganchar([0, 78], {indices: [ix], radio: 5, modos: {medio: true}}).tipo, null);
assert.deepEqual(enganchar([50, 81], {indices: [ix], radio: 5, modos: {medio: true}}), {p: [50, 80], tipo: 'medio'});
assert.deepEqual(enganchar([31, 78], {indices: [ix], radio: 5, ancla: [30, 40], modos: {perpendicular: true}}), {p: [30, 80], tipo: 'perpendicular'});
assert.deepEqual(orto([33, 70], [30, 0]), [30, 70]);
assert.deepEqual(enganchar([33, 78], {indices: [ix], radio: 5, ancla: [30, 0], usarOrto: true}), {p: [30, 80], tipo: 'orto-cruce'});

// Partir un cuadrado con una línea vertical: dos mitades que suman el área original.
const [uno, dos] = partir(cuadrado, [[40, -10], [40, 110]]);
assert.equal(areaAnillo(uno) + areaAnillo(dos), 10000); assert.deepEqual([areaAnillo(uno), areaAnillo(dos)].sort((a, b) => a - b), [4000, 6000]);
const [a, b] = partir(cuadrado, [[-10, 30], [60, 30], [60, 110]]); // corte en L
assert.equal(areaAnillo(a) + areaAnillo(b), 10000); assert.ok(!seCruza(a) && !seCruza(b));
assert.throws(() => partir(cuadrado, [[40, -10], [40, 50]]), /dos veces/);
// Simplificar quita los escalones de menos de 1,5 cm y deja las esquinas reales.
const escalones = [[0, 0], [50, 0], [50, .3], [100, .3], [100, 100], [0, 100]];
assert.equal(simplificar(escalones, .85).length, 4);

// Archivo de cada piso: formato, recintos existentes, contornos válidos, dentro del plano y con su rótulo dentro.
const resumen = {};
const manifiesto = JSON.parse(fs.readFileSync('dist/sw.js', 'utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
for (const [nivel, n] of Object.entries(NIVELES)) {
  const ruta = 'dist/' + n.datos + 'contornos.json', archivo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const {data, atlas, map, selection} = decodeRuntime(JSON.parse(fs.readFileSync('dist/' + n.datos + 'runtime.json', 'utf8')));
  assert.deepEqual(validar(archivo, {nivel, rooms: data.rooms, atlas, map}), [], ruta);
  assert.equal(fs.readFileSync(ruta, 'utf8'), serializar(archivo), ruta + ' debe guardarse con serializar() (un recinto por línea)');
  assert.ok(manifiesto.files.some(f => f.url === '/' + n.datos + 'contornos.json'), ruta + ' debe estar en el paquete sin conexión');
  // Cada corrección manda en el plano.
  const fp = resolveFootprints(atlas, data.rooms, new Map(), selection, archivo.recintos);
  for (const c of archivo.recintos) assert.equal(fp.get(c.id).method, 'corrected', c.code);
  resumen[nivel] = archivo.recintos.length;
}

// Validación: rechaza recintos inexistentes, códigos cambiados, contornos cruzados o fuera del plano y rótulos fuera sin marcar.
{
  const {data, atlas, map} = decodeRuntime(JSON.parse(fs.readFileSync('dist/n01/runtime.json', 'utf8')));
  const r = data.rooms.find(x => x.polygon), p = posicionPlano(r, atlas), caja = d => [{polygon: [[p[0] - d, p[1] - d], [p[0] + d, p[1] - d], [p[0] + d, p[1] + d], [p[0] - d, p[1] + d]], holes: []}];
  const con = recintos => ({...vacio('N01'), recintos});
  assert.deepEqual(validar(con([{id: r.id, code: r.code, parts: caja(20), area_m2: Math.round(areaM2(caja(20)) * 100) / 100}]), {nivel: 'N01', rooms: data.rooms, atlas, map}), []);
  const errores = validar(con([{id: 'no-existe', code: 'X', parts: caja(20)}, {id: r.id, code: 'otro', parts: [{polygon: [[p[0], p[1]], [p[0] + 20, p[1] + 20], [p[0] + 20, p[1]], [p[0], p[1] + 8]], holes: []}]}]), {nivel: 'N01', rooms: data.rooms, atlas, map});
  assert.ok(errores.some(e => /no existe/.test(e)) && errores.some(e => /código no coincide/.test(e)) && errores.some(e => /cruza/.test(e)), errores.join(' | '));
  const lejos = [{polygon: [[p[0] + 100, p[1] + 100], [p[0] + 140, p[1] + 100], [p[0] + 140, p[1] + 140]], holes: []}];
  assert.ok(validar(con([{id: r.id, code: r.code, parts: lejos}]), {nivel: 'N01', rooms: data.rooms, atlas, map}).some(e => /rótulo/.test(e)));
  assert.deepEqual(validar(con([{id: r.id, code: r.code, parts: lejos, rotuloFuera: true}]), {nivel: 'N01', rooms: data.rooms, atlas, map}), []);
  assert.ok(validar(con([{id: r.id, code: r.code, parts: [{polygon: [[-10, -10], [5, -10], [5, 5]], holes: []}], rotuloFuera: true}]), {nivel: 'N01', rooms: data.rooms, atlas, map}).some(e => /sale del plano/.test(e)));
  assert.deepEqual(validar({format: 'otro'}, {nivel: 'N01', rooms: [], atlas, map}), ['Formato desconocido: se espera ' + FORMATO + '.']);
}

// Prioridad en la app: la corrección manda sobre la superficie auxiliar y el contorno validado, pero no sobre una edición
// manual guardada en el navegador de ese equipo; un código distinto (recinto renombrado) no se aplica.
{
  const atlas = {tiles: [{id: 'doc', offset: [0, 0]}]}, rect = [[0, 0], [10, 0], [10, 10], [0, 10]], otro = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const correccion = [{id: 'room', code: 'A', parts: [{polygon: otro, holes: []}]}];
  const room = {id: 'room', code: 'A', document_id: 'doc', polygon: rect, holes: [], version: 1, geometry_status: 'Validado'};
  assert.equal(resolveFootprints(atlas, [room], new Map(), {rooms: []}, correccion).get('room').quality, 'dwg_corrected');
  assert.equal(resolveFootprints(atlas, [{...room, polygon: null}], new Map(), {rooms: [{id: 'room', score: 1, rings: [{polygon: rect, holes: []}]}]}, correccion).get('room').method, 'corrected');
  assert.equal(resolveFootprints(atlas, [{...room, version: 2, geometry_method: 'Edición manual en navegador'}], new Map(), {rooms: []}, correccion).get('room').method, 'manual');
  assert.equal(resolveFootprints(atlas, [room], new Map(), {rooms: []}, [{...correccion[0], code: 'B'}]).get('room').method, 'technical');
  assert.equal(resolveFootprints(atlas, [room], new Map(), {rooms: []}).get('room').method, 'technical', 'sin correcciones todo sigue igual');
}
console.log(JSON.stringify({checks: 'passed', contornosCorregidos: resumen, scope: 'Editor de contornos: unidades, enganche (extremo, medio, intersección, perpendicular, cercano, orto), partir, simplificar; archivo de cada piso válido y sin conexión; prioridad sobre auxiliares y validados, no sobre ediciones del navegador.'}));
