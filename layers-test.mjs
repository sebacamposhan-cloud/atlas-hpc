import assert from 'node:assert/strict';
import fs from 'node:fs';
import {categories,distribution,matchesLayers,categoryColor,auditRoom} from './dist/layers.mjs';
const data=JSON.parse(fs.readFileSync('dist/data.json')),selection=JSON.parse(fs.readFileSync('dist/selection.json'));
const ids=new Set(selection.rooms.map(r=>r.id)),rooms=data.rooms.filter(r=>ids.has(r.id));
assert.equal(rooms.length,330);
assert.equal(new Map(distribution(rooms,'asepsis')).get('media'),72);
assert.equal(new Map(distribution(rooms,'asepsis')).get('baja'),66);
assert.equal(distribution(rooms,'PAV').reduce((s,[k,n])=>s+n,0),330);
assert.equal(categoryColor('asepsis','media'),'#387bd4');
assert.equal(categoryColor('asepsis','baja'),'#35a66b');
assert.equal(categoryColor('asepsis','baja',{'asepsis|baja':'#112233'}),'#112233');
assert.equal(new Map(distribution(rooms,'paint')).get('11'),66);
assert.equal(new Map(distribution(rooms,'paint')).get('12'),72);
for(const r of rooms){assert.deepEqual(categories(r,'PAV'),[r.finishes.find(f=>f.field==='PAV').code]);assert.equal(matchesLayers(r,{asepsis:['media','baja']}),r.asepsis.some(a=>a==='media'||a==='baja'));assert.equal(matchesLayers(r,{asepsis:['media'],PAV:['108']}),r.asepsis.includes('media')&&r.finishes.some(f=>f.field==='PAV'&&f.code==='108'));}
const mixed=rooms.find(r=>r.finishes.some(f=>/^M/.test(f.field)&&f.code==='14')&&r.finishes.find(f=>f.field==='PAV').code!=='14');assert(!matchesLayers(mixed,{PAV:['14']}));
assert.equal(rooms.filter(r=>!auditRoom(r,true).includes('Contorno técnico pendiente')).length,2);
const times=[];for(let j=0;j<30;j++){const t=performance.now();for(let i=0;i<100;i++)rooms.filter(r=>matchesLayers(r,{asepsis:['media'],PAV:['108']}));times.push((performance.now()-t)/100);}times.sort((a,b)=>a-b);
console.log(JSON.stringify({checks:'passed',rooms:330,low:66,medium:72,sourceFloorFields:'exact',filterMedianMs:times[15],filterP95Ms:times[28]}));
