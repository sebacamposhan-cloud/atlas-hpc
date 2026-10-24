import fs from 'node:fs';
import assert from 'node:assert/strict';
import {searchRooms,validatePolygon,inside} from './dist/engine.mjs';
const d=JSON.parse(fs.readFileSync(new URL('./dist/data.json',import.meta.url)));
assert.equal(d.documents.length,9);assert.equal(d.rooms.filter(r=>!r.id.includes(':extra')).length,438);assert.equal(d.rooms.filter(r=>r.id.includes(':extra')).length,5);
const search=q=>searchRooms(d.rooms,new URLSearchParams({q}));
assert.equal(search('3.1.4.1.3-1')[0].name,'Oficina de Atención y Apoyo a Familiares');
assert.equal(search('Dame todos los recintos con asepsia baja').filter(r=>!r.id.includes(':extra')).length,102);
assert.equal(search('asepsia media').filter(r=>!r.id.includes(':extra')).length,83);assert.equal(search('asepsia alta').length,0);
assert.equal(search('¿Qué trae RT.(-1)-1?').some(r=>r.code==='RT.(-1)-1'),true);
assert.equal(search('pendientes').filter(r=>!r.id.includes(':extra')).length,436);
assert.equal(searchRooms(d.rooms,new URLSearchParams({geometry:'true'})).length,158);
for(const doc of d.documents){assert(fs.existsSync(new URL('./dist/source/'+doc.filename,import.meta.url)));assert(fs.existsSync(new URL('./dist'+doc.image_url,import.meta.url)));}
for(const r of d.rooms){assert(fs.existsSync(new URL('./dist'+r.diamond_url,import.meta.url)));if(r.polygon)assert(inside(r.position,r.polygon));}
assert.throws(()=>validatePolygon([[0,0],[30,30],[0,30],[30,0]],100,100));assert(validatePolygon([[0,0],[30,0],[30,30],[0,30]],100,100));
const times=[];for(let i=0;i<100;i++){const t=performance.now();search('asepsia baja');times.push(performance.now()-t);}times.sort((a,b)=>a-b);
console.log(JSON.stringify({checks:'passed',documents:d.documents.length,rooms:d.rooms.length,polygons:158,median_ms:times[50],max_ms:times.at(-1),browser_QA:'see README for visual QA scope'},null,2));
// Exercise browser persistence and conflict protection with an isolated storage adapter.
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};globalThis.location={origin:'https://example.test'};globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('./dist/'+String(url).replace(/^\.\//,''),import.meta.url)))});
const {localAPI}=await import('./dist/web-store.mjs');const r=d.rooms.find(x=>x.code==='3.1.4.1.3-1');const update={version:r.version,code:r.code,name:r.name+' revisado',status:'Pendiente de revisión',responsible:'Test',reason:'Prueba aislada',finishes:r.finishes,diamond_bbox:r.diamond_bbox};
const saved=await localAPI('/api/rooms/'+r.id,{method:'PATCH',body:JSON.stringify(update)});assert.equal(saved.version,r.version+1);assert.equal(saved.history.length,1);assert.equal((await localAPI('/api/rooms/'+r.id)).name,update.name);await assert.rejects(localAPI('/api/rooms/'+r.id,{method:'PATCH',body:JSON.stringify(update)}));assert.equal(search('¿Qué trae RT.(-1)-10?').length,2);assert(search('¿Qué trae RT.(-1)-10?').every(r=>r.code==='RT.(-1)-10'));console.log('Browser-store persistence, history, version conflicts: passed');
