import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAtlasServer} from './server/groq-server.mjs';

// Cada piso declarado en pisos.js debe tener su vista publicada y su marca de selector.
const sandbox = {window: {}, location: {}, document: {currentScript: {src: 'http://x/pisos.js'}, querySelectorAll: () => []}};
vm.runInNewContext(fs.readFileSync('dist/pisos.js', 'utf8'), sandbox);
const pisos = sandbox.window.ATLAS_PISOS;
assert(pisos.length >= 2, 'pisos.js debe declarar al menos dos pisos');
for (const piso of pisos) {
  const html = fs.readFileSync('dist/' + piso.ruta + 'index.html', 'utf8');
  assert(html.includes('data-selector-piso="' + piso.id + '"'), piso.id + ': falta la marca del selector');
  assert(html.includes(piso.ruta ? '../pisos.js' : 'src="pisos.js"'), piso.id + ': no carga pisos.js');
}
const offline = JSON.parse(fs.readFileSync('dist/sw.js', 'utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
assert(offline.files.some(f => f.url === '/pisos.js' && f.core), 'pisos.js debe estar en el núcleo sin conexión');

const server = await createAtlasServer({env: {ATLAS_ACCESS_PASSWORD: 'isolated-test-password'}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const headers = {Authorization: 'Basic ' + Buffer.from('atlas:isolated-test-password').toString('base64')};
try {
  for (const piso of pisos.filter(p => p.ruta)) {
    assert.equal((await fetch(base + '/' + piso.ruta)).status, 401, piso.id + ': debe pedir contraseña');
    const res = await fetch(base + '/' + piso.ruta, {headers});
    assert.equal(res.status, 200, piso.id);
    assert(res.headers.get('content-type').startsWith('text/html'), piso.id);
    const sinBarra = await fetch(base + '/' + piso.ruta.replace(/\/$/, '') + '?r=1', {headers, redirect: 'manual'});
    assert.equal(sinBarra.status, 301, piso.id + ': debe redirigir a la ruta con barra');
    assert.equal(sinBarra.headers.get('location'), '/' + piso.ruta + '?r=1');
  }
  assert.equal((await fetch(base + '/pisos.js', {headers})).status, 200);
  console.log(JSON.stringify({checks: 'passed', pisos: pisos.map(p => p.id), scope: 'Vistas publicadas, selector en cada vista, contraseña, redirección de carpeta y pisos.js en el núcleo sin conexión.'}));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
