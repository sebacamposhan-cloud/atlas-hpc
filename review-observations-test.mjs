import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withReviewObservations} from './dist/review-observations.mjs';
const read=name=>JSON.parse(fs.readFileSync('dist/'+name));
const base=read('disciplines.json'),review=read('cie-review-observations.json'),before=JSON.stringify(base);
assert.equal(review.observations.length,75);
assert.equal(new Set(review.observations.map(r=>r.code)).size,62);
const merged=withReviewObservations(base,review);assert.equal(merged.observations.length,404);assert.equal(JSON.stringify(base),before);
const arq=read('data.json');
for(const r of review.observations){assert(arq.rooms.some(a=>a.code===r.code));assert(r.rawText.includes(r.code));assert.equal(r.area,null);assert.equal(r.nct,null);assert(!r.ceilingCodes);assert(!r.verification);assert.equal(r.associationStatus,'unverified');}
for(const d of base.documents)assert.equal(createHash('sha256').update(fs.readFileSync('dist/source/'+d.filename)).digest('hex'),d.sha256);
assert(merged.observations.some(r=>r.code==='CT.F.(-1)-3'));
assert.deepEqual(merged.observations.find(r=>r.code==='7.1.2.1.2-1'),base.observations.find(r=>r.code==='7.1.2.1.2-1'));
const altered=structuredClone(review);altered.observations[0].source.sha256='wrong';assert.throws(()=>withReviewObservations(base,altered),/incompatible/);
assert.throws(()=>withReviewObservations(base,{...review,observations:[...review.observations,review.observations[0]]}),/incompatible/);
console.log('75 exact-source review observations, preserved originals, source hashes and conflict rejection: passed');
