import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodePma} from './dist/pma-model.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {tasksFor,keyFor} from './dist/room-progress-model.mjs';
import {progressRooms} from './dist/progress-scope.mjs';
import {overviewProgress,overviewObservations,overviewProtocols} from './dist/floor-overview-model.mjs';
const model=decodePma(JSON.parse(fs.readFileSync('dist/pma/catalog.json'))),catalog=JSON.parse(fs.readFileSync('dist/protocols/catalog.json'));
for(const [level,file] of Object.entries({'N-1':'runtime.json',N01:'n01/runtime.json',N02:'n02/runtime.json',N03:'n03/runtime.json'})){
 const rooms=decodeRuntime(JSON.parse(fs.readFileSync('dist/'+file))).data.rooms;
 const one=rooms.find(room=>tasksFor(model,room,level).length===6&&tasksFor(model,room,level).every(task=>task.applicable&&task.documented));
 const fields=Object.fromEntries(tasksFor(model,one,level).map(task=>[task.field,{code:task.code,installation:'Instalado',quality:'Conforme',notes:'',missing:''}]));
 Object.assign(fields.PAV,{quality:'Con observaciones',notes:'Revisar encuentro'});fields.CIE.quality='Sin revisar';
 Object.assign(fields.M1,{installation:'En proceso',quality:'Sin revisar'});Object.assign(fields.M2,{installation:'No iniciado',quality:'Sin revisar'});Object.assign(fields.M4,{installation:'Sin registrar',quality:'Sin revisar'});
 const record={key:keyFor(one.code,level),code:one.code,level,sourceSha:model.source.sha256,fields};
 const other=level==='N02'?'N01':'N02';
 const report=overviewProgress(model,[...rooms,one,{...one,level:other,id:'other-floor'}],[record,{...record,level:other,key:keyFor(one.code,other)}],level);
 assert.equal(report.roomCount,progressRooms(rooms,level).length);assert.equal(report.installed,3);assert.equal(report.accepted,1);assert.equal(report.observed,1);assert.equal(report.coverage.awaitingReview,1);assert.equal(report.coverage.recorded,5);
 assert.equal(report.installation.reduce((n,row)=>n+row.n,0),report.total);assert.equal(report.installedPercent,300/report.total);assert.equal(report.coverage.unregistered,report.total-5);
 const stale=overviewProgress(model,[one],[{...record,sourceSha:'0'.repeat(64)}],level);assert.equal(stale.installed,0);assert.equal(stale.coverage.stale,6);assert.equal(stale.coverage.unregistered,6);
 const missing=overviewProgress(model,[{...one,code:'not-in-pma'}],[],level);assert.equal(missing.installedPercent,null);assert.equal(missing.total,0);assert.equal(missing.withoutPma,1);
 const observation=(state,id,obsLevel=level)=>({id,level:obsLevel,estado:state,room:{code:one.code},plazo:'2026-10-01',creada:'2026-10-01',cerrada:state==='Cerrada'?'2026-10-02':null,categoria:'Pintura'});
 const obs=overviewObservations(['Abierta','En corrección','Corregida','Cerrada','Descartada'].map((state,i)=>observation(state,String(i))).concat(observation('Abierta','other',other)),level,'2026-10-29');
 assert.equal(obs.total,5);assert.equal(obs.pendientes,3);assert.equal(obs.vencidas,2);assert.equal(obs.porVerificar,1);assert.equal(obs.porEstado.Cerrada,1);
 const protocols=overviewProtocols(catalog,level);assert.equal(protocols.total,protocols.open+protocols.closed+protocols.voided+protocols.other);assert(protocols.shared>0);assert.equal(protocols.cutoff,catalog.source.cutoff);
 const tiny={source:{cutoff:'2026-10-26'},specialties:[{id:'test'}],types:[{id:'test',facets:[['N01','ABIERTO','test',2],['N01-N09','ABIERTO','test',3],['N02','CERRADO','test',7],['','ABIERTO','test',11],['S01','ABIERTO ','test',1]]}]};
 const explicit=overviewProtocols(tiny,'N01');assert.equal(explicit.total,5);assert.equal(explicit.open,5);assert.equal(explicit.shared,3);assert.equal(overviewProtocols(tiny,'N02').open,0);assert.equal(overviewProtocols(tiny,'N-1').open,1);
}
console.log('Floor overview: real sources on four floors; unique rooms, unchanged eligible denominators, stale/missing sources, independent observations, explicit shared protocols and no inferred levels.');
