import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {findDiamonds,diamondFields,diamondBox} from './dist/diamonds.mjs';
const data=JSON.parse(fs.readFileSync('dist/data.json')),atlas=JSON.parse(fs.readFileSync('dist/atlas.json')),report=JSON.parse(fs.readFileSync('docs/audit/diamond-recognition.json'));
assert.equal(findDiamonds(data.rooms).length,443);assert.equal(report.summary.recognized,443);assert.deepEqual(report.summary.known_not_detected,[]);assert.equal(report.summary.unassociated_candidates,0);
const seen=new Set();
for(const candidate of report.candidates){
 assert.equal(candidate.roomIds.length,1);const id=candidate.roomIds[0];assert(!seen.has(id));seen.add(id);const r=data.rooms.find(r=>r.id===id),doc=data.documents.find(d=>d.id===r.document_id);
 assert.equal(candidate.sourceId,doc.id);assert.equal(candidate.sha256,createHash('sha256').update(fs.readFileSync('dist/source/'+doc.filename)).digest('hex'));
 for(const field of diamondFields)assert.equal(candidate.fields[field].code,r.finishes.find(f=>f.field===field).code);
 assert(diamondBox(r,atlas));assert(fs.existsSync('dist'+r.diamond_url));
}
assert.equal(seen.size,443);assert.equal(findDiamonds(data.rooms,{documentId:data.documents[0].id}).length,37);
assert(findDiamonds(data.rooms,{query:'laminado de alta presion'}).some(r=>r.finishes.some(f=>f.code==='16')));
for(const code of ['N/A','S/E'])assert(report.candidates.some(c=>c.fields.CIE.code===code));
assert.equal(diamondBox({document_id:'missing',diamond_bbox:[0,0,1,1]},atlas),null);
console.log('Diamond recognition: 443 source-backed six-field symbols, N/A/S/E, unique observation IDs, catalogue search and map boxes passed');
