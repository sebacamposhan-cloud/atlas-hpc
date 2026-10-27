import assert from 'node:assert/strict';
import {workDistributions,workChart} from './dist/work-charts.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const zones=[{id:'a',specialty:'ceilings'},{id:'b',specialty:'ceilings'},{id:'c',specialty:'floors'}];
const protocols=[{id:'1',technical:'Aprobado',administrative:'Cerrado'},{id:'2',technical:'Observado',administrative:'Abierto'},{id:'3',technical:'Aprobado',administrative:'Abierto'}];
const events=[{zoneId:'a',dimension:'structure',state:'Estructurado',at:'2026-10-25T10:00:00Z'},{zoneId:'a',dimension:'structure',state:'En ejecución',at:'2026-10-24T10:00:00Z'},{zoneId:'c',dimension:'floor',state:'Instalación parcial',at:'2026-10-25T10:00:00Z'},{zoneId:'orphan',dimension:'structure',state:'Revisado'}];
const model=workDistributions([...zones,zones[0]],events,[...protocols,protocols[0]]);
assert.equal(model.zones.length,3);assert.equal(model.protocols.length,3);
assert.deepEqual(model.protocolStates.filter(x=>x.n).map(x=>[x.key,x.n]),[['Observado',1],['Aprobado',2]]);
assert.equal(model.state(zones[0],'structure'),'Estructurado');assert.equal(model.state(zones[1],'structure'),'Sin registrar');
assert.equal(model.dimensions.find(d=>d.dimension==='structure').items.reduce((n,x)=>n+x.n,0),2);
assert.equal(model.dimensions.find(d=>d.dimension==='floor').items.reduce((n,x)=>n+x.n,0),1);
assert.equal(model.dimensions.find(d=>d.dimension==='inspection').items.reduce((n,x)=>n+x.n,0),3);
const empty=workChart({title:'Protocolos',items:[],kind:'pie'},esc);assert.match(empty,/Sin registros/);assert(!empty.includes('<svg'));assert(!empty.includes('%'));
const single=workChart({title:'Protocolos',items:[{key:'<Pendiente>',n:1,color:'#000000'}],kind:'pie',filter:'protocol'},esc);assert.match(single,/<circle/);assert.match(single,/&lt;Pendiente>/);assert(!single.includes('NaN'));assert(single.includes('tabindex="0"'));
const pie=workChart({title:'Estados',items:model.protocolStates,kind:'pie',filter:'protocol'},esc);assert.match(pie,/<path/);assert(pie.includes('aria-label="Aprobado: 2 registros"'));assert(!pie.includes('100%'));
console.log('Work charts: unique IDs, latest event, separate dimensions, missing states, real denominators, empty/single/multiple pie, accessible actions and escaped labels passed');

assert(workChart({title:'PMA',items:[],emptyText:'Sin registros para estos filtros.'},s=>String(s)).includes('Sin registros para estos filtros.'));
