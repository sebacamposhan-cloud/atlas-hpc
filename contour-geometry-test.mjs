import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateParts,partsToFeature,featureToParts,containsPoint} from './dist/contour-geometry.mjs';
const square=[[0,0],[20,0],[20,20],[0,20]],hole=[[5,5],[8,5],[8,8],[5,8]],parts=[{polygon:square,holes:[hole]},{polygon:[[30,0],[40,0],[40,10],[30,10]],holes:[]}];
assert.equal(validateParts(parts,50,50).geometry.type,'MultiPolygon');assert.deepEqual(featureToParts(partsToFeature(parts)),parts);assert(!containsPoint(parts,[6,6]));assert(containsPoint(parts,[15,15]));
assert.throws(()=>validateParts([{polygon:[[0,0],[20,20],[0,20],[20,0]],holes:[]}],50,50));
assert.throws(()=>validateParts([{polygon:square,holes:[[[25,25],[30,25],[30,30],[25,30]]]}],50,50),/hueco/);
assert.throws(()=>validateParts([{polygon:square,holes:[]},{polygon:[[10,10],[30,10],[30,30],[10,30]],holes:[]}],50,50));
assert.throws(()=>validateParts([{polygon:[[0,0],[100,0],[20,20]],holes:[]}],50,50),/lámina/);
const data=JSON.parse(fs.readFileSync('dist/data.json'));
for(const r of data.rooms.filter(r=>r.polygon&&r.geometry_status==='Validado')){const d=data.documents.find(d=>d.id===r.document_id);validateParts([{polygon:r.polygon,holes:r.holes}],d.width,d.height);}
console.log('Turf validation: multipart, holes, self intersections, overlaps, source bounds and real validated contours passed');
