import assert from 'node:assert/strict';
import fs from 'node:fs';
// Cielos según las láminas CIE (scripts/cielos/extraer-cie.mjs): cada piso marcado con «cielos» tiene su archivo, con
// tipo de cielo y NCT por recinto, láminas ubicadas con residuo chico y el código de cielo comparado con el PMA.
const pisos = fs.readFileSync('dist/pisos.js', 'utf8');
for (const [id, datos, minimo] of [['N01', 'n01', 300], ['N02', 'n02', 300], ['N03', 'n03', 250], ['N04', 'n04', 180]]) {
  assert.match(pisos, new RegExp(`id: '${id}'[^}]*cielos: true`), id + ' marcado con cielos');
  const c = JSON.parse(fs.readFileSync(`dist/${datos}/cielos.json`, 'utf8'));
  assert.equal(c.schema, 1); assert.equal(c.piso, id);
  const recintos = Object.entries(c.recintos);
  assert(recintos.filter(([, r]) => r.cielos.length).length >= minimo, id + ': recintos con tipo de cielo');
  for (const [code, r] of recintos) {
    assert(r.cielos.every(x => /^2\d\d$/.test(x)), code + ' código de cielo');
    assert(r.nct.every(v => v > 2 && v < 6), code + ' NCT en metros');
    if (r.difiere) assert(r.pma.length && !r.cielos.some(x => r.pma.includes(x)), code + ' diferencia con el PMA');
  }
  for (const l of c.laminas.filter(l => !l.error)) assert(l.residuoMediano < 1.5 && Math.abs(l.giro) < 2, id + ' ' + l.lamina + ' bien ubicada');
}
const {lineaCielo} = await import('./dist/cielos-lamina.mjs').catch(() => ({}));
assert.equal(typeof lineaCielo, 'function');
console.log('Cielos por lámina CIE: N01–N04 con tipo de cielo y NCT por recinto, láminas ubicadas y comparación con el PMA');
