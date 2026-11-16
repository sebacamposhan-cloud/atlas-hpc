import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {searchRooms} from './dist/engine.mjs';
import {buildHitIndex} from './dist/hit-index.mjs';

// Integration tests run the actual service-worker handlers against an isolated
// Cache/Fetch adapter. No real browser data or production state is modified.
const code=fs.readFileSync('dist/sw-runtime.js','utf8');
const entry=fs.readFileSync('dist/sw.js','utf8');
const manifest=JSON.parse(entry.match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
const origin='https://atlas.test',cacheStores=new Map(),requests=[],messages=[];
let offline=false,failedURL=null,quotaURL=null,pauseFetch=null,activeFetches=0,maxFetches=0;
const key=request=>typeof request==='string'?request:request.url;
class Cache {
 constructor(){this.items=new Map();}
 async keys(){return [...this.items.keys()].map(url=>new Request(url));}
 async match(request){const r=this.items.get(key(request));return r?new Response(r.bytes.slice(),{status:r.status,headers:r.headers}):undefined;}
 async put(request,response){const url=key(request);if(url.endsWith(quotaURL||'__never__'))throw new DOMException('Quota','QuotaExceededError');this.items.set(url,{bytes:new Uint8Array(await response.arrayBuffer()),status:response.status,headers:[...response.headers]});}
 async delete(request){return this.items.delete(key(request));}
}
const caches={async keys(){return [...cacheStores.keys()];},async open(name){if(!cacheStores.has(name))cacheStores.set(name,new Cache());return cacheStores.get(name);},async delete(name){return cacheStores.delete(name);}};
const mime=url=>url.endsWith('.html')?'text/html':url.endsWith('.json')||url.endsWith('.webmanifest')?'application/json':/\.m?js$/.test(url)?'text/javascript':url.endsWith('.pdf')?'application/pdf':'image/png';
async function network(url,options={}){
 const pathname=new URL(url).pathname;requests.push(pathname);activeFetches++;maxFetches=Math.max(maxFetches,activeFetches);
 try{
  if(offline||pathname===failedURL)throw new TypeError('Network unavailable');
  if(pauseFetch){const fn=pauseFetch;pauseFetch=null;queueMicrotask(fn);await new Promise(resolve=>setTimeout(resolve,5));}
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
  return new Response(fs.readFileSync('dist'+pathname),{headers:{'content-type':mime(pathname)}});
 }finally{activeFetches--;}
}
function worker(config=manifest){
 const handlers={};
 const self={ATLAS_OFFLINE:config,location:{origin},clients:{async claim(){},async matchAll(){return[{postMessage:m=>messages.push(m)}];}},async skipWaiting(){},addEventListener:(type,fn)=>handlers[type]=fn};
 vm.runInNewContext(code,{self,caches,fetch:network,Response,Headers,URL,AbortController,setTimeout,clearTimeout,console});
 function dispatch(type,params={}){const waits=[];let response,reply;handlers[type]({...params,waitUntil:p=>waits.push(p),respondWith:p=>response=p,ports:[{postMessage:m=>reply=m}]});return{get reply(){return reply;},async done(){await Promise.all(waits);return reply;},async response(){const r=await response;await Promise.all(waits);return r;}};}
 return{dispatch,async status(){return dispatch('message',{data:{atlasOffline:true,type:'STATUS'}}).done();},async download(pack='plan'){return dispatch('message',{data:{atlasOffline:true,type:'DOWNLOAD',pack}}).done();},get(url){return dispatch('fetch',{request:new Request(origin+url)}).response();}};
}
for(const f of manifest.files){const bytes=fs.readFileSync('dist'+f.url);assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.hash,'regenerate manifest: '+f.url);}
assert.equal(new Set(manifest.files.map(f=>f.url)).size,manifest.files.length);
// Cada módulo que importa la app (estático o import()) debe estar guardado: si falta uno, sin señal el visor no abre.
for(const name of fs.readdirSync('dist').filter(n=>/\.(mjs|js|html)$/.test(n)&&!['sw.js','sw-runtime.js','actualizar.html'].includes(n))){
 if(!manifest.files.some(f=>f.url==='/'+name))continue;
 for(const [,ruta] of fs.readFileSync('dist/'+name,'utf8').matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"]\.\/([^'"]+)['"]/g))assert(manifest.files.some(f=>f.url==='/'+ruta),name+' importa '+ruta+', que no está en el modo sin conexión');
}
// Paquetes: «plan» (base, incluye el núcleo), uno por piso («n-1», «n01»…) y «documents».
const floorPacks=[...new Set(manifest.files.map(f=>f.pack))].filter(p=>!['plan','documents'].includes(p));
assert(floorPacks.includes('n-1')&&floorPacks.includes('n01')&&floorPacks.length>=5,'un paquete por piso');
for(const f of manifest.files.filter(f=>/^\/n\d\d\/(runtime|contornos|ejes)\.json$/.test(f.url)))assert(f.core&&f.pack==='plan','las fichas de cada piso van en el núcleo: '+f.url);
const building=s=>Object.entries(s.packs).filter(([k])=>k!=='documents').map(([,v])=>v);
const buildingReady=s=>building(s).every(v=>v.ready),buildingMissing=s=>building(s).reduce((n,v)=>n+v.total-v.count,0);
const w=worker();await w.dispatch('install').done();await w.dispatch('activate').done();
let status=await w.status();assert(!status.plan.ready);assert.equal(status.plan.count,manifest.files.filter(f=>f.core).length);
const tile=manifest.files.find(f=>f.url.startsWith('/map/2/')).url;
assert.equal(manifest.files.find(f=>f.url===tile).pack,'n-1');
failedURL=tile;await w.download();status=await w.status();assert(!status.packs['n-1'].ready);assert(!buildingReady(status));assert(messages.at(-1).type==='ERROR');assert.equal(requests.filter(url=>url===tile).length,2);
const missingBefore=buildingMissing(status),requestsBefore=requests.length;failedURL=null;await w.download();status=await w.status();assert(buildingReady(status));assert.equal(requests.length-requestsBefore,missingBefore,'resume only fetches missing files');assert(!status.documents.ready);assert(maxFetches<=3);

// A new worker instance simulates reopening the app with all network access gone.
offline=true;const reopened=worker(),beforeOffline=requests.length;
const navigation=await reopened.get('/');assert.equal(navigation.status,200);assert((await navigation.text()).includes('id="svg"'));
const cachedRuntime=decodeRuntime(await(await reopened.get('/runtime.json')).json());
const rooms=searchRooms(cachedRuntime.data.rooms,new URLSearchParams({q:'3.1.1.5.1-1'}));assert(rooms.some(r=>r.name==='Sala Seriógrafo'));
const hit=buildHitIndex(cachedRuntime.selection.rooms);assert(cachedRuntime.data.rooms.find(r=>r.id===hit({x:4600,y:6350})).code==='3.1.1.5.1-1');
for(const url of [tile,rooms[0].diamond_url,'/app.js','/viewer.mjs','/vendor/pdf-lib.min.js','/map/export.jpg'])assert.equal((await reopened.get(url)).status,200,url);
assert.equal(requests.length,beforeOffline,'cached navigation and consultation make zero network requests');
assert.equal((await reopened.get('/source/'+cachedRuntime.data.documents[0].filename)).status,503,'optional PDF correctly reports unavailable');

// Partial eviction must remove the ready status. Changed versions reuse unchanged assets.
const current=await caches.open('atlas-hpc-offline-'+manifest.version);await current.delete(origin+tile);assert(!(await reopened.status()).packs['n-1'].ready);assert((await reopened.status()).packs.n01.ready,'solo el piso afectado deja de estar listo');
offline=false;const newer={...manifest,version:manifest.version+'-update'},updated=worker(newer),beforeUpdate=requests.length;
await updated.dispatch('install').done();await updated.download();assert((await updated.status()).plan.ready);assert.equal(requests.length-beforeUpdate,1,'unchanged files reused across revisions');
await updated.download('documents');assert((await updated.status()).documents.ready);
offline=true;assert.equal((await updated.get('/source/'+cachedRuntime.data.documents[0].filename)).status,200);offline=false;

// Updating a fully downloaded installation must preserve both offline packs
// before activation, even when none of the unchanged files can be fetched.
offline=true;const preserved=worker({...manifest,version:manifest.version+'-preserved'}),beforePreserve=requests.length;
await preserved.dispatch('install').done();assert(buildingReady(await preserved.status()));assert((await preserved.status()).documents.ready);
await preserved.dispatch('activate').done();assert.equal((await preserved.get(tile)).status,200);assert.equal(requests.length,beforePreserve);
assert.deepEqual(await caches.keys(),['atlas-hpc-offline-'+manifest.version+'-preserved'],'al activar se borran las copias de versiones anteriores');
quotaURL=tile;const failedUpdate=worker({...manifest,version:manifest.version+'-failed-update'});await assert.rejects(failedUpdate.dispatch('install').done());assert((await preserved.status()).plan.ready,'failed update must keep the existing offline copy intact');quotaURL=null;offline=false;

// Pause and storage failures leave resumable partial downloads, never a false ready flag.
cacheStores.clear();
const smallFiles=manifest.files.filter(f=>f.url.startsWith('/map/0/')).slice(0,8).map((f,i)=>({...f,pack:'plan',hash:f.hash+'-pause',core:i===0}));
const paused=worker({version:'pause-test',files:smallFiles});await paused.dispatch('install').done();
pauseFetch=()=>paused.dispatch('message',{data:{atlasOffline:true,type:'PAUSE'}});await paused.download();assert(!(await paused.status()).plan.ready);assert(messages.at(-1).error.includes('pausada'));
await paused.download();assert((await paused.status()).plan.ready);
cacheStores.clear();
const quota=worker({version:'quota-test',files:smallFiles.map(f=>({...f,hash:f.hash+'-quota'}))});await quota.dispatch('install').done();quotaURL=smallFiles[1].url;await quota.download();assert(!(await quota.status()).plan.ready);assert(messages.at(-1).error.includes('espacio'));quotaURL=null;await quota.download();assert((await quota.status()).plan.ready);

// Pisos por separado: con la base y un piso pedidos, solo se baja eso; el resto del edificio queda sin guardar.
cacheStores.clear();requests.length=0;const porPiso=worker();await porPiso.dispatch('install').done();await porPiso.dispatch('activate').done();
await porPiso.dispatch('message',{data:{atlasOffline:true,type:'DOWNLOAD',packs:['plan','n02']}}).done();
let st=await porPiso.status();assert(st.plan.ready&&st.packs.n02.ready);assert(!st.packs.n01.ready&&!st.packs['n-1'].ready);
assert(requests.every(url=>manifest.files.find(f=>f.url===url)?.pack!=='n01'),'no baja pisos no pedidos');
// Sin red: lo que falta guardar responde al instante, sin reintentar la red durante 30 s.
offline=true;assert.equal((await porPiso.get(tile)).status,503);offline=false;const antesCaida=requests.length;
assert.equal((await porPiso.get(manifest.files.find(f=>f.pack==='n01'&&f.url.endsWith('.webp')).url)).status,503);assert.equal(requests.length,antesCaida,'con la red recién caída no se espera la red');

// Migración: un teléfono con el edificio completo en el formato anterior (un solo paquete «plan») conserva todos
// los pisos al actualizar, sin red.
cacheStores.clear();const legado={version:'legado',files:manifest.files.map(f=>({...f,pack:f.pack==='documents'?'documents':'plan'}))};
const viejo=worker(legado);await viejo.dispatch('install').done();await viejo.dispatch('activate').done();await viejo.download();assert((await viejo.status()).plan.ready);
offline=true;const migrado=worker({...manifest,version:manifest.version+'-migrado'}),antesMigrar=requests.length;await migrado.dispatch('install').done();await migrado.dispatch('activate').done();
st=await migrado.status();assert(buildingReady(st),'los pisos guardados en el formato anterior se conservan');assert.equal(requests.length,antesMigrar);assert.equal((await caches.keys()).length,1);offline=false;
console.log(JSON.stringify({checks:'passed',floorPacks,manifestAssets:manifest.files.length,offlineNavigation:'cached HTML + app modules',offlineConsultation:'search + hit test + tile + rombo + export assets, zero network requests',recovery:['interrupted download','resume missing files','pause','quota error','partial cache eviction','version reuse','complete packs preserved on update','failed update keeps old offline copy','old copies deleted on activate','one floor at a time','fast failure without network','single-pack copies migrate to floor packs'],optionalPDFs:'offline after explicit download'}));
