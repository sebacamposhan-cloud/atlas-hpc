import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodePma} from './dist/pma-model.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {tasksFor, reportProgress, keyFor, estadoPartida, actualizarPartida, ESTADOS_PARTIDA, COLOR_PARTIDA} from './dist/room-progress-model.mjs';
import {romboSVG} from './dist/rombo.mjs';

// Rombo interactivo: estado de ejecución por partida y registro de una partida a la vez, con las reglas del checklist.
const model = decodePma(JSON.parse(fs.readFileSync('dist/pma/catalog.json'))), rooms = decodeRuntime(JSON.parse(fs.readFileSync('dist/runtime.json'))).data.rooms;
const room = rooms.find(r => tasksFor(model, r).filter(t => t.applicable).length === 6 && tasksFor(model, r).every(t => t.documented));
const firma = {responsible: 'Jefe de terreno', date: '2026-10-30', at: '2026-10-30T12:00:00Z'};

// Estados: lo observado manda; luego instalado y conforme; sin registro, no aplica y sin definición aparte.
const t = (installation, quality = 'Sin revisar', extra = {}) => ({applicable: true, documented: true, installation, quality, ...extra});
assert.deepEqual([t('Sin registrar'), t('No iniciado'), t('En proceso'), t('Instalado'), t('En proceso', 'Con observaciones'), t('Instalado', 'Conforme'), {applicable: false}, {applicable: true, documented: false}, null].map(estadoPartida),
  ['Sin registrar', 'No iniciado', 'En proceso', 'Instalado · por revisar', 'Con observaciones', 'Instalado y conforme', 'No aplica', 'Sin definición', 'Sin definición']);
assert(ESTADOS_PARTIDA.every(e => COLOR_PARTIDA[e]), 'cada estado tiene su color');

// Primer registro desde el rombo: solo cambia la partida tocada; las demás quedan sin registrar.
const v1 = actualizarPartida(model, room, 'N-1', null, 'PAV', {installation: 'En proceso'}, firma);
assert.deepEqual([v1.version, v1.key, v1.sourceSha], [1, keyFor(room.code), model.source.sha256]);
assert.deepEqual(Object.values(v1.fields).map(f => f.installation).sort(), ['En proceso', 'Sin registrar', 'Sin registrar', 'Sin registrar', 'Sin registrar', 'Sin registrar']);
// Segundo: otra partida conserva lo guardado en la primera.
const v2 = actualizarPartida(model, room, 'N-1', v1, 'CIE', {installation: 'Instalado', quality: 'Conforme'}, firma);
assert.deepEqual([v2.version, v2.fields.PAV.installation, v2.fields.CIE.installation, v2.fields.CIE.quality], [2, 'En proceso', 'Instalado', 'Conforme']);
const fila = reportProgress(model, [room], [v2]).rows[0];
assert.deepEqual(['PAV', 'CIE', 'M1'].map(f => estadoPartida(fila.tasks.find(x => x.field === f))), ['En proceso', 'Instalado y conforme', 'Sin registrar']);
// Bajar de instalado quita la conformidad.
assert.equal(actualizarPartida(model, room, 'N-1', v2, 'CIE', {installation: 'En proceso'}, firma).fields.CIE.quality, 'Sin revisar');
// Reglas: conforme exige instalado y nada pendiente; con observaciones exige la nota; responsable obligatorio.
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'PAV', {quality: 'Conforme'}, firma), /instalada/);
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'CIE', {missing: 'Falta sello perimetral', quality: 'Conforme'}, firma), /Qué falta/);
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'M1', {quality: 'Con observaciones'}, firma), /observación de la partida/);
assert.equal(actualizarPartida(model, room, 'N-1', v2, 'M1', {quality: 'Con observaciones', notes: 'Fisura en junta'}, firma).fields.M1.notes, 'Fisura en junta');
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'M1', {installation: 'Instalado'}, {...firma, responsible: ' '}), /responsable/);
// Un registro de otra versión del PMA no arrastra sus estados.
const viejo = {...v2, sourceSha: 'f'.repeat(64)};
assert.equal(actualizarPartida(model, room, 'N-1', viejo, 'M2', {installation: 'No iniciado'}, firma).fields.PAV.installation, 'Sin registrar');
// Partida sin definición documental o que no aplica: no se registra.
const na = rooms.find(r => tasksFor(model, r).some(x => !x.applicable)), campoNA = tasksFor(model, na).find(x => !x.applicable).field;
assert.throws(() => actualizarPartida(model, na, 'N-1', null, campoNA, {installation: 'Instalado'}, firma), /definición documental/);

// Dibujo: seis secciones tocables con su código, estado en el nombre y aviso de observaciones pendientes.
const partes = {M1: {codigo: '12', estado: 'Instalado y conforme', pendientes: 0}, M2: {codigo: '12', estado: 'En proceso', pendientes: 2}, M3: {codigo: '12', estado: 'Sin registrar', pendientes: 0},
  M4: {codigo: 'N/A', estado: 'No aplica', pendientes: 0}, CIE: {codigo: '201', estado: 'Con observaciones', pendientes: 1}, PAV: {codigo: '105', estado: 'Instalado · por revisar', pendientes: 0}};
const svg = romboSVG(partes, 'PAV');
assert.equal((svg.match(/data-rombo="/g) || []).length, 6);
assert.match(svg, /data-rombo="PAV" role="button" tabindex="0" aria-pressed="true"/);
assert.match(svg, /aria-label="Muro oriente M2 · 12 · En proceso · 2 observaciones pendientes"/);
assert.match(svg, /fill="url\(#romboNA\)"/);
assert(svg.lastIndexOf('data-rombo="PAV"') > svg.lastIndexOf('data-rombo="M4"'), 'la elegida se dibuja encima');
assert.equal((romboSVG(partes, null, String, false).match(/data-rombo=/g) || []).length, 0, 'sin interacción si no se puede registrar');
console.log(JSON.stringify({checks: 'passed', scope: 'Rombo interactivo: estados de ejecución con color, registro de una partida conservando las demás, conformidad solo instalada y sin pendientes, observación con nota, responsable obligatorio, fuente cambiada, partidas sin definición y dibujo con seis secciones, código, estado y observaciones pendientes.'}));
