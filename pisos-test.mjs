import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAtlasServer} from './server/groq-server.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';

// Cada piso de pisos.js debe traer datos completos en el formato de Atlas.
const sandbox = {window: {}, location: {search: ''}, URLSearchParams, document: {currentScript: {src: 'http://x/pisos.js'}, querySelectorAll: () => []}};
vm.runInNewContext(fs.readFileSync('dist/pisos.js', 'utf8'), sandbox);
const pisos = sandbox.window.ATLAS_PISOS;
assert(pisos.length >= 2, 'pisos.js debe declarar al menos dos pisos');
assert.equal(sandbox.window.ATLAS_PISO.id, pisos[0].id, 'el nivel por defecto se conserva para enlaces anteriores');
assert.deepEqual(Array.from(sandbox.window.ATLAS_TARJETAS,t=>t.id),['N-1','N01','N02','N03']);
assert.equal(sandbox.window.ATLAS_TARJETAS.filter(t=>t.piso).length,pisos.length,'las tarjetas disponibles coinciden con los datos cargados');
const index = fs.readFileSync('dist/index.html', 'utf8');
assert(index.includes('id="floorExplorer"') && index.includes('src="pisos.js"'), 'index.html debe cargar el explorador visual');
const resumen = {};
for (const piso of pisos) {
  const {data, atlas, map, selection} = decodeRuntime(JSON.parse(fs.readFileSync('dist/' + piso.datos + 'runtime.json', 'utf8')));
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
  // Capas del dibujo que se pueden apagar (pisos dibujados desde DWG): vista general y cada tesela declarada.
  if (piso.datos) assert.deepEqual((map.capas || []).map(c => c.id).sort(), ['ejes', 'mobiliario', 'relleno'], piso.id + ': faltan capas del dibujo');
  for (const c of map.capas || []) {
    assert(fs.existsSync('dist/' + c.overview), piso.id + ': falta la vista general de ' + c.id);
    for (const [z, teselas] of Object.entries(c.teselas)) for (const t of teselas) assert(fs.existsSync(`dist/${c.tilePath}${z}/${t}.webp`), `${piso.id}: falta la tesela ${c.id} ${z}/${t}`);
  }
  assert(map.levels.length && fs.existsSync('dist/' + map.export), piso.id + ': el plano debe tener mosaicos y exportación');
  for (const l of map.levels) for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.columns; x++) assert(fs.existsSync(`dist/${map.tilePath || 'map/'}${l.z}/${x}_${y}.webp`), `${piso.id}: falta la tesela ${l.z}/${x}_${y}`);
  if (piso.datos) {
    // Pisos importados desde DWG: geometría completa, dentro del plano y por lámina.
    const inside = p => p[0] >= 0 && p[1] >= 0 && p[0] <= map.width && p[1] <= map.height;
    // Cada recinto tiene contorno o superficie auxiliar de selección (recintos abiertos sin límites en el DWG), dentro del plano.
    const auxiliar = new Map(selection.rooms.map(s => [s.id, s.rings[0].polygon]));
    for (const r of data.rooms) { const anillo = r.polygon || auxiliar.get(r.id); assert(anillo?.length >= 3 && anillo.every(inside) && inside(r.position), piso.id + ': contorno fuera del plano en ' + r.id); }
    // El rombo de cada recinto se dibuja dentro de su contorno (sus cuatro vértices).
    const dentroDe = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    for (const r of data.rooms.filter(r => r.diamond_bbox)) { const [x0, y0, x1, y1] = r.diamond_bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, anillo = r.polygon || auxiliar.get(r.id); assert([[cx, y0], [x1, cy], [cx, y1], [x0, cy]].every(p => dentroDe(p, anillo)), piso.id + ': rombo fuera del contorno en ' + r.id); assert(fs.existsSync('dist/' + decodeURIComponent(r.diamond_url)), piso.id + ': falta la imagen del rombo de ' + r.id); }
    // Sin arcos inventados: ningún contorno con tramos curvos largos (muchos segmentos cortos con giro suave seguidos).
    // Los contornos rellenados desde el rótulo (scripts/dwg-plano) siguen el dibujo del DWG: sus curvas son pilares o muros reales.
    for (const r of data.rooms.filter(r => r.polygon && !/relleno desde el rótulo|Contorno parcial del DWG/.test(r.geometry_method))) { const p = r.polygon, n = p.length; let seguidos = 0, max = 0; for (let i = 0; i < n; i++) { const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], g = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); seguidos = Math.hypot(...u) < 50 && Math.hypot(...v) < 50 && g > .03 && g < .7 ? seguidos + 1 : 0; max = Math.max(max, seguidos); } assert(max < 5, piso.id + ': contorno con arco en ' + r.id); }
    for (const d of data.documents) assert(fs.existsSync('dist/' + piso.datos + 'geometry/' + d.id + '.json'), piso.id + ': falta geometry/' + d.id);
    assert(new Set(data.rooms.map(r => r.code)).size === data.rooms.length, piso.id + ': códigos repetidos');
  }
  resumen[piso.id] = data.rooms.length;
}
const offline = JSON.parse(fs.readFileSync('dist/sw.js', 'utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
for (const core of ['/pisos.js', '/level.mjs']) assert(offline.files.some(f => f.url === core && f.core), core + ' debe estar en el núcleo sin conexión');
// El semáforo de liberación se archivó en archivo/semaforo-liberacion/ (28-10-2026): no se publica ni se guarda sin conexión.
assert(!offline.files.some(f => f.url === '/liberacion.mjs' || f.url.startsWith('/liberacion/')), 'el semáforo de liberación no debe estar en el paquete sin conexión');
for (const piso of pisos.filter(p => p.datos)) assert(offline.files.some(f => f.url === '/' + piso.datos + 'runtime.json'), piso.id + ': sus datos deben poder guardarse sin conexión');
assert(!offline.files.some(f => f.url !== '/index.html' && f.url.endsWith('.html')), 'el service worker solo guarda la portada como HTML');

const server = await createAtlasServer({env: {ATLAS_ACCESS_PASSWORD: 'isolated-test-password'}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const headers = {Authorization: 'Basic ' + Buffer.from('atlas:isolated-test-password').toString('base64')};
try {
  assert.equal((await fetch(base + '/?nivel=N02')).status, 401, 'debe pedir contraseña');
  const portada = await fetch(base + '/?nivel=N02', {headers});
  assert.equal(portada.status, 200);
  assert((await portada.text()).includes('id="floorExplorer"'), 'todos los pisos usan la misma portada');
  const antigua = await (await fetch(base + '/n02/', {headers})).text();
  assert(antigua.includes("location.replace('../?nivel=N02' + location.hash)"), 'la dirección antigua del nivel 2 redirige conservando el recinto');
  const sinBarra = await fetch(base + '/n02?x=1', {headers, redirect: 'manual'});
  assert.equal(sinBarra.status, 301);
  assert.equal(sinBarra.headers.get('location'), '/n02/?x=1');
  for (const file of ['/pisos.js', '/level.mjs', '/n02/runtime.json', '/n02/map/overview.webp', '/n02/map/2/8_10.webp']) assert.equal((await fetch(base + file, {headers})).status, 200, file);
  for (const file of ['/liberacion.mjs', '/liberacion/datos-ejemplo.xlsx']) assert.equal((await fetch(base + file, {headers})).status, 404, file + ' archivado, no se publica');
  console.log(JSON.stringify({checks: 'passed', recintosPorPiso: resumen, scope: 'Datos de cada piso, plano y capas, geometrías, misma portada, redirección /n02/, contraseña, paquete sin conexión y semáforo de liberación archivado (no se publica).'}));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
