import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createAtlasServer} from './server/groq-server.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {leerLibro,calcular} from './dist/liberacion.mjs';

// Cada piso de pisos.js debe traer datos completos en el formato de Atlas.
const sandbox = {window: {}, location: {search: ''}, URLSearchParams, document: {currentScript: {src: 'http://x/pisos.js'}, querySelectorAll: () => []}};
vm.runInNewContext(fs.readFileSync('dist/pisos.js', 'utf8'), sandbox);
const pisos = sandbox.window.ATLAS_PISOS;
assert(pisos.length >= 2, 'pisos.js debe declarar al menos dos pisos');
assert.equal(sandbox.window.ATLAS_PISO.id, pisos[0].id, 'sin ?nivel= se abre el primer piso');
const index = fs.readFileSync('dist/index.html', 'utf8');
assert(index.includes('data-selector-piso') && index.includes('src="pisos.js"'), 'index.html debe cargar el selector de piso');
const resumen = {};
for (const piso of pisos) {
  const {data, atlas, map} = decodeRuntime(JSON.parse(fs.readFileSync('dist/' + piso.datos + 'runtime.json', 'utf8')));
  assert(data.rooms.length > 0 && data.documents.length > 0, piso.id + ': sin recintos o láminas');
  const docs = new Set(data.documents.map(d => d.id)), materiales = new Set(data.materials.map(m => m.code));
  for (const r of data.rooms) {
    assert(docs.has(r.document_id), piso.id + ': lámina desconocida en ' + r.id);
    assert.equal(r.finishes.length, 6, piso.id + ': rombo incompleto en ' + r.id);
    assert(r.finishes.every(f => materiales.has(f.code) || f.description), piso.id + ': terminación sin catálogo en ' + r.id);
  }
  for (const d of data.documents) assert(atlas.tiles.some(t => t.id === d.id), piso.id + ': lámina sin transformación ' + d.id);
  assert(fs.existsSync('dist/' + map.overview), piso.id + ': falta el plano de fondo');
  for (const o of map.overlays || []) assert(fs.existsSync('dist/' + o.href), piso.id + ': falta la capa ' + o.id);
  assert(map.levels.length && fs.existsSync('dist/' + map.export), piso.id + ': el plano debe tener mosaicos y exportación');
  for (const l of map.levels) for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.columns; x++) assert(fs.existsSync(`dist/${map.tilePath || 'map/'}${l.z}/${x}_${y}.webp`), `${piso.id}: falta la tesela ${l.z}/${x}_${y}`);
  if (piso.datos) {
    // Pisos importados desde DWG: geometría completa, dentro del plano y por lámina.
    const inside = p => p[0] >= 0 && p[1] >= 0 && p[0] <= map.width && p[1] <= map.height;
    for (const r of data.rooms) assert(r.polygon?.length >= 3 && r.polygon.every(inside) && inside(r.position), piso.id + ': contorno fuera del plano en ' + r.id);
    for (const d of data.documents) assert(fs.existsSync('dist/' + piso.datos + 'geometry/' + d.id + '.json'), piso.id + ': falta geometry/' + d.id);
    assert(new Set(data.rooms.map(r => r.code)).size === data.rooms.length, piso.id + ': códigos repetidos');
  }
  resumen[piso.id] = data.rooms.length;
}
const offline = JSON.parse(fs.readFileSync('dist/sw.js', 'utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
for (const core of ['/pisos.js', '/level.mjs', '/liberacion.mjs']) assert(offline.files.some(f => f.url === core && f.core), core + ' debe estar en el núcleo sin conexión');
for (const piso of pisos.filter(p => p.datos)) assert(offline.files.some(f => f.url === '/' + piso.datos + 'runtime.json'), piso.id + ': sus datos deben poder guardarse sin conexión');
assert(!offline.files.some(f => f.url !== '/index.html' && f.url.endsWith('.html')), 'el service worker solo guarda la portada como HTML');

// Semáforo de liberación con el Excel de ejemplo.
const XLSX = createRequire(import.meta.url)('./dist/vendor/xlsx.full.min.js');
const ejemplo = leerLibro(XLSX.read(fs.readFileSync('dist/liberacion/datos-ejemplo.xlsx'), {type: 'buffer', cellDates: true}), XLSX);
assert(ejemplo.solicitudes.length > 0 && Object.keys(ejemplo.recintos).length > 0, 'el ejemplo debe traer solicitudes y recintos');
const n02 = decodeRuntime(JSON.parse(fs.readFileSync('dist/n02/runtime.json', 'utf8'))).data.rooms;
const estados = {}; for (const [, c] of calcular(ejemplo, n02)) estados[c.estado] = (estados[c.estado] || 0) + 1;
assert(estados.bloqueado > 0 && estados.restriccion > 0 && estados.liberado > 0, 'el ejemplo debe producir los tres estados: ' + JSON.stringify(estados));
// El ejemplo solo lista recintos del nivel 2: el nivel −1 queda sin datos aunque comparta terminaciones.
const n1 = decodeRuntime(JSON.parse(fs.readFileSync('dist/runtime.json', 'utf8'))).data.rooms;
assert([...calcular(ejemplo, n1).values()].every(c => c.estado === 'sin-dato'), 'recintos fuera del Excel deben quedar «Sin datos»');

const server = await createAtlasServer({env: {ATLAS_ACCESS_PASSWORD: 'isolated-test-password'}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const headers = {Authorization: 'Basic ' + Buffer.from('atlas:isolated-test-password').toString('base64')};
try {
  assert.equal((await fetch(base + '/?nivel=N02')).status, 401, 'debe pedir contraseña');
  const portada = await fetch(base + '/?nivel=N02', {headers});
  assert.equal(portada.status, 200);
  assert((await portada.text()).includes('data-selector-piso'), 'todos los pisos usan la misma portada');
  const antigua = await (await fetch(base + '/n02/', {headers})).text();
  assert(antigua.includes("location.replace('../?nivel=N02' + location.hash)"), 'la dirección antigua del nivel 2 redirige conservando el recinto');
  const sinBarra = await fetch(base + '/n02?x=1', {headers, redirect: 'manual'});
  assert.equal(sinBarra.status, 301);
  assert.equal(sinBarra.headers.get('location'), '/n02/?x=1');
  for (const file of ['/pisos.js', '/level.mjs', '/liberacion.mjs', '/n02/runtime.json', '/n02/map/overview.webp', '/n02/map/2/8_10.webp', '/liberacion/datos-ejemplo.xlsx']) assert.equal((await fetch(base + file, {headers})).status, 200, file);
  console.log(JSON.stringify({checks: 'passed', recintosPorPiso: resumen, semaforoEjemploN02: estados, scope: 'Datos de cada piso, plano y capas, geometrías, misma portada, redirección /n02/, contraseña, paquete sin conexión y semáforo de liberación.'}));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
