import assert from 'node:assert/strict';
import fs from 'node:fs';
import {associateCode, ceilingMaterials, searchObservations} from './dist/discipline-model.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`./dist/${name}.json`, import.meta.url)));
const arq = read('data'), cie = read('disciplines');
const before = JSON.stringify([arq, cie]);
const documented = associateCode(arq.rooms, cie.observations, '7.1.2.1.2-1');
assert.ok(documented.architecture.length);
assert.equal(documented.observations.length, 1);
const observation = documented.observations[0];
assert.equal(observation.sheetId, 'cie-504');
assert.equal(observation.area, '12,45');
assert.equal(observation.nct, '2,80');
assert.deepEqual(observation.luminaires, ['L19']);
const lookup = code => arq.materials.find(material => material.code === code);
assert.deepEqual(ceilingMaterials(observation, lookup), [{code: '213', description: lookup('213').description}]);
assert.match(lookup('213').description, /Owa/i);

const duplicatedCode = cie.observations.find(row => cie.observations.filter(other => other.code === row.code).length > 1).code;
const candidates = associateCode(arq.rooms, cie.observations, duplicatedCode);
assert.ok(candidates.observations.length > 1);
assert.deepEqual(candidates.observations, cie.observations.filter(row => row.code === duplicatedCode));
assert.deepEqual(candidates.architecture, arq.rooms.filter(room => room.code === duplicatedCode));
assert.deepEqual(associateCode(arq.rooms, cie.observations, '7.1.2.1.2-1', 'floors').observations, []);
assert.deepEqual(associateCode(arq.rooms, cie.observations, 'SIN-CORRESPONDENCIA'), {architecture: [], observations: []});
assert.deepEqual(associateCode([{}], [{}], undefined), {architecture: [], observations: []});

// A material uses its own catalogue entry, never the known example's code 213.
assert.deepEqual(ceilingMaterials({ceilingCodes: ['202', 'NO-DOCUMENTADO']}, lookup), [
  {code: '202', description: lookup('202').description},
  {code: 'NO-DOCUMENTADO', description: 'Sin descripción documentada'},
]);
const unreviewed = cie.observations.find(row => !row.ceilingCodes && row.rawText.includes('206'));
assert.ok(unreviewed);
assert.deepEqual(ceilingMaterials(unreviewed, lookup), []);
assert.deepEqual(ceilingMaterials(null, lookup), []);
assert.deepEqual(ceilingMaterials({ceilingCodes: []}, lookup), []);

const ceilings = cie.observations.filter(row => row.specialty === 'ceilings');
assert.ok(searchObservations(ceilings, arq.rooms, 'consulta medica').includes(observation));
assert.deepEqual(searchObservations(ceilings, arq.rooms, '  7.1.2.1.2-1  ').filter(row => row.code === observation.code), [observation]);
assert.deepEqual(searchObservations(ceilings, arq.rooms, ''), ceilings);
assert.deepEqual(searchObservations(ceilings, arq.rooms, 'ZZZ-SIN-RESULTADOS'), []);

const fixture = [
  {id: 'prefix', code: 'A-10', rawText: 'A-1'},
  {id: 'first', code: 'A-1', rawText: '', name: 'Sala técnica'},
  {id: 'second', code: 'A-1', rawText: ''},
  {id: 'foreign', code: 'B-1', rawText: ''},
];
const rooms = [{code: 'A-1', name: 'Atención Pediátrica'}, {code: 'A-1', name: 'Nombre alternativo'}];
assert.deepEqual(searchObservations(fixture, rooms, 'A-1').map(row => row.id), ['first', 'second', 'prefix']);
assert.deepEqual(searchObservations(fixture, rooms, 'ATENCION PEDIATRICA').map(row => row.id), ['first', 'second']);
assert.deepEqual(searchObservations(fixture, rooms, 'alternativo').map(row => row.id), ['first', 'second']);
assert.deepEqual(searchObservations(fixture, rooms, 'tecnica').map(row => row.id), ['first']);
assert.equal(JSON.stringify([arq, cie]), before, 'Documentary data must remain unchanged');
console.log('Discipline model: documented CIE attributes, all ambiguous matches, material provenance, accent-insensitive name/code search and stable exact-match ordering passed');
