import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {categoryColor,categoryAppearance,ordenarPaleta,PALETA,OPACIDAD,OPACIDAD_NEUTRA,esNeutro} from './dist/layers.mjs';
import {documentedLayerColors} from './dist/documented-layer-colors.mjs';
// Las muestras de las 8 leyendas ARQ-CIE siguen auditadas (cielos-unificados.mjs las usa para reconocer códigos de cielo),
// pero desde 2026-11-23 los planos pintan con la paleta viva de ATLAS, no con los colores del papel.
const audit=JSON.parse(fs.readFileSync('docs/audit/layer-colors.json'));
assert.equal(audit.observations.length,152);
for(const entry of Object.values(documentedLayerColors))assert.equal(entry.sources.length,8);
for(const row of audit.observations){
 const bytes=fs.readFileSync('dist/source/'+row.source+'.pdf');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
}
// Paleta viva, encabezada por el cian y sin magenta (el magenta es el contorno de «Recintos con retorno»).
assert.equal(PALETA[0],'#00b8d9');
assert.equal(new Set(PALETA).size,PALETA.length);
const magenta=c=>{const n=parseInt(c.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255;return r>180&&b>100&&g<90;};
assert.ok(!PALETA.some(magenta),'sin magenta en la paleta');
// Cada código del piso toma un color distinto, en orden de código.
ordenarPaleta('PAV',['100','101','103','105']);
assert.deepEqual(['100','101','103','105'].map(k=>categoryColor('PAV',k)),PALETA.slice(0,4));
ordenarPaleta('CIE',['201','202']);
assert.equal(categoryColor('CIE','201'),PALETA[0]);
assert.equal(categoryColor('CIE','202'),PALETA[1]);
// Rellenos sólidos y sin mezcla con el fondo; los grises de «sin datos» quedan suaves.
const a=categoryAppearance('PAV','105');
assert.equal(a.opacity,OPACIDAD);assert.equal(OPACIDAD,.85);assert.equal(a.blend,'normal');assert.equal(a.kind,'consultation');assert.equal(a.fill,a.color);
assert.ok(esNeutro('#8b959e')&&esNeutro('#e9ecef')&&!esNeutro('#00b8d9'));
assert.equal(categoryAppearance('PAV','Pendiente de identificación').opacity,OPACIDAD_NEUTRA);
assert.equal(categoryAppearance('walls','12').kind,'consultation');
const custom=categoryAppearance('CIE','201',{'CIE|201':'#123456'});
assert.equal(custom.kind,'custom');assert.equal(custom.fill,'#123456');assert.equal(custom.opacity,OPACIDAD);
console.log('Layer colors: 152 source samples/8 exact PDF hashes, vivid cyan-first palette without magenta, ordered per floor, solid 85% fills without blend, custom colors');
