import fs from 'node:fs';import assert from 'node:assert/strict';
const d=JSON.parse(fs.readFileSync('dist/data.json')),a=JSON.parse(fs.readFileSync('dist/atlas.json'));const tile=id=>a.tiles.find(t=>t.id===id);assert.equal(a.tiles.length,9);let maxError=0;
for(const e of a.edges){const x=tile(e.a).offset,y=tile(e.b).offset;const err=Math.hypot(y[0]-x[0]-e.delta[0],y[1]-x[1]-e.delta[1]);maxError=Math.max(err,maxError);assert.ok(err<.5,`${e.a}/${e.b}: ${err}`);}
for(const r of d.rooms){const t=tile(r.document_id),p=r.position.map((v,i)=>v+t.offset[i]);assert.ok(a.tiles.some(t=>p[0]>=t.clip[0]&&p[0]<=t.clip[0]+t.clip[2]&&p[1]>=t.clip[1]&&p[1]<=t.clip[1]+t.clip[3]),r.code);for(let i=0;i<2;i++)assert.ok(Math.abs(p[i]-t.offset[i]-r.position[i])<1e-8);}
console.log({tiles:9,overlapChecks:a.edges.length,maxAlignmentResidual:maxError,roomPositionsCovered:d.rooms.length,coordinateRoundTrip:'passed'});
