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
const w=worker();await w.dispatch('install').done();await w.dispatch('activate').done();
let status=await w.status();assert(!status.plan.ready);assert.equal(status.plan.count,manifest.files.filter(f=>f.core).length);
const tile=manifest.files.find(f=>f.url.startsWith('/map/2/')).url;
failedURL=tile;await w.download();status=await w.status();assert(!status.plan.ready);assert(messages.at(-1).type==='ERROR');assert.equal(requests.filter(url=>url===tile).length,2);
const savedBefore=status.plan.count,requestsBefore=requests.length;failedURL=null;await w.download();status=await w.status();assert(status.plan.ready);assert.equal(requests.length-requestsBefore,status.plan.total-savedBefore,'resume only fetches missing files');assert(!status.documents.ready);assert(maxFetches<=3);

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
const current=await caches.open('atlas-hpc-offline-'+manifest.version);await current.delete(origin+tile);assert(!(await reopened.status()).plan.ready);
offline=false;const newer={...manifest,version:manifest.version+'-update'},updated=worker(newer),beforeUpdate=requests.length;
await updated.dispatch('install').done();await updated.download();assert((await updated.status()).plan.ready);assert.equal(requests.length-beforeUpdate,1,'unchanged files reused across revisions');
await updated.download('documents');assert((await updated.status()).documents.ready);
offline=true;assert.equal((await updated.get('/source/'+cachedRuntime.data.documents[0].filename)).status,200);offline=false;

// Updating a fully downloaded installation must preserve both offline packs
// before activation, even when none of the unchanged files can be fetched.
offline=true;const preserved=worker({...manifest,version:manifest.version+'-preserved'}),beforePreserve=requests.length;
await preserved.dispatch('install').done();assert((await preserved.status()).plan.ready);assert((await preserved.status()).documents.ready);
await preserved.dispatch('activate').done();assert.equal((await preserved.get(tile)).status,200);assert.equal(requests.length,beforePreserve);
quotaURL=tile;const failedUpdate=worker({...manifest,version:manifest.version+'-failed-update'});await assert.rejects(failedUpdate.dispatch('install').done());assert((await preserved.status()).plan.ready,'failed update must keep the existing offline copy intact');quotaURL=null;offline=false;

// Pause and storage failures leave resumable partial downloads, never a false ready flag.
cacheStores.clear();
const smallFiles=manifest.files.filter(f=>f.url.startsWith('/map/0/')).slice(0,8).map((f,i)=>({...f,hash:f.hash+'-pause',core:i===0}));
const paused=worker({version:'pause-test',files:smallFiles});await paused.dispatch('install').done();
pauseFetch=()=>paused.dispatch('message',{data:{atlasOffline:true,type:'PAUSE'}});await paused.download();assert(!(await paused.status()).plan.ready);assert(messages.at(-1).error.includes('pausada'));
await paused.download();assert((await paused.status()).plan.ready);
cacheStores.clear();
const quota=worker({version:'quota-test',files:smallFiles.map(f=>({...f,hash:f.hash+'-quota'}))});await quota.dispatch('install').done();quotaURL=smallFiles[1].url;await quota.download();assert(!(await quota.status()).plan.ready);assert(messages.at(-1).error.includes('espacio'));quotaURL=null;await quota.download();assert((await quota.status()).plan.ready);
console.log(JSON.stringify({checks:'passed',manifestAssets:manifest.files.length,offlineNavigation:'cached HTML + app modules',offlineConsultation:'search + hit test + tile + rombo + export assets, zero network requests',recovery:['interrupted download','resume missing files','pause','quota error','partial cache eviction','version reuse','complete packs preserved on update','failed update keeps old offline copy'],optionalPDFs:'offline after explicit download'}));
