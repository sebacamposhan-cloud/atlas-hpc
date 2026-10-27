import assert from 'node:assert/strict';
import fs from 'node:fs';
import {protocolFloors,protocolLevels,onProtocolFloor,sharedProtocol,scopedProtocolRows,scopeProtocolCatalog} from './dist/protocol-scope.mjs';
import {decodeMatrixRows,selectMatrixRows} from './dist/protocol-model.mjs';
import {analyzeCritical} from './dist/protocol-aging.mjs';
const catalog=JSON.parse(fs.readFileSync('dist/protocols/catalog.json'));
assert.deepEqual(protocolLevels(' S 0 1 '),['S01']);assert.deepEqual(protocolLevels('N01, N02, N03'),['N01','N02','N03']);
assert.deepEqual(protocolLevels('N07-N8'),['N07','N08']);assert.deepEqual(protocolLevels('N3P'),[]);assert.deepEqual(protocolLevels('Norte-Oriente'),[]);
assert.equal(onProtocolFloor('N01-N09','N02'),false,'never infer intermediate levels');
assert.equal(onProtocolFloor('N01-N09','N01'),true);assert.equal(sharedProtocol('S01-N01'),true);assert.equal(onProtocolFloor('','N-1'),false);
assert.throws(()=>scopeProtocolCatalog(catalog,'N05'));
const all=[];
for(const type of catalog.types){
 const rows=decodeMatrixRows(JSON.parse(fs.readFileSync('dist/protocols/'+type.file)),catalog,type);all.push(...rows.map(row=>({...row,typeId:type.id})));
 const expected=new Map();for(const row of rows){const group=catalog.specialties.find(s=>s.variants.includes(row.specialty)||!row.specialty?.trim()&&s.name==='Sin especialidad documentada');assert(group);const key=JSON.stringify([row.level?.trim()||'',row.state?.trim()||'Sin estado documentado',group.id]);expected.set(key,(expected.get(key)||0)+1);}
 assert.deepEqual(new Map(type.facets.map(([level,state,id,n])=>[JSON.stringify([level,state,id]),n])),expected, type.code+' facets preserve full row correlations');
}
const totals={'N-1':[2736,324,27,120],N01:[2260,259,29,134],N02:[1496,265,44,117],N03:[1405,218,15,101]};
for(const floor of Object.keys(protocolFloors)){
 const rows=scopedProtocolRows(all,floor),scope=scopeProtocolCatalog(catalog,floor,'ABIERTO'),opened=selectMatrixRows(rows,{state:'ABIERTO'});
 assert.equal(scope.total,rows.length);assert.equal(scope.matching,opened.length);assert.equal(scope.shared,opened.filter(r=>sharedProtocol(r.level)).length);
 assert.deepEqual([scope.total,scope.matching,scope.shared,analyzeCritical(rows,catalog,{asOf:'2026-10-27'}).critical.length],totals[floor]);
 assert.equal(scope.specialties.reduce((n,s)=>n+s.count,0),scope.matching);
 for(const type of scope.types)assert.equal(type.visibleCount,opened.filter(r=>r.typeId===type.id).length);
 assert(rows.every(r=>!['N05','N06','N07','N08','',null].includes(r.level)));
 for(const state of ['','CERRADO','CLOSED_ALL','PENDING_CLOSURE','NULO'])assert.equal(scopeProtocolCatalog(catalog,floor,state).matching,selectMatrixRows(rows,{state}).length);
}
assert.equal(all.length,20233);
console.log('Protocol floor scope: four floors, exact/shared references without inferred ranges, all catalog facet counts reconciled to 20,233 rows, state counts, specialty/type filtering and critical totals passed');
