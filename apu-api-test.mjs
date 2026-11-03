import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOperations} from './server/lastplanner.mjs';
import {createDraft} from './dist/lastplanner-cycle-model.mjs';
import {apuSnapshot} from './dist/apu-model.mjs';
const index=JSON.parse(fs.readFileSync('dist/apu/index.json')),catalog=JSON.parse(fs.readFileSync('dist/apu/'+index.file)),part=catalog.parts.find(p=>p.code==='5.1.1'),operation=part.operations.find(o=>o.label.includes('Huincha')),apu=apuSnapshot(catalog,part.id,operation.id),actor={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.test',role:'editor'};
const draft=createDraft({actividad:'APU QA',responsable:'QA',level:'N-1',inicioPlan:'2026-11-02',finPlan:'2026-11-08',cantidad:120,unidad:'m²',planificacion:{apu}},actor);
const op=data=>[{table:'actividades',id:data.id,data,expectedRemote:0}];assert.doesNotThrow(()=>validateOperations(op(draft),'draft',[],actor));const forged=structuredClone(draft);forged.planificacion.apu.operation.coefficient=.001;assert.throws(()=>validateOperations(op(forged),'draft',[],actor),/no coincide/);forged.planificacion.apu.operation={...apu.operation,productivity:{validation:'approved',rate:1000,unit:'m²',basis:'persona-dia',source:'forged'}};assert.throws(()=>validateOperations(op(forged),'draft',[],actor),/no coincide/);console.log('API APU: referencia real aceptada; coeficientes y productividad falsificados rechazados');
