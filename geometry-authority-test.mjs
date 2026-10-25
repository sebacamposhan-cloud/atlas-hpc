import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolveFootprints} from './dist/geometry-authority.mjs';
import {buildHitIndex} from './dist/hit-index.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
const bundle=decodeRuntime(JSON.parse(fs.readFileSync('dist/runtime.json')));
const ids=new Set(bundle.selection.rooms.map(r=>r.id)),rooms=bundle.data.rooms.filter(r=>ids.has(r.id));
const before=JSON.stringify(bundle),map=resolveFootprints(bundle.atlas,rooms,new Map(),bundle.selection);
const validated=rooms.filter(r=>r.geometry_status==='Validado');assert.equal(validated.length,2);
for(const r of validated){
 assert(r.polygon,'validated geometry must already be in the initial payload');
 const [x,y]=bundle.atlas.tiles.find(t=>t.id===r.document_id).offset;
 assert.equal(map.get(r.id).quality,'validated');
 assert.deepEqual(map.get(r.id).rings[0].polygon,r.polygon.map(p=>[p[0]+x,p[1]+y]));
}
const target=validated.find(r=>r.code==='RT.(-1)-10'),entry=map.get(target.id);
const hit=buildHitIndex(map.values()),aux=buildHitIndex(bundle.selection.rooms.filter(r=>r.id===target.id));
const xs=entry.rings[0].polygon.map(p=>p[0]),ys=entry.rings[0].polygon.map(p=>p[1]);
let restoredPoint;
for(let x=Math.min(...xs)+1;x<Math.max(...xs)&&!restoredPoint;x+=2)for(let y=Math.min(...ys)+1;y<Math.max(...ys);y+=2){if(hit({x,y})===target.id&&!aux({x,y})){restoredPoint={x,y};break;}}
assert(restoredPoint,'real validated area previously omitted by auxiliary selection must be clickable');
for(const e of bundle.selection.rooms.filter(e=>e.rings.length>1))assert.deepEqual(map.get(e.id).rings,e.rings);
const atlas={tiles:[{id:'sheet',offset:[10,20]}]},rect=[[0,0],[10,0],[10,10],[0,10]],hole=[[2,2],[4,2],[4,4],[2,4]];
const row={id:'room',document_id:'sheet',polygon:rect,holes:[hole],geometry_status:'Validado',version:1};
let resolved=resolveFootprints(atlas,[row],new Map(),{rooms:[]});
assert.equal(buildHitIndex(resolved.values())({x:13,y:23}),null,'holes cannot select the enclosing room');
assert.equal(buildHitIndex(resolved.values())({x:11,y:21}),'room');
const manual={...row,version:2,geometry_status:'Pendiente de revisión',geometry_method:'Edición manual en navegador',polygon:[[0,0],[1,0],[1,1],[0,1]],holes:[]};
resolved=resolveFootprints(atlas,[manual],new Map(),{rooms:[{id:'room',score:1,rings:[{polygon:rect,holes:[]}]}]});
assert.equal(resolved.get('room').method,'manual');assert.equal(resolved.get('room').quality,'manual_pending');
assert.equal(buildHitIndex(resolved.values())({x:15,y:25}),null);
assert.equal(JSON.stringify(bundle),before,'authority selection must not alter sources');
console.log(JSON.stringify({checks:'passed',validated:2,multipartPreserved:true,manualAndHoles:true,restoredPoint}));
