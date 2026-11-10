// Agenda de terreno (dist/agenda.mjs) y ficha del folio de protocolos (dist/protocolo-folio.mjs).
import assert from 'node:assert/strict';
import {finDeSemana, agruparAgenda, cuando} from './dist/agenda.mjs';
import {CAMPOS, fichaFolioHTML, diasAbierto, valorCampo, fecha} from './dist/protocolo-folio.mjs';
import {matrixFields} from './dist/protocol-model.mjs';

// La semana termina el domingo, como Last Planner.
assert.equal(finDeSemana('2026-11-09'), '2026-11-15', 'lunes');
assert.equal(finDeSemana('2026-11-15'), '2026-11-15', 'domingo');
assert.equal(finDeSemana('2026-12-30'), '2027-01-03', 'cruza el año');

const yo = 'p1', m = (id, extra) => ({id, titulo: 'Tarea ' + id, asignadaA: yo, asignadaPor: 'jefe', estado: 'asignada', fechaLimite: null, ...extra});
const metas = [
  m('atrasada', {fechaLimite: '2026-11-05'}), m('hoy', {fechaLimite: '2026-11-09'}), m('jueves', {fechaLimite: '2026-11-12'}),
  m('proxima', {fechaLimite: '2026-11-20'}), m('sinfecha'), m('devuelta', {estado: 'devuelta', fechaLimite: '2026-11-14'}),
  m('hecha', {estado: 'hecha', fechaLimite: '2026-11-09'}), m('otra', {asignadaA: 'p2', fechaLimite: '2026-11-09'})
];
const g = agruparAgenda(metas, yo, '2026-11-09');
assert.deepEqual(g.hoy.map(x => x.id), ['devuelta', 'atrasada', 'hoy'], 'hoy: devueltas primero, luego lo atrasado y lo de hoy');
assert.deepEqual(g.semana.map(x => x.id), ['jueves']);
assert.deepEqual(g.despues.map(x => x.id), ['proxima', 'sinfecha']);
assert.equal(cuando(metas[0], '2026-11-09'), 'Atrasada · 05-11-2026');
assert.equal(cuando(metas[1], '2026-11-09'), 'Hoy');
assert.equal(cuando(metas[4], '2026-11-09'), 'Sin fecha');

// Ficha del folio: los 16 datos de la matriz, ni uno menos.
assert.equal(CAMPOS.length, 16);
assert.deepEqual(CAMPOS.map(([k]) => k), matrixFields.filter(k => k !== 'sourceRow'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const fila = {sourceRow: 15958, item: 5899, specialty: 'Terminaciones', process: 'Tabique', code: 'TFAOP-IN-1-TER', folio: 1, element: 'Fachada', level: 'N2', axes: 'AJ-A1/AJ-A2', rooms: '', issued: 45583, selfCheck: '', closed: '', closedDate: '', month: '', receiver: 'Recibe de ejemplo', state: 'ABIERTO'};
assert.equal(fecha(45583), '18-10-2024');
assert.equal(diasAbierto(fila, false, '2026-11-09'), 752);
assert.equal(diasAbierto({...fila, state: 'CERRADO'}, false, '2026-11-09'), null);
assert.equal(valorCampo(fila, 'rooms'), '—');
assert.equal(valorCampo(fila, 'state'), 'Abierto');
const html = fichaFolioHTML({fila, tipo: {code: 'TFAOP-IN-1-TER', name: 'Tabique'}, corte: '2026-10-26', esc, enPlano: true, hoy: '2026-11-09'});
for (const [, nombre] of CAMPOS) assert.ok(html.includes(`<dt>${nombre}</dt>`), nombre);
assert.match(html, /abierto hace 752 días/);
assert.match(html, /Matriz al 26-10-2026/);
assert.match(html, /data-folio-plano/);
console.log('agenda-test: ok');
