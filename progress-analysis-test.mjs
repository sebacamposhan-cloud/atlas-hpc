import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodePma} from './dist/pma-model.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {tasksFor,keyFor,reportProgress,validateRecord} from './dist/room-progress-model.mjs';
import {progressDetails,progressCoverage} from './dist/progress-analysis.mjs';
const model=decodePma(JSON.parse(fs.readFileSync('dist/pma/catalog.json')));
for(const [level,file] of Object.entries({'N-1':'runtime.json',N01:'n01/runtime.json',N02:'n02/runtime.json',N03:'n03/runtime.json'})){
 const rooms=decodeRuntime(JSON.parse(fs.readFileSync('dist/'+file))).data.rooms;
 const candidates=rooms.filter(r=>tasksFor(model,r,level).length===6&&tasksFor(model,r,level).every(t=>t.applicable&&t.documented));
 const one={...candidates[0],sector:'A'},two={...candidates.find(r=>r.code!==one.code),sector:'B'};assert(two.code);
 const make=r=>({key:keyFor(r.code,level),code:r.code,level,sourceSha:model.source.sha256,version:1,responsible:'QA',date:'2026-10-28',at:'2026-10-28T12:00:00Z',notes:'',fields:Object.fromEntries(tasksFor(model,r,level).map(t=>[t.field,{code:t.code,installation:'Instalado',quality:'Conforme',notes:'',missing:''}]))});
 const first=make(one),second=make(two);
 Object.assign(first.fields.PAV,{quality:'Con observaciones',notes:'Remate pendiente',missing:'Completar encuentro'});
 first.fields.CIE.quality='Sin revisar';Object.assign(first.fields.M1,{installation:'En proceso',quality:'Sin revisar'});Object.assign(first.fields.M2,{installation:'No iniciado',quality:'Sin revisar'});Object.assign(first.fields.M4,{installation:'Sin registrar',quality:'Sin revisar'});
 validateRecord(first);validateRecord(second);
 const report=reportProgress(model,[one,two,{...one,id:'missing',code:'not-a-PMA-room'}],[first,second],level);
 assert.equal(progressDetails(report.rows).length,12);assert.deepEqual(progressCoverage(report.rows),{total:12,recorded:11,unregistered:1,stale:0,awaitingReview:1});
 assert.equal(progressDetails(report.rows,'',{kind:'installed'}).length,9);assert.equal(progressDetails(report.rows,'',{kind:'accepted'}).length,7);assert.equal(progressDetails(report.rows,'',{kind:'observed'}).length,1);assert.equal(progressDetails(report.rows,'',{kind:'complete'}).length,6);
 assert.equal(progressDetails(report.rows,'',{kind:'quality',value:'Sin revisar'}).length,1,'Only installed tasks wait for installation review');
 assert.equal(progressDetails(report.rows,'',{kind:'installation',value:'En proceso'}).length,1);
 assert.equal(progressDetails(report.rows,'',{kind:'sector',value:'A'}).length,5,'Accepted M3 is not a sector pending');
 assert.equal(progressDetails(report.rows,'PAV',{kind:'observed'}).length,1);assert.equal(progressDetails(report.rows,'M3',{kind:'observed'}).length,0);
 const stale=reportProgress(model,[one],[{...first,sourceSha:'0'.repeat(64)}],level);assert.equal(progressDetails(stale.rows,'',{kind:'installed'}).length,0);assert(progressDetails(stale.rows).every(d=>d.record===null));assert.equal(progressCoverage(stale.rows).stale,6);
 assert.equal(progressDetails(report.rows,'',{kind:'not-a-filter'}).length,0);assert.equal(report.withoutPma,1);
}
console.log('Dashboard evidence: four real PMA levels, state/quality/sector/family counts match, denominators intact, missing PMA and stale sources excluded from executed progress.');
