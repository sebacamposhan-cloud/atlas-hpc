import fs from 'node:fs';
import assert from 'node:assert/strict';
import {attributeState,documentaryStates,deriveAsepsis,asepsisEvidence,ceilingFieldEvidence} from './dist/documentary-evidence.mjs';
const data=JSON.parse(fs.readFileSync('dist/data.json')),selection=JSON.parse(fs.readFileSync('dist/selection.json')),ids=new Set(selection.rooms.map(r=>r.id)),rooms=data.rooms.filter(r=>ids.has(r.id));
const unknown=rooms.filter(r=>!r.asepsis.length);assert.equal(unknown.length,192);
for(const r of data.rooms)assert.deepEqual(deriveAsepsis(r.finishes),r.asepsis);
for(const r of unknown){const evidence=asepsisEvidence(r,data.documents.find(d=>d.id===r.document_id));assert.notEqual(evidence.state,'reviewed_not_found');assert.equal(evidence.fields.length,4);assert(evidence.sha256);assert(r.diamond_url);}
assert.equal(unknown.filter(r=>asepsisEvidence(r).state==='not_applicable').length,1);
assert.equal(unknown.filter(r=>r.finishes.some(f=>/^M/.test(f.field)&&f.code==='15')).length,29);
for(const [input,state] of [[{value:'213',validated:true},'validated'],[{value:'213',associationVerified:true},'documented_pending'],[{value:null},'source_unextracted'],[{value:'213'},'association_unverified'],[{reviewedNotFound:true},'reviewed_not_found'],[{notApplicable:true},'not_applicable'],[{conflict:true,value:'213'},'conflict']]){assert.equal(attributeState(input),state);assert(documentaryStates[state]);}
assert.deepEqual(deriveAsepsis([{field:'CIE',asepsis:'alta'},{field:'PAV',asepsis:'media'},{field:'M1',asepsis:'baja'}]),['baja']);
const cie=JSON.parse(fs.readFileSync('dist/disciplines.json')).observations;
assert.equal(ceilingFieldEvidence(cie.find(r=>r.verification),'ceilingCodes').state,'validated');
assert.equal(ceilingFieldEvidence(cie.find(r=>!r.ceilingCodes),'ceilingCodes').state,'source_unextracted');
// Exercise the actual save pipeline: a misplaced wall-paint code in CIE must not classify a room.
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};globalThis.location={origin:'https://example.test'};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('dist/'+String(url).replace(/^\.\//,'')))});
const {localAPI}=await import('./dist/web-store.mjs');
const r=unknown.find(r=>!r.polygon);assert(r);
const saved=await localAPI('/api/rooms/'+r.id,{method:'PATCH',body:JSON.stringify({version:r.version,code:r.code,name:r.name,status:r.status,responsible:'Automated regression',reason:'Isolated test of field scope',diamond_bbox:r.diamond_bbox,finishes:r.finishes.map(f=>f.field==='CIE'?{...f,code:'12'}:f)})});
assert.deepEqual(saved.asepsis,[]);assert.equal(saved.history.length,1);assert(saved.finishes.some(f=>f.field==='CIE'&&f.code==='12'));
const key='atlas-hpc-web-v1',legacy=JSON.parse(memory.get(key));legacy[r.id].asepsis=['media'];const serialized=JSON.stringify(legacy);memory.set(key,serialized);
const {localAPI:legacyAPI}=await import('./dist/web-store.mjs?legacy');
assert.deepEqual((await legacyAPI('/api/rooms/'+r.id)).asepsis,[]);
assert.equal(memory.get(key),serialized,'normalizing the read projection must not overwrite saved corrections/history');
console.log('Documentary states, 192 source-backed rooms and persisted wall-only asepsis: passed');
