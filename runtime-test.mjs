import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {searchRooms} from './dist/engine.mjs';
const read=name=>JSON.parse(fs.readFileSync('dist/'+name));
const original=read('data.json'),bundle=read('runtime.json'),runtime=decodeRuntime(bundle);
assert.deepEqual(runtime.data.documents,original.documents);
assert.deepEqual(runtime.data.materials,original.materials);
for(const room of runtime.data.rooms){
 const source=original.rooms.find(r=>r.id===room.id);
 for(const key of Object.keys(source)) if(!['polygon','holes'].includes(key))assert.deepEqual(room[key],source[key],room.id+' '+key);
 assert.equal(room.has_polygon,!!source.polygon);
 const geometry=read('geometry/'+room.document_id+'.json').rooms.find(r=>r.id===room.id);
 assert.deepEqual(geometry.polygon,source.polygon);assert.deepEqual(geometry.holes,source.holes);
 if(source.version>1||source.status==='Validado'){assert.deepEqual(room.polygon,source.polygon);assert.deepEqual(room.holes,source.holes);}
}
for(const query of ['asepsia baja','3.1.1.5.1-1','porcelanato','Vestuarios','pendientes']){
 const p=new URLSearchParams({q:query});assert.deepEqual(searchRooms(runtime.data.rooms,p).map(r=>r.id),searchRooms(original.rooms,p).map(r=>r.id));
}
assert.equal(searchRooms(runtime.data.rooms,new URLSearchParams({geometry:'true'})).length,158);
const selection=read('selection.json');assert.deepEqual(runtime.selection.rooms.map(({id,rings})=>({id,rings})),selection.rooms.map(({id,rings})=>({id,rings})));
const oldBytes=fs.statSync('dist/data.json').size+fs.statSync('dist/selection.json').size+fs.statSync('dist/atlas.json').size+fs.statSync('dist/map/index.json').size;
const newBytes=fs.statSync('dist/runtime.json').size;
assert(newBytes<oldBytes*.25);
console.log(JSON.stringify({roomMetadata:'all 443 unchanged',technicalGeometry:'lossless lazy files',selection:'all 330 unchanged',oldInitialDataBytes:oldBytes,newInitialDataBytes:newBytes,reductionPercent:Math.round((1-newBytes/oldBytes)*100)}));
