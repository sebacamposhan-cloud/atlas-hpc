/* Download and cache work runs outside the page's main thread. */
'use strict';
const manifest = self.ATLAS_OFFLINE;
const CACHE_PREFIX = 'atlas-hpc-offline-';
const CACHE_NAME = CACHE_PREFIX + manifest.version;
const ORIGIN = self.location.origin;
const entries = new Map(manifest.files.map(file => [file.url, file]));
const metaURL = ORIGIN + '/__atlas_offline_manifest__';
let job = null;
const absolute = path => new URL(path, ORIGIN).href;
const packFiles = pack => manifest.files.filter(f => pack === 'documents' ? f.pack === 'documents' : f.pack !== 'documents');

async function cacheStatus() {
  const cache = await caches.open(CACHE_NAME);
  const stored = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
  const summarize = pack => {
    const files = packFiles(pack), saved = files.filter(file => stored.has(file.url));
    return {ready: saved.length === files.length, count: saved.length, total: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0), savedBytes: saved.reduce((sum, file) => sum + file.bytes, 0)};
  };
  return {version: manifest.version, plan: summarize('plan'), documents: summarize('documents'), downloading: job?.pack || null};
}
async function broadcast(message) {
  for (const client of await self.clients.matchAll({includeUncontrolled: true, type: 'window'})) client.postMessage({atlasOffline: true, ...message});
}
async function getPreviousCaches() {
  const previous = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
    const cache = await caches.open(name), response = await cache.match(metaURL);
    if (!response) continue;
    try { const metadata = await response.json();previous.push({cache, metadata, files: new Map(metadata.files.map(f => [f.url, f.hash]))}); } catch {}
  }
  return previous;
}
async function fetchFile(file, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, {once: true});
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(absolute(file.url), {signal: controller.signal, cache: 'no-cache', credentials: 'same-origin'});
    if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error('No se pudo descargar '+file.url);
    const type = response.headers.get('content-type') || '';
    if (file.url !== '/index.html' && type.includes('text/html')) throw new Error('El servidor no entregó '+file.url);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error('Archivo vacío: '+file.url);
    const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
    return new Response(bytes, {status: 200, headers});
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}
async function saveFile(cache, file, previous, signal) {
  if (await cache.match(absolute(file.url))) return;
  for (const old of previous) {
    if (old.files.get(file.url) !== file.hash) continue;
    const response = await old.cache.match(absolute(file.url));
    if (response) { await cache.put(absolute(file.url), response); return; }
  }
  let error;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Descarga pausada.');
    try { await cache.put(absolute(file.url), await fetchFile(file, signal)); return; }
    catch (e) { error = e; if (e.name === 'QuotaExceededError' || signal?.aborted) break; }
  }
  throw error;
}
async function saveFiles(files, signal, onProgress) {
  const cache = await caches.open(CACHE_NAME), previous = await getPreviousCaches();
  let next = 0, completed = 0, failure;
  await Promise.all(Array.from({length: Math.min(3, files.length)}, async () => {
    while (next < files.length && !failure && !signal?.aborted) {
      const file = files[next++];
      try { await saveFile(cache, file, previous, signal); completed++; onProgress?.(completed, files.length); }
      catch (error) { failure = error; }
    }
  }));
  if (signal?.aborted) throw new Error('Descarga pausada. Puedes continuar desde donde quedó.');
  if (failure) throw failure;
  await cache.put(metaURL, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
}
async function installVersion() {
  // A first visit only installs the small shell. An update carries forward
  // complete packs so activating it cannot discard the user's offline plan.
  const packs = new Set();
  for (const previous of await getPreviousCaches()) {
    const stored = new Set((await previous.cache.keys()).map(request => new URL(request.url).pathname));
    for (const pack of ['plan', 'documents']) {
      const files = previous.metadata.files.filter(file => file.pack === pack);
      if (files.length && files.every(file => stored.has(file.url))) packs.add(pack);
    }
  }
  try{await saveFiles(manifest.files.filter(file => file.core || packs.has(file.pack)),undefined,(done,total)=>{if(done===total||done%20===0)void broadcast({type:'UPDATE_PROGRESS',done,total,version:manifest.version});});}
  catch(error){await broadcast({type:'UPDATE_ERROR',error:'La actualización no se completó. La copia anterior se conserva.',version:manifest.version});throw error;}
}
self.addEventListener('install', event => event.waitUntil(installVersion()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ORIGIN) return;
  const route = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = entries.get(route);
  if (!file) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME), stored = await cache.match(absolute(route));
    if (stored) return stored;
    try {
      const response = await fetchFile(file);
      event.waitUntil(cache.put(absolute(route), response.clone()).catch(() => {}));
      return response;
    } catch {
      return new Response(route.endsWith('.pdf') ? 'Este PDF no está guardado. Con conexión, abre Atlas y selecciona «Guardar PDF originales».' : 'Este recurso todavía no está guardado para usarlo sin conexión.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
self.addEventListener('message', event => {
  const message = event.data || {};
  if (!message.atlasOffline) return;
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (message.type === 'STATUS') { event.waitUntil(cacheStatus().then(reply).catch(error => reply({error: error.message}))); return; }
  if (message.type === 'ACTIVATE') { event.waitUntil(self.skipWaiting()); return; }
  if (message.type === 'PAUSE') { job?.controller.abort(); reply({ok: true}); return; }
  if (message.type !== 'DOWNLOAD') return;
  if (job) { reply({ok: true, running: true}); return; }
  const pack = message.pack === 'documents' ? 'documents' : 'plan';
  const controller = new AbortController();job = {pack, controller};reply({ok: true});
  event.waitUntil((async () => {
    let last = 0;
    try {
      await saveFiles(packFiles(pack), controller.signal, (done, total) => {
        const now = Date.now();
        if (now - last > 200 || done === total) { last = now; void broadcast({type: 'PROGRESS', pack, done, total}); }
      });
      job = null;
      await broadcast({type: 'DONE', status: await cacheStatus()});
    } catch (error) {
      job = null;
      const reason = error.name === 'QuotaExceededError' ? 'No hay espacio suficiente en el navegador. Libera espacio y reanuda la descarga.' : controller.signal.aborted ? 'Descarga pausada. Lo guardado se conserva; puedes continuar.' : 'No se completó la descarga. Comprueba la conexión y pulsa Continuar.';
      await broadcast({type: 'ERROR', error: reason, status: await cacheStatus()});
    }
  })());
});
