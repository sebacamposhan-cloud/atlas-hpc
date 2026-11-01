import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodePma} from './dist/pma-model.mjs';
import {decodeRuntime} from './dist/runtime-loader.mjs';
import {tasksFor, reportProgress, keyFor, estadoPartida, actualizarPartida, agruparMuros, combinarMuros, ESTADOS_PARTIDA, COLOR_PARTIDA} from './dist/room-progress-model.mjs';
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
// Reglas: conforme exige instalada; «con observaciones» se marca sin texto (el detalle va en las observaciones con foto);
// responsable obligatorio (la cuenta de Nube del equipo).
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'PAV', {quality: 'Conforme'}, firma), /instalada/);
assert.equal(actualizarPartida(model, room, 'N-1', v2, 'M1', {quality: 'Con observaciones'}, firma).fields.M1.quality, 'Con observaciones');
assert.throws(() => actualizarPartida(model, room, 'N-1', v2, 'M1', {installation: 'Instalado'}, {...firma, responsible: ' '}), /responsable/);
// Muros como uno: los muros que aplican en una sola terminación, con sus códigos y estado combinado o derivado.
const unido = agruparMuros(reportProgress(model, [room], [v2]));
assert.deepEqual(unido.rows[0].tasks.map(t => t.field), ['PAV', 'CIE', 'M']);
assert.equal(unido.total, 3, 'cada recinto cuenta pavimento, cielo y muros');
assert.deepEqual(combinarMuros([{installation: 'Instalado', quality: 'Conforme'}, {installation: 'Instalado', quality: 'Conforme'}]), {installation: 'Instalado', quality: 'Conforme'});
assert.deepEqual(combinarMuros([{installation: 'Instalado', quality: 'Conforme'}, {installation: 'Sin registrar', quality: 'Sin revisar'}]), {installation: 'En proceso', quality: 'Sin revisar'});
assert.deepEqual(combinarMuros([{installation: 'No iniciado', quality: 'Sin revisar'}, {installation: 'Sin registrar', quality: 'Con observaciones'}]), {installation: 'No iniciado', quality: 'Con observaciones'});
const derivadoMuros = agruparMuros(reportProgress(model, [room], [v2]), (r, campo) => campo === 'M' ? {installation: 'Instalado', quality: 'Conforme'} : null);
assert.equal(estadoPartida(derivadoMuros.rows[0].tasks.find(t => t.field === 'M')), 'Instalado y conforme');
// Con partidas registradas en el avance, la terminación se calcula desde ellas y manda sobre lo marcado directo.
const derivada = reportProgress(model, [room], [v2], 'N-1', (r, campo) => campo === 'PAV' ? {installation: 'Instalado', quality: 'Con observaciones'} : null).rows[0];
assert.deepEqual(['PAV', 'CIE'].map(f => estadoPartida(derivada.tasks.find(x => x.field === f))), ['Con observaciones', 'Instalado y conforme']);
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
console.log(JSON.stringify({checks: 'passed', scope: 'Rombo interactivo: estados de ejecución con color, registro de una partida conservando las demás, conformidad solo instalada, observaciones sin texto obligatorio, responsable obligatorio, estado calculado desde las partidas, fuente cambiada, partidas sin definición y dibujo con seis secciones, código, estado y observaciones pendientes.'}));
