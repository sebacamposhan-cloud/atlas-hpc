import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {resolveFootprints} from './dist/geometry-authority.mjs';
import {buildHitIndex} from './dist/hit-index.mjs';
import {roomContourRepairs} from './dist/room-contour-repairs.mjs';
import {validateParts} from './dist/contour-geometry.mjs';
const bundle=decodeRuntime(JSON.parse(fs.readFileSync('dist/runtime.json'))),before=JSON.stringify(bundle);
const rows=bundle.data.rooms.filter(r=>bundle.selection.rooms.some(e=>e.id===r.id));
const resolved=resolveFootprints(bundle.atlas,rows,new Map(),bundle.selection),hit=buildHitIndex(resolved.values());
assert.equal(roomContourRepairs.filter(r=>r.kind==='source_outline').length,16);
for(const repair of roomContourRepairs){
 const source=bundle.data.documents.find(d=>d.id===repair.sourceId),r=rows.find(r=>r.id===repair.id);
 assert.equal(source.sha256,repair.sourceSha256);
 validateParts(repair.rings,source.width,source.height);
 const [x,y]=repair.offset;
 assert.equal(hit({x:r.position[0]+x,y:r.position[1]+y}),r.id,'source label still selects its own room');
}
const localHit=(id,p)=>{const r=roomContourRepairs.find(r=>r.id===id);return hit({x:p[0]+r.offset[0],y:p[1]+r.offset[1]});};
const office='507-aa38cf6c:r0035',serio='508-88399997:r0032',prep='508-88399997:r0035';
assert.equal(localHit(office,[800,1960]),office,'office desk strip omitted in screenshot is restored');
assert.notEqual(localHit(office,[935,2100]),office,'wall/column notch is excluded');
assert.equal(localHit(prep,[1450,425]),prep,'lower preparation-room strip is restored');
assert.equal(localHit(serio,[1500,490]),serio,'upper seriograph area is restored');
assert.equal(localHit(serio,[1550,695]),serio,'lower seriograph area is restored');
assert.notEqual(localHit(serio,[1600,500]),serio,'adjacent bathroom is excluded');
const originalAux=buildHitIndex(bundle.selection.rooms);
const off=roomContourRepairs.find(r=>r.id===office).offset;
assert.notEqual(originalAux({x:off[0]+800,y:off[1]+1960}),office,'test must reproduce the actual old omission');
for(const [id,p] of [[serio,[1550,695]],[prep,[1450,425]]]){
 const [x,y]=roomContourRepairs.find(r=>r.id===id).offset;
 assert.notEqual(originalAux({x:x+p[0],y:y+p[1]}),id,'old data must reproduce the omitted screenshot area');
}
assert.equal(localHit('505-49eb24e4:r0004',[1800,600]),'505-49eb24e4:r0004','full warehouse extends beyond old artificial division');
assert.notEqual(localHit('505-49eb24e4:r0004',[760,860]),'505-49eb24e4:r0004','warehouse column is excluded');
assert.equal(localHit('508-88399997:r0018',[900,1550]),'508-88399997:r0018','dirty-room sink strip restored');
assert.notEqual(localHit('508-88399997:r0018',[900,1685]),'508-88399997:r0018','outside sloping wall excluded');
assert.notEqual(localHit('508-88399997:r0019',[800,1658]),'508-88399997:r0019','outside sloping storage wall excluded');
const old=rows.find(r=>r.id===office),manual={...old,version:2,geometry_method:'Edición manual en navegador',geometry_status:'Pendiente de revisión',polygon:[[800,2020],[810,2020],[810,2030],[800,2030]],holes:[]};
assert.equal(resolveFootprints(bundle.atlas,rows.map(r=>r.id===office?manual:r),new Map(),bundle.selection).get(office).method,'manual');
const shifted=structuredClone(bundle.atlas);shifted.tiles.find(t=>t.id===old.document_id).offset[0]+=1;
assert.notEqual(resolveFootprints(shifted,rows,new Map(),bundle.selection).get(office).method,'source_repair','changed registration must reject stale repairs');
assert.equal(JSON.stringify(bundle),before);
console.log('Source contours: 16 outlines, matching source hashes, valid geometry, restored screenshot strips, column/bathroom exclusions, manual precedence and unchanged originals passed');
