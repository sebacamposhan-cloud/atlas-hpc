import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {categoryColor,categoryAppearance} from './dist/layers.mjs';
import {documentedLayerColors} from './dist/documented-layer-colors.mjs';
const audit=JSON.parse(fs.readFileSync('docs/audit/layer-colors.json'));
assert.equal(audit.observations.length,152);
for(const [key,entry] of Object.entries(documentedLayerColors)){
 assert.equal(entry.sources.length,8);
 assert.equal(categoryColor('CIE',key.split('|')[1]),entry.color);
}
for(const row of audit.observations){
 const bytes=fs.readFileSync('dist/source/'+row.source+'.pdf');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.equal(categoryAppearance('CIE',row.code).kind,'source');
 assert.equal(categoryColor('CIE',row.code),row.color);
}
assert.equal(categoryColor('CIE','201'),'#ffcccc');
assert.equal(categoryColor('CIE','202'),'#9ccdcd');
assert.equal(categoryColor('CIE','204'),'#c0c0c0');
assert.equal(categoryAppearance('CIE','201').opacity,1);
assert.equal(categoryAppearance('CIE','201').blend,'multiply');
assert.equal(categoryAppearance('CIE','214').fill,'url(#source-cie214)');
assert.equal(categoryAppearance('walls','12').kind,'consultation');
assert.equal(categoryAppearance('PAV','108').kind,'consultation');
const custom=categoryAppearance('CIE','201',{'CIE|201':'#123456'});
assert.equal(custom.kind,'custom');assert.equal(custom.fill,'#123456');assert.equal(custom.opacity,.32);
console.log('Layer colors: 152 source samples/8 exact PDF hashes, CIE RGB and original grid, consultation/custom provenance and compositing passed');
