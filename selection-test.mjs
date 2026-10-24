import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildHitIndex} from './dist/hit-index.mjs';
const d=JSON.parse(fs.readFileSync('dist/data.json')),a=JSON.parse(fs.readFileSync('dist/atlas.json')),s=JSON.parse(fs.readFileSync('dist/selection.json'));
assert.equal(s.schema,3);assert.equal(s.rooms.length,330);
const byId=new Map(d.rooms.map(r=>[r.id,r])),world=r=>{const t=a.tiles.find(t=>t.id===r.document_id);return {x:r.position[0]+t.offset[0],y:r.position[1]+t.offset[1]};};
const hit=buildHitIndex(s.rooms);
for(const entry of s.rooms){const r=byId.get(entry.id);assert(r?.name&&r.finishes.length===6,entry.id);assert.equal(hit(world(r)),r.id,r.code+' label');}
const checks=[[[4600,6350],'3.1.1.5.1-1'],[[4700,6220],'3.1.1.5.1-1'],[[4680,5260],'3.1.1.3.1-1'],[[4500,5440],'3.1.1.3.1-1'],[[4360,5350],'3.1.1.3.1-1'],[[4350,5240],'3.1.1.3.2-1'],[[4680,5600],'3.1.1.3.1-2'],[[4380,5700],'3.1.1.3.2-2'],[[4800,3680],'8.2.4.4.5-2'],[[4800,3500],'8.2.4.3.6-2'],[[1780,2370],'8.1.4.1.11-1'],[[3350,1340],'8.1.7.1.11-1'],[[3350,600],'8.1.7.1.7-1'],[[5400,2040],'8.2.1.1.2-1'],[[6000,3000],'8.2.1.1.1-1'],[[5050,2500],'8.2.1.1.3-1'],[[1360,5050],'8.1.4.1.8-1'],[[1800,5000],'8.1.4.1.6-1'],[[1800,5600],'8.1.4.1.7-1'],[[1570,4640],'8.1.4.1.5-1'],[[2500,5700],'8.1.4.1.3-1'],[[2200,5750],'8.1.4.1.4-1']];
for(const [[x,y],code] of checks)assert.equal(byId.get(hit({x,y}))?.code,code,`${x},${y}`);
assert.equal(hit({x:0,y:0}),null);assert.equal(hit({x:15000,y:15000}),null);
const t=performance.now();for(let i=0;i<10000;i++)hit({x:1205+(i*173)%5100,y:384+(i*71)%7430});const ms=performance.now()-t;
const html=fs.readFileSync('dist/index.html','utf8'),app=fs.readFileSync('dist/app.js','utf8');assert(!html.includes('<script src="vendor/'));assert(!app.includes('class="marker"'));assert(!app.includes('await renderRegion('));
const m=JSON.parse(fs.readFileSync('dist/map/index.json'));for(const l of m.levels)for(let y=0;y<l.rows;y++)for(let x=0;x<l.columns;x++)assert(fs.existsSync(`dist/map/${l.z}/${x}_${y}.webp`));
console.log(JSON.stringify({labels_checked:s.rooms.length,interior_and_neighbour_checks:checks.length,lookups:10000,lookup_total_ms:Math.round(ms*100)/100,map_overview_bytes:fs.statSync('dist/map/overview.webp').size,selection_bytes:fs.statSync('dist/selection.json').size,checks:'passed'},null,2));
