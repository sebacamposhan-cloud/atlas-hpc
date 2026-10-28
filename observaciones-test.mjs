import assert from 'node:assert/strict';
import * as M from './dist/observaciones-model.mjs';

// Reglas de las observaciones en terreno: datos obligatorios, transiciones con evidencia, vencimientos y resúmenes.
const room = {id: 'n01-a501:5.1.1.1.1-1', code: '5.1.1.1.1-1', name: 'Oficina Secretaría'}, source = {code: 'HPC-ARQ-PLA-N01-A-501', revision: 'Rev01_V3'};
const valores = {descripcion: ' Sello perimetral incompleto ', terminacion: 'PAV', codigo: '108', categoria: 'Pavimento', prioridad: 'Alta', responsable: ' Subcontrato QA ', plazo: '2026-10-20', autor: ' QA '};
const o = M.nuevaObservacion(valores, room, source, 'N01', 'obs-1', '2026-10-01T12:00:00.000Z');
assert.equal(o.estado, 'Abierta'); assert.equal(o.descripcion, 'Sello perimetral incompleto'); assert.equal(o.responsable, 'Subcontrato QA'); assert.equal(o.autor, 'QA');
assert.deepEqual(o.room, {id: room.id, code: room.code, name: room.name, source: source.code, revision: source.revision}, 'la observación conserva la referencia del recinto y su lámina');
for (const [campo, valor] of [['descripcion', '  '], ['autor', ''], ['categoria', 'Inventada'], ['terminacion', 'M9'], ['plazo', '2026-02-30']]) assert.throws(() => M.nuevaObservacion({...valores, [campo]: valor}, room, source, 'N01', 'x'), undefined, campo);

// Transiciones: no se cierra sin pasar por «Corregida»; corregir exige foto «después» o comentario; descartar y reabrir exigen motivo.
const at = '2026-10-05T09:00:00.000Z';
assert.throws(() => M.cambiarEstado(o, 'Cerrada', {autor: 'QA', at}), /No se puede pasar/);
assert.throws(() => M.cambiarEstado(o, 'Corregida', {autor: 'QA', at}), /foto «después» o un comentario/);
assert.throws(() => M.cambiarEstado(o, 'Descartada', {autor: 'QA', at}), /por qué se descarta/);
assert.throws(() => M.cambiarEstado(o, 'En corrección', {autor: ' ', at}), /quién hace el cambio/);
const conFoto = {...o, fotos: [{id: 'f1', tipo: 'despues', at, autor: 'QA'}]};
const corregida = M.cambiarEstado(conFoto, 'Corregida', {autor: 'QA', at});
assert.equal(corregida.observacion.estado, 'Corregida'); assert.equal(corregida.observacion.version, 2); assert.equal(corregida.historial.detalle, 'Abierta → Corregida');
assert.equal(M.cambiarEstado(o, 'Corregida', {autor: 'QA', comentario: 'Se selló', at}).observacion.estado, 'Corregida', 'un comentario basta como evidencia');
const cerrada = M.cambiarEstado(corregida.observacion, 'Cerrada', {autor: 'Jefe de terreno', at: '2026-10-11T09:00:00.000Z'}).observacion;
assert.equal(cerrada.cerrada, '2026-10-11T09:00:00.000Z');
assert.throws(() => M.cambiarEstado(cerrada, 'Abierta', {autor: 'QA', at}), /por qué se reabre/);
assert.equal(M.cambiarEstado(cerrada, 'Abierta', {autor: 'QA', comentario: 'Reapareció la falla', at}).observacion.cerrada, null, 'reabrir borra la fecha de cierre');
assert.throws(() => M.validarObservacion({...cerrada, cerrada: null}), /fecha de cierre/);
assert.throws(() => M.validarObservacion({...o, fotos: Array.from({length: M.MAX_FOTOS + 1}, (_, i) => ({id: 'f' + i, tipo: 'antes', at, autor: 'QA'}))}), /Máximo/);
assert.throws(() => M.validarObservacion({...o, fotos: [{id: 'f', tipo: 'antes', at, autor: 'QA'}, {id: 'f', tipo: 'antes', at, autor: 'QA'}]}), /Foto mal registrada/);

// Vencimientos, estado del recinto para la capa y resumen del panel.
const hoy = '2026-10-27';
assert(M.vencida(o, hoy)); assert(!M.vencida(cerrada, hoy)); assert(!M.vencida({...o, plazo: null}, hoy)); assert(!M.vencida({...o, plazo: hoy}, hoy), 'el día del plazo aún no está vencida');
assert.equal(M.estadoRecinto([], hoy), 'Sin observaciones');
assert.equal(M.estadoRecinto([cerrada, o], hoy), 'Con vencidas');
assert.equal(M.estadoRecinto([cerrada, {...o, plazo: null}], hoy), 'Abiertas');
assert.equal(M.estadoRecinto([cerrada, corregida.observacion], hoy), 'Corregidas por verificar');
assert.equal(M.estadoRecinto([cerrada], hoy), 'Cerradas');
const otra = {...M.nuevaObservacion({...valores, responsable: ''}, {...room, id: 'r2', code: '5.1.1.1.2-1'}, source, 'N01', 'obs-2', '2026-10-01T12:00:00.000Z'), plazo: null};
const r = M.resumen([o, cerrada, otra], hoy);
assert.equal(r.total, 3); assert.equal(r.pendientes, 2); assert.equal(r.vencidas, 1); assert.equal(r.recintos, 2); assert.equal(r.porEstado.Cerrada, 1);
assert.equal(Math.round(r.diasCierre), 10, 'días entre el registro y el cierre');
assert.deepEqual(r.porResponsable.map(([k, v]) => [k, v.pendientes, v.vencidas]), [['Subcontrato QA', 1, 1], ['Sin responsable', 1, 0]]);
console.log(JSON.stringify({checks: 'passed', scope: 'Observaciones en terreno: datos obligatorios, referencia del recinto, transiciones con evidencia (foto «después» o comentario), motivo para descartar o reabrir, fecha de cierre, máximo de fotos, vencimientos, estado del recinto y resumen por responsable.'}));
